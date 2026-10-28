// Feature 5: committed-volume discounts. Pure functions; versioning lives in dealsService.ts.
//   Tier by committed monthly searches:  < 1M 0% | 1M..<10M 8% | 10M..100M 15% | > 100M 22%
//   Take-or-pay: billed volume = max(actual, committed). All numbers invented.
import { supplierCost, type Inputs, type SupplierCost } from "./calculator";

export interface DiscountTier {
  /** Inclusive lower bound of committed monthly volume */
  from: number;
  discountPct: number;
}

export const DISCOUNT_TIERS: DiscountTier[] = [
  { from: 0, discountPct: 0 },
  { from: 1_000_000, discountPct: 8 },
  { from: 10_000_000, discountPct: 15 },
  // 100M exactly is still 15%: the top tier starts strictly above it
  { from: 100_000_001, discountPct: 22 },
];

export function discountForCommitment(committedMonthlyVolume: number): number {
  if (!Number.isFinite(committedMonthlyVolume) || committedMonthlyVolume < 0) {
    throw new RangeError("committed volume must be a non-negative number");
  }
  let pct = 0;
  for (const t of DISCOUNT_TIERS) if (committedMonthlyVolume >= t.from) pct = t.discountPct;
  return pct;
}

export interface DealQuote {
  committedMonthlyVolume: number;
  discountPct: number;
  billedSearches: number;
  listRate: number;
  effectiveRate: number;
  listBill: number;
  dealBill: number;
  /** listBill - dealBill: what the partner saves versus list at actual volume */
  partnerSavings: number;
  supplierCost: number;
  marginAtList: number;
  marginWithDeal: number;
  /** True when actual volume is below the commitment (partner pays for unused volume) */
  shortfall: boolean;
}

export function dealQuote(i: Inputs, listRatePerSearch: number, committedMonthlyVolume: number, cost: SupplierCost): DealQuote {
  const discountPct = discountForCommitment(committedMonthlyVolume);
  const billedSearches = Math.max(i.S, committedMonthlyVolume);
  const effectiveRate = listRatePerSearch * (1 - discountPct / 100);
  const listBill = i.S * listRatePerSearch;
  const dealBill = billedSearches * effectiveRate;
  const sc = supplierCost(i, cost);
  return {
    committedMonthlyVolume,
    discountPct,
    billedSearches,
    listRate: listRatePerSearch,
    effectiveRate,
    listBill,
    dealBill,
    partnerSavings: listBill - dealBill,
    supplierCost: sc,
    marginAtList: listBill - sc,
    marginWithDeal: dealBill - sc,
    shortfall: i.S < committedMonthlyVolume,
  };
}
