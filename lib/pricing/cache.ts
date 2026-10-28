// Feature 3: cache toggle. Trade freshness against cost. All parameters are invented (illustrative).
//   stale = min(cap, base * ttlMinutes * (1 + 2*h))      probability a cached price has changed by checkout
//   failed checkouts = Bc * stale ; cost = failed * failedCheckoutCost
import { confirmedBookings, type Inputs } from "./calculator";

export interface CacheConfig {
  /** Cache hit-rate slider upper bound */
  hitRateMax: number;
  /** Vendor-claimed ceiling ("up to ~70% of upstream calls"); shown as a claim, not a fact */
  hitRateVendorClaim: number;
  staleCap: number;
  staleBase: number;
  failedCheckoutCost: number;
}

export const DEFAULT_CACHE: CacheConfig = {
  hitRateMax: 0.9,
  hitRateVendorClaim: 0.7,
  staleCap: 0.12,
  staleBase: 0.0015,
  failedCheckoutCost: 4,
};

export const TTL_RANGE = [1, 60] as const;

export function staleRate(ttlMinutes: number, h: number, cfg: CacheConfig = DEFAULT_CACHE): number {
  return Math.min(cfg.staleCap, cfg.staleBase * ttlMinutes * (1 + 2 * h));
}

export interface CacheResult {
  staleRate: number;
  upstreamCallsAvoided: number;
  /** Supplier search cost avoided by serving hits from cache */
  upstreamSaving: number;
  failedCheckouts: number;
  failedCheckoutCost: number;
  /** upstreamSaving - failedCheckoutCost; negative means the cache costs more than it saves */
  net: number;
  /** Supplier cost per search above which this cache setting pays for itself; null if there are no hits */
  breakEvenCostPerSearch: number | null;
  overVendorClaim: boolean;
}

export function validateCache(h: number, ttlMinutes: number, cfg: CacheConfig = DEFAULT_CACHE): string[] {
  const errs: string[] = [];
  if (!Number.isFinite(h) || h < 0 || h > cfg.hitRateMax) errs.push(`hit rate must be between 0 and ${cfg.hitRateMax}`);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < TTL_RANGE[0] || ttlMinutes > TTL_RANGE[1]) {
    errs.push(`ttlMinutes must be between ${TTL_RANGE[0]} and ${TTL_RANGE[1]}`);
  }
  return errs;
}

export function evaluateCache(i: Inputs, ttlMinutes: number, supplierCostPerSearch: number, cfg: CacheConfig = DEFAULT_CACHE): CacheResult {
  const stale = staleRate(ttlMinutes, i.h, cfg);
  const failed = confirmedBookings(i) * stale;
  const failedCost = failed * cfg.failedCheckoutCost;
  const avoided = i.S * i.h;
  const saving = avoided * supplierCostPerSearch;
  return {
    staleRate: stale,
    upstreamCallsAvoided: avoided,
    upstreamSaving: saving,
    failedCheckouts: failed,
    failedCheckoutCost: failedCost,
    net: saving - failedCost,
    breakEvenCostPerSearch: avoided > 0 ? failedCost / avoided : null,
    overVendorClaim: i.h > cfg.hitRateVendorClaim,
  };
}

export function sweepTtl(i: Inputs, ttls: number[], supplierCostPerSearch: number, cfg: CacheConfig = DEFAULT_CACHE) {
  return ttls.map((ttl) => ({ ttlMinutes: ttl, ...evaluateCache(i, ttl, supplierCostPerSearch, cfg) }));
}
