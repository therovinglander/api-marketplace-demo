import { describe, expect, it } from "vitest";
import { evaluateCache } from "@/lib/pricing/cache";
import type { Inputs } from "@/lib/pricing/calculator";
import { CACHE_EXPLAINER, LOSES_MONEY_NOTE, breakEvenLine } from "@/lib/pricing/cacheCopy";

const defaults: Inputs = { S: 5_000_000, r: 1000, c: 0.85, h: 0.3 };
const cps = 0.000132;

describe("cache page copy (U2)", () => {
  it("break-even at the defaults is $408 / 1.5M = $0.000272, shown to 6 decimals", () => {
    const res = evaluateCache(defaults, 10, cps);
    expect(res.breakEvenCostPerSearch).toBeCloseTo(0.000272, 9);
    const line = breakEvenLine(res, cps);
    expect(line).toContain("above $0.000272.");
    expect(line).toContain("Today's illustrative cost is $0.000132.");
  });
  it("two decimals would have hidden it", () => {
    expect((0.000272).toFixed(2)).toBe("0.00");
  });
  it("hit rate 0: null break-even gives the no-searches sentence and never prints NaN or Infinity", () => {
    const res = evaluateCache({ ...defaults, h: 0 }, 10, cps);
    expect(res.breakEvenCostPerSearch).toBeNull();
    const line = breakEvenLine(res, cps);
    expect(line).toBe("No searches are served from cache, so there is nothing to break even on.");
    expect(line).not.toMatch(/NaN|Infinity/);
  });
  it("net is negative at the defaults, which is when the loses-money note applies", () => {
    expect(evaluateCache(defaults, 10, cps).net).toBeLessThan(0);
    expect(LOSES_MONEY_NOTE).toContain("speed and avoiding supplier excess-search fees");
  });
  it("net turns positive when supplier cost is above break-even, and the note would not show", () => {
    const res = evaluateCache(defaults, 10, 0.0005);
    expect(res.net).toBeGreaterThan(0);
  });
  it("the explainer has three paragraphs and says the parameters are illustrative", () => {
    expect(CACHE_EXPLAINER).toHaveLength(3);
    expect(CACHE_EXPLAINER[2]).toContain("illustrative");
  });
});
