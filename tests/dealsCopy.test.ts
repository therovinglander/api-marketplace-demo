import { describe, expect, it } from "vitest";
import { DEALS_SCOPE, DEALS_WHO, DEALS_WHY, DEAL_TERMS } from "@/lib/pricing/dealsCopy";
import { dealQuote } from "@/lib/pricing/deals";

const cost = { costPerSearch: 0.000132, costPerBooking: 0.214 };
const usage = { S: 60_000_000, r: 2000, c: 0.85, h: 0.3 };

describe("deals page copy (U4) matches the pricing behaviour it describes", () => {
  it("states who uses it, both whys and the Search-only scope", () => {
    expect(DEALS_WHO).toContain("deal desk");
    expect(DEALS_WHY.map((w) => w.label)).toEqual(["Why commitments:", "Why versions:"]);
    expect(DEALS_SCOPE).toContain("Search capability only");
    expect(DEALS_SCOPE).toContain("illustrative");
  });
  it("defines the three terms", () => {
    expect(DEAL_TERMS.map((t) => t.term)).toEqual(["Graduated discount", "Overage at list", "Take-or-pay"]);
  });
  it("graduated: committing more never lowers the bill's discount slice (bill falls up to usage)", () => {
    const bill = (c: number) => dealQuote(usage, 0.0004, c, cost).dealBill;
    expect(bill(60_000_000)).toBeLessThan(bill(10_000_000));
    expect(bill(10_000_000)).toBeLessThan(bill(1_000_000));
  });
  it("overage at list: usage above the commitment bills those searches at the list rate", () => {
    const q = dealQuote(usage, 0.0004, 50_000_000, cost);
    const covered = dealQuote({ ...usage, S: 50_000_000 }, 0.0004, 50_000_000, cost).dealBill;
    expect(q.dealBill - covered).toBeCloseTo(10_000_000 * 0.0004, 6);
  });
  it("take-or-pay: unused commitment is still billed and flagged as a shortfall", () => {
    const q = dealQuote({ ...usage, S: 20_000_000 }, 0.0004, 60_000_000, cost);
    expect(q.shortfall).toBe(true);
    expect(q.dealBill).toBeCloseTo(dealQuote({ ...usage, S: 60_000_000 }, 0.0004, 60_000_000, cost).dealBill, 6);
  });
});
