// Versioned price books. Editing = insert version+1, mark previous superseded, audit: one transaction.
import { appendAudit } from "@/lib/repo/audit";
import { ConflictError, type Doc, type Repo } from "@/lib/repo/types";
import { discountForCommitment } from "./deals";

export const SEARCH_RATE_PLAN = "rp_search_per_search";

export interface PriceBookLine {
  capabilityId: string;
  ratePlanId: string;
  committedMonthlyVolume: number;
  discountPct: number;
}

export class DealValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DealValidationError";
  }
}

export async function listVersions(repo: Repo, partnerId: string): Promise<Doc[]> {
  const rows = await repo.find("price_books", { partnerId });
  return rows.sort((a, b) => Number(b.version) - Number(a.version));
}

export async function activeBook(repo: Repo, partnerId: string): Promise<Doc | null> {
  return (await listVersions(repo, partnerId)).find((b) => b.status === "active") ?? null;
}

/** Discounts are always recomputed from the tier table: a client can never set its own discount. */
export function buildLines(committedMonthlyVolume: number): PriceBookLine[] {
  if (typeof committedMonthlyVolume !== "number" || !Number.isFinite(committedMonthlyVolume) || committedMonthlyVolume < 0) {
    throw new DealValidationError("committedMonthlyVolume must be a non-negative number");
  }
  if (committedMonthlyVolume > 10_000_000_000) throw new DealValidationError("committedMonthlyVolume is unreasonably large");
  return [
    {
      capabilityId: "search",
      ratePlanId: SEARCH_RATE_PLAN,
      committedMonthlyVolume,
      discountPct: discountForCommitment(committedMonthlyVolume),
    },
  ];
}

/**
 * Create version+1 for a partner.
 * `baseVersion` is the version the editor was looking at; if someone else has edited since, this throws
 * ConflictError (HTTP 409). The unique {partnerId, version} index is the backstop for true races.
 */
export async function editPriceBook(
  repo: Repo,
  partnerId: string,
  baseVersion: number,
  committedMonthlyVolume: number,
  actor: string,
  note: string | undefined,
  now: Date = new Date(),
): Promise<Doc> {
  const lines = buildLines(committedMonthlyVolume);
  return repo.transact(async (tx) => {
    const partner = await tx.findOne("partners", { _id: partnerId });
    if (!partner) throw new DealValidationError(`unknown partner ${partnerId}`);
    const versions = await listVersions(tx, partnerId);
    const latest = versions[0];
    const latestVersion = latest ? Number(latest.version) : 0;
    if (baseVersion !== latestVersion) {
      throw new ConflictError(`price book changed: you edited v${baseVersion} but the latest is v${latestVersion}`);
    }
    const next: Doc = {
      _id: `pb_${partnerId}_v${latestVersion + 1}`,
      partnerId,
      version: latestVersion + 1,
      status: "active",
      effectiveFrom: now.toISOString(),
      supersedes: latest?._id ?? null,
      lines,
      illustrative: true,
    };
    await tx.insert("price_books", next); // unique {partnerId, version}: a concurrent writer gets ConflictError
    if (latest) await tx.update("price_books", latest._id, { status: "superseded" });
    await appendAudit(
      tx,
      {
        entity: "price_book",
        entityId: next._id,
        action: "pricebook_versioned",
        actor,
        reason: note?.trim() || `New version v${latestVersion + 1} for ${String(partner.name)}: committed volume ${committedMonthlyVolume.toLocaleString("en-US")} searches/month.`,
        details: { partnerId, from: latest?._id ?? null, to: next._id, lines, previousLines: latest?.lines ?? null },
      },
      now,
    );
    return next;
  });
}
