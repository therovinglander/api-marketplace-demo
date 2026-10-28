import { describe, expect, it } from "vitest";
import { DEFAULT_CACHE, evaluateCache, staleRate, sweepTtl, validateCache } from "@/lib/pricing/cache";
import type { Inputs } from "@/lib/pricing/calculator";

const defaults: Inputs = { S: 5_000_000, r: 1000, c: 0.85, h: 0.3 };
const cps = 0.000132;

describe("cache toggle", () => {
  it("h=0.3, ttl=10: stale 0.024, 102 failed checkouts, $408", () => {
    const r = evaluateCache(defaults, 10, cps);
    expect(r.staleRate).toBeCloseTo(0.024, 9);
    expect(r.failedCheckouts).toBeCloseTo(102, 6);
    expect(r.failedCheckoutCost).toBeCloseTo(408, 6);
  });
  it("saving = hits x supplier cost per search; net can be negative at cheap upstream cost", () => {
    const r = evaluateCache(defaults, 10, cps);
    expect(r.upstreamCallsAvoided).toBe(1_500_000);
    expect(r.upstreamSaving).toBeCloseTo(198, 6);
    expect(r.net).toBeCloseTo(198 - 408, 6);
  });
  it("break-even supplier cost per search is where net = 0", () => {
    const r = evaluateCache(defaults, 10, cps);
    const be = r.breakEvenCostPerSearch!;
    expect(evaluateCache(defaults, 10, be).net).toBeCloseTo(0, 6);
  });
  it("stale rate is capped at 0.12", () => {
    expect(staleRate(60, 0.9)).toBe(0.12);
    expect(staleRate(60, 0.9)).toBe(DEFAULT_CACHE.staleCap);
  });
  it("stale rate grows with ttl and with hit rate (below the cap)", () => {
    expect(staleRate(20, 0.3)).toBeGreaterThan(staleRate(10, 0.3));
    expect(staleRate(10, 0.6)).toBeGreaterThan(staleRate(10, 0.3));
  });
  it("hit rate 0: no saving, no break-even, still counts the (tiny) stale rate", () => {
    const r = evaluateCache({ ...defaults, h: 0 }, 10, cps);
    expect(r.upstreamSaving).toBe(0);
    expect(r.breakEvenCostPerSearch).toBeNull();
    expect(r.net).toBeLessThan(0);
  });
  it("flags a hit rate above the vendor claim", () => {
    expect(evaluateCache({ ...defaults, h: 0.8 }, 10, cps).overVendorClaim).toBe(true);
    expect(evaluateCache(defaults, 10, cps).overVendorClaim).toBe(false);
  });
  it("sweep returns one row per ttl", () => {
    expect(sweepTtl(defaults, [1, 5, 10], cps).map((r) => r.ttlMinutes)).toEqual([1, 5, 10]);
  });
  it("validates ranges", () => {
    expect(validateCache(0.3, 10)).toEqual([]);
    expect(validateCache(0.95, 10)).toHaveLength(1);
    expect(validateCache(0.3, 0)).toHaveLength(1);
    expect(validateCache(Number.NaN, 100)).toHaveLength(2);
  });
});
