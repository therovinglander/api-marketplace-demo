import { describe, expect, it } from "vitest";
import path from "node:path";
import { FileRepo } from "@/lib/repo/file";
import { auditFor } from "@/lib/repo/audit";
import { ConflictError } from "@/lib/repo/types";
import { blendSuppliers, type Inputs } from "@/lib/pricing/calculator";
import { dealQuote, discountForCommitment, marginalBill } from "@/lib/pricing/deals";
import { activeBook, buildLines, DealValidationError, editPriceBook, listVersions } from "@/lib/pricing/dealsService";

const seedDir = path.join(__dirname, "..", "seed");
const repo = () => new FileRepo({ seedDir });
const cost = blendSuppliers([
  { costPerSearch: 0.00012, costPerBooking: 0.2, weight: 0.5 },
  { costPerSearch: 0.00018, costPerBooking: 0.28, weight: 0.3 },
  { costPerSearch: 0.00009, costPerBooking: 0.15, weight: 0.2 },
]);

describe("discount tiers", () => {
  it.each([
    [0, 0],
    [999_999, 0],
    [1_000_000, 8],
    [9_999_999, 8],
    [10_000_000, 15],
    [60_000_000, 15],
    [100_000_000, 15],
    [100_000_001, 22],
    [500_000_000, 22],
  ])("committed %i -> %i%%", (v, pct) => {
    expect(discountForCommitment(v)).toBe(pct);
  });
  it("rejects negative / non-finite", () => {
    expect(() => discountForCommitment(-1)).toThrow(RangeError);
    expect(() => discountForCommitment(Number.NaN)).toThrow(RangeError);
  });
});

describe("deal quote", () => {
  it("bank: 60M committed -> graduated discount, tier reached is 15%", () => {
    const i: Inputs = { S: 60_000_000, r: 2000, c: 0.85, h: 0.3 };
    const q = dealQuote(i, 0.0004, 60_000_000, cost);
    expect(q.discountPct).toBe(15);
    expect(q.listBill).toBeCloseTo(24000, 6);
    // 1M at list + 9M at 8% off + 50M at 15% off = 51.78M list-equivalent searches x $0.0004
    expect(q.dealBill).toBeCloseTo(20712, 6);
    expect(q.partnerSavings).toBeCloseTo(3288, 6);
    expect(q.effectiveRate).toBeCloseTo(0.0003452, 9);
    expect(q.blendedDiscountPct).toBeCloseTo(13.7, 1);
    expect(q.marginWithDeal).toBeLessThan(q.marginAtList);
    expect(q.shortfall).toBe(false);
  });
  it("agency: no commitment -> no discount, list price", () => {
    const i: Inputs = { S: 800_000, r: 1000, c: 0.85, h: 0.3 };
    const q = dealQuote(i, 0.0004, 0, cost);
    expect(q.discountPct).toBe(0);
    expect(q.dealBill).toBeCloseTo(q.listBill, 9);
  });
  it("take-or-pay: below the commitment the partner still pays for the committed volume", () => {
    const i: Inputs = { S: 5_000_000, r: 1000, c: 0.85, h: 0.3 };
    const q = dealQuote(i, 0.0004, 10_000_000, cost);
    expect(q.shortfall).toBe(true);
    expect(q.billedSearches).toBe(10_000_000);
    expect(q.dealBill).toBeCloseTo((1_000_000 + 9_000_000 * 0.92) * 0.0004, 6);
    expect(q.partnerSavings).toBeLessThan(0); // a commitment the partner doesn't use costs them more than list
  });
  it("no cliff: committing more never lowers the bill (the old all-units 9.5M vs 10M case)", () => {
    const at = (v: number) => dealQuote({ S: 9_500_000, r: 1000, c: 0.85, h: 0.3 }, 0.0004, v, cost).dealBill;
    expect(at(10_000_000)).toBeGreaterThan(at(9_500_000));
    expect(at(100_000_001)).toBeGreaterThan(at(100_000_000));
  });
  it("m11: no commitment means no discount, however large the actual volume", () => {
    const q = dealQuote({ S: 60_000_000, r: 2000, c: 0.85, h: 0.3 }, 0.0004, 0, cost);
    expect(q.dealBill).toBeCloseTo(24000, 6);
    expect(q.partnerSavings).toBeCloseTo(0, 9);
    expect(q.blendedDiscountPct).toBeCloseTo(0, 9);
  });
  it("marginalBill is monotonic across every tier boundary", () => {
    const edges = [0, 999_999, 1_000_000, 1_000_001, 9_999_999, 10_000_000, 10_000_001, 100_000_000, 100_000_001, 500_000_000];
    const bills = edges.map((v) => marginalBill(v, 0.0004));
    for (let k = 1; k < bills.length; k++) expect(bills[k]).toBeGreaterThanOrEqual(bills[k - 1]);
    expect(marginalBill(0, 0.0004)).toBe(0);
  });
});

describe("price book versioning", () => {
  it("seed: agency and bank each start at v1 active", async () => {
    const r = repo();
    expect((await activeBook(r, "p_bank"))?.version).toBe(1);
    expect((await activeBook(r, "p_agency"))?.version).toBe(1);
  });

  it("edit creates v2, v1 becomes superseded, one audit entry", async () => {
    const r = repo();
    const v2 = await editPriceBook(r, "p_bank", 1, 120_000_000, "tester", undefined);
    expect(v2.version).toBe(2);
    expect(v2.supersedes).toBe("pb_p_bank_v1");
    const versions = await listVersions(r, "p_bank");
    expect(versions.map((v) => [v.version, v.status])).toEqual([[2, "active"], [1, "superseded"]]);
    expect((v2.lines as { discountPct: number }[])[0].discountPct).toBe(22);
    const audit = (await r.find("audit_log")).filter((a) => a.action === "pricebook_versioned");
    expect(audit).toHaveLength(1);
    expect((await auditFor(r, "price_book", "pb_p_bank_v2"))).toHaveLength(1);
  });

  it("sequential edit on a stale base version -> ConflictError (HTTP 409); only one v2 exists", async () => {
    const r = repo();
    await editPriceBook(r, "p_bank", 1, 120_000_000, "a", undefined);
    await expect(editPriceBook(r, "p_bank", 1, 1_000_000, "b", undefined)).rejects.toBeInstanceOf(ConflictError);
    expect((await listVersions(r, "p_bank")).length).toBe(2);
  });

  it("the unique {partnerId, version} index backstops a raw duplicate insert", async () => {
    const r = repo();
    await expect(r.insert("price_books", { _id: "x", partnerId: "p_bank", version: 1 })).rejects.toBeInstanceOf(ConflictError);
  });

  it("a failed edit leaves nothing behind (no new version, no audit)", async () => {
    const r = repo();
    await expect(editPriceBook(r, "p_bank", 7, 1_000_000, "a", undefined)).rejects.toBeInstanceOf(ConflictError);
    expect((await listVersions(r, "p_bank")).length).toBe(1);
    expect((await r.find("audit_log")).length).toBe(0);
  });

  it("ignores any client-supplied discount: it is recomputed from the tier", () => {
    expect(buildLines(10_000_000)[0].discountPct).toBe(15);
  });

  it("validates input and partner", async () => {
    const r = repo();
    expect(() => buildLines(-5)).toThrow(DealValidationError);
    expect(() => buildLines(Number.NaN)).toThrow(DealValidationError);
    await expect(editPriceBook(r, "p_nobody", 0, 1, "a", undefined)).rejects.toBeInstanceOf(DealValidationError);
  });
});
