import { describe, expect, it } from "vitest";
import path from "node:path";
import { FileRepo } from "@/lib/repo/file";
import { ConflictError } from "@/lib/repo/types";
import { editPriceBook, listVersions } from "@/lib/pricing/dealsService";
import { decideProposal, DecisionConflictError, generateProposals } from "@/lib/matching/service";

const seedDir = path.join(__dirname, "..", "seed");
const repo = () => new FileRepo({ seedDir });

async function firstProposal(r: FileRepo): Promise<string> {
  await generateProposals(r);
  const open = (await r.find("match_proposals")).sort((a, b) => Number(b.score) - Number(a.score));
  return open[0]._id;
}

describe("FileRepo transactions are isolated (real concurrency)", () => {
  it("two concurrent price book edits on the same base: one wins, one 409, winner's version and audit survive", async () => {
    const r = repo();
    const res = await Promise.allSettled([
      editPriceBook(r, "p_bank", 1, 120_000_000, "a", undefined),
      editPriceBook(r, "p_bank", 1, 1_000_000, "b", undefined),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rejected = res.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);
    const versions = await listVersions(r, "p_bank");
    expect(versions.map((v) => [v.version, v.status])).toEqual([[2, "active"], [1, "superseded"]]);
    expect((await r.find("audit_log")).filter((a) => a.action === "pricebook_versioned")).toHaveLength(1);
  });

  it("two concurrent approves of one proposal: one real decision, one no-op, one canonical hotel, one approved audit entry", async () => {
    const r = repo();
    const id = await firstProposal(r);
    const res = await Promise.allSettled([
      decideProposal(r, id, "approve", "a", undefined),
      decideProposal(r, id, "approve", "b", undefined),
    ]);
    expect(res.every((x) => x.status === "fulfilled")).toBe(true);
    const flags = res.map((x) => (x as PromiseFulfilledResult<{ alreadyDecided: boolean }>).value.alreadyDecided).sort();
    expect(flags).toEqual([false, true]);
    expect((await r.find("canonical_hotels")).filter((c) => (c.memberIds as string[]).length > 0)).toHaveLength(1);
    expect((await r.find("audit_log")).filter((a) => a.entityId === id && a.action === "approved")).toHaveLength(1);
  });

  it("concurrent approve vs reject: exactly one wins, the loser is refused (409), and the audit log agrees with the row", async () => {
    const r = repo();
    const id = await firstProposal(r);
    const res = await Promise.allSettled([
      decideProposal(r, id, "approve", "a", undefined),
      decideProposal(r, id, "reject", "b", undefined),
    ]);
    const final = (await r.findOne("match_proposals", { _id: id }))!;
    const decisions = (await r.find("audit_log")).filter((a) => a.entityId === id && (a.action === "approved" || a.action === "rejected"));
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe(final.status === "approved" ? "approved" : "rejected");
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const lost = res.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(DecisionConflictError);
  });

  it("D7: reject after approve is refused with DecisionConflictError and changes nothing; the same decision stays a no-op", async () => {
    const r = repo();
    const id = await firstProposal(r);
    await decideProposal(r, id, "approve", "a", undefined);
    const auditBefore = (await r.find("audit_log")).length;
    await expect(decideProposal(r, id, "reject", "b", undefined)).rejects.toBeInstanceOf(DecisionConflictError);
    await expect(decideProposal(r, id, "reject", "b", undefined)).rejects.toBeInstanceOf(ConflictError);
    expect((await r.findOne("match_proposals", { _id: id }))?.status).toBe("approved");
    const same = await decideProposal(r, id, "approve", "c", undefined);
    expect(same.alreadyDecided).toBe(true);
    expect((await r.find("audit_log")).length).toBe(auditBefore);
  });

  it("approve after reject is refused too", async () => {
    const r = repo();
    const id = await firstProposal(r);
    await decideProposal(r, id, "reject", "a", undefined);
    await expect(decideProposal(r, id, "approve", "b", undefined)).rejects.toBeInstanceOf(DecisionConflictError);
    expect((await r.find("canonical_hotels")).filter((c) => (c.memberIds as string[]).length > 0)).toHaveLength(0);
  });

  it("a nested transact inside a transaction does not deadlock", async () => {
    const r = repo();
    const out = await r.transact(async (tx) => tx.transact(async () => 42));
    expect(out).toBe(42);
  });

  it("a failed transaction does not poison the queue and does not roll back a later committed one", async () => {
    const r = repo();
    const bad = r.transact(async (tx) => {
      await tx.insert("app_config", { _id: "x1" });
      throw new Error("boom");
    });
    const good = r.transact(async (tx) => {
      await tx.insert("app_config", { _id: "x2" });
    });
    await expect(bad).rejects.toThrow("boom");
    await good;
    expect(await r.findOne("app_config", { _id: "x1" })).toBeNull();
    expect(await r.findOne("app_config", { _id: "x2" })).not.toBeNull();
  });
});
