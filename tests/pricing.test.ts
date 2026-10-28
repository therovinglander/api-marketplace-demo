import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  allBreakEvens,
  blendSuppliers,
  bill,
  breakEven,
  compareModels,
  confirmedBookings,
  effectiveL2B,
  supplierCost,
  validateInputs,
  type Inputs,
  type PlanParams,
} from "@/lib/pricing/calculator";
import { evaluateTier } from "@/lib/pricing/tiers";
import { loadPricingContext, plansFor } from "@/lib/pricing/load";
import { FileRepo } from "@/lib/repo/file";

const plans: PlanParams = {
  flat: { F: 12000 },
  perSearch: { p: 0.0004 },
  perBooking: { q: 0.65 },
  hybrid: { F: 3000, A: 1500, e: 0.005 },
};
const cost = blendSuppliers([
  { costPerSearch: 0.00012, costPerBooking: 0.2, weight: 0.5 },
  { costPerSearch: 0.00018, costPerBooking: 0.28, weight: 0.3 },
  { costPerSearch: 0.00009, costPerBooking: 0.15, weight: 0.2 },
]);
const defaults: Inputs = { S: 5_000_000, r: 1000, c: 0.85, h: 0.3 };

describe("calculator defaults (architect worked example)", () => {
  it("blends supplier costs 0.5/0.3/0.2", () => {
    expect(cost.costPerSearch).toBeCloseTo(0.000132, 9);
    expect(cost.costPerBooking).toBeCloseTo(0.214, 9);
  });
  it("confirmed bookings and effective L2B", () => {
    expect(confirmedBookings(defaults)).toBeCloseTo(4250, 9);
    expect(effectiveL2B(defaults)).toBeCloseTo(1176.4706, 3);
  });
  it("supplier cost = $462.00 + $909.50 = $1,371.50", () => {
    expect(supplierCost(defaults, cost)).toBeCloseTo(1371.5, 6);
  });
  it("pins each model's bill", () => {
    expect(bill("flat", plans, defaults)).toBe(12000);
    expect(bill("per_search", plans, defaults)).toBeCloseTo(2000, 6);
    expect(bill("per_booking", plans, defaults)).toBeCloseTo(2762.5, 6);
    // effective L2B 1,176 < allowance 1,500, so no excess
    expect(bill("hybrid", plans, defaults)).toBeCloseTo(3000, 6);
  });
  it("margin and cost per booking", () => {
    const rows = compareModels(defaults, plans, cost);
    const ps = rows.find((r) => r.model === "per_search")!;
    expect(ps.margin).toBeCloseTo(2000 - 1371.5, 6);
    expect(ps.marginPct).toBeCloseTo((2000 - 1371.5) / 2000, 9);
    expect(ps.costPerBooking).toBeCloseTo(2000 / 4250, 9);
  });
  it("does not round intermediate values (5-dp unit rates survive)", () => {
    expect(supplierCost({ S: 10_000, r: 50, c: 1, h: 0 }, { costPerSearch: 0.00009, costPerBooking: 0 })).toBeCloseTo(0.9, 9);
  });
});

describe("hybrid excess", () => {
  it("charges excess once effective L2B exceeds the allowance", () => {
    const i: Inputs = { S: 5_000_000, r: 2000, c: 0.85, h: 0.3 };
    // excess searches = S*(1 - A*c/r) = 5M*(1-0.6375) = 1,812,500 ; x $0.005 = 9,062.50
    expect(bill("hybrid", plans, i)).toBeCloseTo(3000 + 9062.5, 6);
  });
});

describe("break-even", () => {
  it("flat vs per-search = 30M searches", () => {
    expect(breakEven("flat", "per_search", plans, defaults)).toBeCloseTo(30_000_000, 3);
  });
  it("flat vs per-booking", () => {
    expect(breakEven("flat", "per_booking", plans, defaults)).toBeCloseTo(12000 / (0.65 * 0.00085), 3);
  });
  it("is the volume where both bills are equal", () => {
    const s = breakEven("flat", "per_booking", plans, defaults)!;
    const i = { ...defaults, S: s };
    expect(bill("flat", plans, i)).toBeCloseTo(bill("per_booking", plans, i), 6);
  });
  it("returns null for parallel lines (flat vs hybrid with no excess)", () => {
    expect(breakEven("flat", "hybrid", plans, defaults)).toBeNull();
  });
  it("returns null when lines meet at S=0 (per-search vs per-booking)", () => {
    expect(breakEven("per_search", "per_booking", plans, defaults)).toBeNull();
  });
  it("returns null when the crossover is outside the input range", () => {
    expect(breakEven("flat", "per_search", plans, defaults, [10_000, 20_000_000])).toBeNull();
  });
  it("hybrid vs flat crosses at ~4.97M when r=2000", () => {
    expect(breakEven("flat", "hybrid", plans, { r: 2000, c: 0.85 })).toBeCloseTo(9000 / 0.0018125, 0);
  });
  it("lists all 6 pairs", () => {
    expect(allBreakEvens(plans, defaults)).toHaveLength(6);
  });
});

describe("validateInputs", () => {
  it("accepts defaults", () => expect(validateInputs(defaults)).toEqual([]));
  it("rejects out of range and non-numbers", () => {
    const errs = validateInputs({ S: 5, r: "x", c: 0.2, h: 0.95 });
    expect(errs).toHaveLength(4);
  });
});

describe("excess-search tiers", () => {
  const pricing = { capabilityId: "pricing", F: 2000, A: 800, e: 0.01, supplierCostPerCall: 0.00006, supplierCostPerBooking: 0, cacheable: false };
  const search = { capabilityId: "search", F: 3000, A: 1500, e: 0.005, supplierCostPerCall: 0.000132, supplierCostPerBooking: 0.214, cacheable: true };
  it("no excess under the allowance", () => {
    const r = evaluateTier(search, defaults);
    expect(r.overAllowance).toBe(false);
    expect(r.excessSearches).toBe(0);
    expect(r.bill).toBe(3000);
    expect(r.margin).toBeCloseTo(3000 - 1371.5, 6);
  });
  it("excess above the allowance: bill vs bill without the fee", () => {
    const r = evaluateTier(pricing, defaults);
    // 5M - 4250*800 = 1.6M excess searches x $0.01
    expect(r.excessSearches).toBeCloseTo(1_600_000, 3);
    expect(r.excessCharge).toBeCloseTo(16000, 3);
    expect(r.bill).toBeCloseTo(18000, 3);
    expect(r.billWithoutExcessFee).toBe(2000);
    expect(r.overAllowance).toBe(true);
    expect(r.marginWithoutExcessFee).toBeLessThan(r.margin);
  });
});

describe("seeded context", () => {
  it("reproduces the worked example from the seed files", async () => {
    const repo = new FileRepo({ seedDir: path.join(__dirname, "..", "seed") });
    const ctx = await loadPricingContext(repo);
    expect(ctx.blended.costPerSearch).toBeCloseTo(0.000132, 9);
    const p = plansFor(ctx, "agency");
    expect(bill("flat", p, defaults)).toBe(12000);
    expect(plansFor(ctx, "bank").flat.F).toBe(60000);
    expect(ctx.tiers.map((t) => t.capabilityId)).toEqual(["search", "content-mapping", "pricing"]);
  });
});
