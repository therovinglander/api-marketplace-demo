// Pure pricing math. No I/O, no rounding (round only at display). All money is plain JS numbers in USD.
// Definitions (architect decision A5): r = searches per ATTEMPTED booking; B = S/r; confirmed Bc = B*c.
// Allowances and excess are measured against CONFIRMED bookings; effective L2B shown = S/Bc = r/c.

export interface Inputs {
  /** Searches per month */
  S: number;
  /** Look-to-book: searches per attempted booking */
  r: number;
  /** Share of attempted bookings that confirm */
  c: number;
  /** Cache hit rate */
  h: number;
}

export const INPUT_RANGES = {
  S: [10_000, 5_000_000_000],
  r: [50, 20_000],
  c: [0.5, 1],
  h: [0, 0.9],
} as const;

export function validateInputs(i: Partial<Record<keyof Inputs, unknown>>): string[] {
  const errors: string[] = [];
  for (const k of ["S", "r", "c", "h"] as const) {
    const v = i[k];
    const [lo, hi] = INPUT_RANGES[k];
    if (typeof v !== "number" || !Number.isFinite(v)) errors.push(`${k} must be a number`);
    else if (v < lo || v > hi) errors.push(`${k} must be between ${lo} and ${hi}`);
  }
  return errors;
}

export interface SupplierCost {
  costPerSearch: number;
  costPerBooking: number;
}

export interface WeightedSupplier extends SupplierCost {
  weight: number;
}

/** Weighted-average supplier cost. Weights are normalised so they need not sum to 1. */
export function blendSuppliers(suppliers: WeightedSupplier[]): SupplierCost {
  const total = suppliers.reduce((a, s) => a + s.weight, 0);
  if (total <= 0) throw new Error("supplier weights must sum to more than 0");
  return {
    costPerSearch: suppliers.reduce((a, s) => a + s.costPerSearch * s.weight, 0) / total,
    costPerBooking: suppliers.reduce((a, s) => a + s.costPerBooking * s.weight, 0) / total,
  };
}

export const confirmedBookings = ({ S, r, c }: Inputs) => (S / r) * c;
export const effectiveL2B = ({ r, c }: Pick<Inputs, "r" | "c">) => r / c;

/** Upstream supplier cost: only cache misses hit suppliers for search; every confirmed booking costs once. */
export function supplierCost(i: Inputs, cost: SupplierCost): number {
  return i.S * (1 - i.h) * cost.costPerSearch + confirmedBookings(i) * cost.costPerBooking;
}

export type ModelId = "flat" | "per_search" | "per_booking" | "hybrid";

export interface PlanParams {
  flat: { F: number };
  perSearch: { p: number };
  perBooking: { q: number };
  hybrid: { F: number; A: number; e: number };
}

/** Every model's monthly bill is linear in S at fixed r, c, h:  bill = a + b*S. */
export function linearCoefficients(model: ModelId, plans: PlanParams, i: Pick<Inputs, "r" | "c">): { a: number; b: number } {
  switch (model) {
    case "flat":
      return { a: plans.flat.F, b: 0 };
    case "per_search":
      return { a: 0, b: plans.perSearch.p };
    case "per_booking":
      return { a: 0, b: (i.c / i.r) * plans.perBooking.q };
    case "hybrid": {
      const { F, A, e } = plans.hybrid;
      return { a: F, b: Math.max(0, 1 - (A * i.c) / i.r) * e };
    }
  }
}

export function bill(model: ModelId, plans: PlanParams, i: Inputs): number {
  const { a, b } = linearCoefficients(model, plans, i);
  return a + b * i.S;
}

export interface ModelResult {
  model: ModelId;
  bill: number;
  supplierCost: number;
  margin: number;
  /** margin / bill (0 when bill is 0) */
  marginPct: number;
  /** What the partner pays per confirmed booking */
  costPerBooking: number;
}

export const MODELS: ModelId[] = ["flat", "per_search", "per_booking", "hybrid"];

export function compareModels(i: Inputs, plans: PlanParams, cost: SupplierCost): ModelResult[] {
  const sc = supplierCost(i, cost);
  const bc = confirmedBookings(i);
  return MODELS.map((model) => {
    const b = bill(model, plans, i);
    return { model, bill: b, supplierCost: sc, margin: b - sc, marginPct: b === 0 ? 0 : (b - sc) / b, costPerBooking: b / bc };
  });
}

/**
 * Volume at which two models cost the partner the same: S* = (a2-a1)/(b1-b2).
 * Null when lines are parallel, when S* <= 0, or when it falls outside [min, max].
 */
export function breakEven(
  m1: ModelId,
  m2: ModelId,
  plans: PlanParams,
  i: Pick<Inputs, "r" | "c">,
  range: readonly [number, number] = INPUT_RANGES.S,
): number | null {
  const l1 = linearCoefficients(m1, plans, i);
  const l2 = linearCoefficients(m2, plans, i);
  if (l1.b === l2.b) return null;
  const s = (l2.a - l1.a) / (l1.b - l2.b);
  if (!Number.isFinite(s) || s <= 0 || s < range[0] || s > range[1]) return null;
  return s;
}

export interface BreakEvenRow {
  a: ModelId;
  b: ModelId;
  S: number | null;
}

export function allBreakEvens(plans: PlanParams, i: Pick<Inputs, "r" | "c">): BreakEvenRow[] {
  const rows: BreakEvenRow[] = [];
  for (let x = 0; x < MODELS.length; x++) {
    for (let y = x + 1; y < MODELS.length; y++) {
      rows.push({ a: MODELS[x], b: MODELS[y], S: breakEven(MODELS[x], MODELS[y], plans, i) });
    }
  }
  return rows;
}
