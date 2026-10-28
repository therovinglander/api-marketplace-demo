// Feature 2: excess-search tiers, per capability.
//   bill = F_cap + S_cap * max(0, 1 - A_cap*c/r) * e_cap     (excess searches = max(0, S - Bc*A))
import { confirmedBookings, effectiveL2B, type Inputs } from "./calculator";

export interface CapabilityTier {
  capabilityId: string;
  /** Platform fee covering the included allowance */
  F: number;
  /** Included look-to-book allowance (searches per confirmed booking) */
  A: number;
  /** Fee per excess search */
  e: number;
  /** Supplier cost per call and per booking for this capability */
  supplierCostPerCall: number;
  supplierCostPerBooking: number;
  cacheable: boolean;
}

export interface TierResult {
  capabilityId: string;
  effectiveL2B: number;
  allowance: number;
  excessSearches: number;
  excessCharge: number;
  bill: number;
  billWithoutExcessFee: number;
  supplierCost: number;
  margin: number;
  marginWithoutExcessFee: number;
  overAllowance: boolean;
}

export function evaluateTier(t: CapabilityTier, i: Inputs): TierResult {
  const bc = confirmedBookings(i);
  const excessSearches = Math.max(0, i.S - bc * t.A);
  const excessCharge = excessSearches * t.e;
  const billTotal = t.F + excessCharge;
  const hit = t.cacheable ? i.h : 0;
  const sc = i.S * (1 - hit) * t.supplierCostPerCall + bc * t.supplierCostPerBooking;
  return {
    capabilityId: t.capabilityId,
    effectiveL2B: effectiveL2B(i),
    allowance: t.A,
    excessSearches,
    excessCharge,
    bill: billTotal,
    billWithoutExcessFee: t.F,
    supplierCost: sc,
    margin: billTotal - sc,
    marginWithoutExcessFee: t.F - sc,
    overAllowance: effectiveL2B(i) > t.A,
  };
}
