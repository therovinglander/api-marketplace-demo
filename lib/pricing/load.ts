// Server-side: turn seeded repo documents into the pure inputs the calculator needs.
import type { Doc, Repo } from "@/lib/repo/types";
import { blendSuppliers, type PlanParams, type SupplierCost } from "./calculator";
import type { CapabilityTier } from "./tiers";

export type Segment = "agency" | "ota" | "bank";

export interface PricingContext {
  blended: SupplierCost;
  flatBySegment: Record<Segment, number>;
  perSearch: { p: number };
  perBooking: { q: number };
  hybrid: { F: number; A: number; e: number };
  tiers: CapabilityTier[];
  /** Plain-language labels for the UI */
  labels: Record<string, string>;
}

const num = (d: Doc | undefined, k: string): number => {
  const v = (d?.params as Record<string, unknown> | undefined)?.[k];
  if (typeof v !== "number") throw new Error(`rate plan ${d?._id ?? "?"} is missing numeric param ${k}`);
  return v;
};

export async function loadPricingContext(repo: Repo): Promise<PricingContext> {
  const [suppliers, plans, caps] = await Promise.all([
    repo.find("suppliers"),
    repo.find("rate_plans"),
    repo.find("capabilities"),
  ]);
  const byId = (id: string) => plans.find((p) => p._id === id);
  const hybridOf = (capId: string) => {
    const p = byId(`rp_${capId}_hybrid`);
    return { F: num(p, "F"), A: num(p, "A"), e: num(p, "e") };
  };
  const tiers: CapabilityTier[] = ["search", "content-mapping", "pricing"].map((id) => {
    const cap = caps.find((c) => c._id === id);
    if (!cap) throw new Error(`capability ${id} missing from seed`);
    return {
      capabilityId: id,
      ...hybridOf(id),
      supplierCostPerCall: Number(cap.supplierCostPerCall),
      supplierCostPerBooking: Number(cap.supplierCostPerBooking),
      cacheable: Boolean(cap.cacheable),
    };
  });
  return {
    blended: blendSuppliers(
      suppliers.map((s) => ({
        costPerSearch: Number(s.costPerSearch),
        costPerBooking: Number(s.costPerBooking),
        weight: Number(s.weight),
      })),
    ),
    flatBySegment: {
      agency: num(byId("rp_search_flat_agency"), "F"),
      ota: num(byId("rp_search_flat_ota"), "F"),
      bank: num(byId("rp_search_flat_bank"), "F"),
    },
    perSearch: { p: num(byId("rp_search_per_search"), "p") },
    perBooking: { q: num(byId("rp_search_per_booking"), "q") },
    hybrid: hybridOf("search"),
    tiers,
    labels: Object.fromEntries(caps.map((c) => [String(c._id), String(c.name)])),
  };
}

export function plansFor(ctx: PricingContext, segment: Segment): PlanParams {
  return {
    flat: { F: ctx.flatBySegment[segment] },
    perSearch: ctx.perSearch,
    perBooking: ctx.perBooking,
    hybrid: ctx.hybrid,
  };
}
