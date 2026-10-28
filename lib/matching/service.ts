// Persistence for dedupe: proposal generation (idempotent) and human approve/reject (transactional, audited).
import { appendAudit } from "@/lib/repo/audit";
import type { Doc, Repo } from "@/lib/repo/types";
import { DEFAULT_MATCHING, proposePairs, type HotelRecord, type MatchingConfig } from "./score";

export const proposalId = (aId: string, bId: string) => `mp_${aId}__${bId}`;

export async function loadConfig(repo: Repo): Promise<MatchingConfig> {
  const doc = await repo.findOne("app_config", { _id: "matching" });
  return doc ? ({ ...DEFAULT_MATCHING, ...(doc as unknown as Partial<MatchingConfig>) } as MatchingConfig) : DEFAULT_MATCHING;
}

export interface GenerateSummary {
  candidates: number;
  created: number;
  refreshed: number;
  skippedDecided: number;
}

/**
 * Idempotent. New pairs are inserted as `proposed` with an audit entry explaining why.
 * Existing `proposed` rows are refreshed in place; approved/rejected rows are never touched.
 */
export async function generateProposals(repo: Repo, now: Date = new Date()): Promise<GenerateSummary> {
  const cfg = await loadConfig(repo);
  const records = (await repo.find("hotel_records")) as unknown as HotelRecord[];
  const proposals = proposePairs(records, cfg);
  const summary: GenerateSummary = { candidates: proposals.length, created: 0, refreshed: 0, skippedDecided: 0 };

  for (const p of proposals) {
    const id = proposalId(p.aId, p.bId);
    const existing = await repo.findOne("match_proposals", { _id: id });
    if (existing && existing.status !== "proposed") {
      summary.skippedDecided++;
      continue;
    }
    const doc: Doc = {
      _id: id,
      aId: p.aId,
      bId: p.bId,
      score: p.result.score,
      tier: p.result.tier,
      signals: p.result.signals,
      weights: p.result.weights,
      reason: p.result.reason,
      ruleVersion: cfg.ruleVersion,
      status: "proposed",
      illustrative: true,
    };
    if (existing) {
      await repo.upsert("match_proposals", { ...existing, ...doc });
      summary.refreshed++;
    } else {
      await repo.transact(async (tx) => {
        await tx.insert("match_proposals", doc);
        await appendAudit(
          tx,
          {
            entity: "match_proposal",
            entityId: id,
            action: "proposed",
            actor: "system",
            reason: p.result.reason,
            details: {
              signals: p.result.signals,
              weights: p.result.weights,
              thresholds: { strong: cfg.strong, review: cfg.review },
              ruleVersion: cfg.ruleVersion,
              phoneReweighted: p.result.phoneReweighted,
              distanceMeters: p.result.distanceMeters,
            },
          },
          now,
        );
      });
      summary.created++;
    }
  }
  return summary;
}

export type Decision = "approve" | "reject";

export interface DecisionResult {
  proposalId: string;
  status: "approved" | "rejected";
  /** True when the proposal was already decided; nothing was written. */
  alreadyDecided: boolean;
  canonicalId?: string;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** One transaction: proposal status + canonical union + audit entry. A repeat decision is a no-op. */
export async function decideProposal(
  repo: Repo,
  id: string,
  decision: Decision,
  actor: string,
  note: string | undefined,
  now: Date = new Date(),
): Promise<DecisionResult> {
  return repo.transact(async (tx) => {
    const proposal = await tx.findOne("match_proposals", { _id: id });
    if (!proposal) throw new NotFoundError(`proposal ${id} not found`);
    if (proposal.status !== "proposed") {
      return { proposalId: id, status: proposal.status as "approved" | "rejected", alreadyDecided: true, canonicalId: undefined };
    }
    const aId = String(proposal.aId);
    const bId = String(proposal.bId);
    const decidedAt = now.toISOString();
    let canonicalId: string | undefined;

    if (decision === "approve") {
      canonicalId = await unionCanonical(tx, aId, bId, id);
    }
    await tx.update("match_proposals", id, {
      status: decision === "approve" ? "approved" : "rejected",
      decidedBy: actor,
      decidedAt,
      decisionNote: note ?? null,
    });
    await appendAudit(
      tx,
      {
        entity: "match_proposal",
        entityId: id,
        action: decision === "approve" ? "approved" : "rejected",
        actor,
        reason: note?.trim() ? note.trim() : `${decision === "approve" ? "Approved" : "Rejected"} by reviewer (no note).`,
        details: {
          score: proposal.score,
          signals: proposal.signals,
          weights: proposal.weights,
          ruleVersion: proposal.ruleVersion,
          canonicalId: canonicalId ?? null,
        },
      },
      now,
    );
    return { proposalId: id, status: decision === "approve" ? "approved" : "rejected", alreadyDecided: false, canonicalId };
  });
}

/** Union semantics: if either member already belongs to a canonical hotel, join it; otherwise create one. */
async function unionCanonical(tx: Repo, aId: string, bId: string, proposalIdValue: string): Promise<string> {
  const all = (await tx.find("canonical_hotels")).filter((c) => Array.isArray(c.memberIds) && (c.memberIds as string[]).length > 0);
  const hits = all.filter((c) => {
    const m = c.memberIds as string[];
    return m.includes(aId) || m.includes(bId);
  });
  if (hits.length === 0) {
    const a = await tx.findOne("hotel_records", { _id: aId });
    const canonicalId = `ch_${all.length + 1}_${aId.replace(/^hr_/, "")}`;
    await tx.insert("canonical_hotels", {
      _id: canonicalId,
      memberIds: [aId, bId],
      name: a?.name ?? null,
      address: a?.address ?? null,
      fromProposalId: proposalIdValue,
      illustrative: true,
    });
    return canonicalId;
  }
  const [keep, ...others] = hits;
  const members = new Set<string>(keep.memberIds as string[]);
  members.add(aId);
  members.add(bId);
  for (const o of others) {
    for (const m of o.memberIds as string[]) members.add(m);
    await tx.update("canonical_hotels", o._id, { memberIds: [], mergedInto: keep._id });
  }
  await tx.update("canonical_hotels", keep._id, { memberIds: [...members] });
  return keep._id;
}
