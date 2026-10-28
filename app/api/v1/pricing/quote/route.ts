import { NextResponse } from "next/server";
import { getRepo } from "@/lib/repo";
import { allBreakEvens, compareModels, confirmedBookings, effectiveL2B, validateInputs, supplierCost } from "@/lib/pricing/calculator";
import { loadPricingContext, plansFor, type Segment } from "@/lib/pricing/load";
import { evaluateTier } from "@/lib/pricing/tiers";

export const dynamic = "force-dynamic";

const SEGMENTS: Segment[] = ["agency", "ota", "bank"];

/** POST { S, r, c, h, segment } -> model comparison, break-evens and per-capability excess tiers. Illustrative. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const errors = validateInputs(body);
  const segment = (body.segment ?? "agency") as Segment;
  if (!SEGMENTS.includes(segment)) errors.push(`segment must be one of ${SEGMENTS.join(", ")}`);
  if (errors.length) return NextResponse.json({ error: "invalid input", details: errors }, { status: 400 });

  const i = { S: body.S as number, r: body.r as number, c: body.c as number, h: body.h as number };
  const ctx = await loadPricingContext(await getRepo());
  const plans = plansFor(ctx, segment);
  return NextResponse.json({
    illustrative: true,
    inputs: { ...i, segment },
    confirmedBookings: confirmedBookings(i),
    effectiveL2B: effectiveL2B(i),
    supplierCost: supplierCost(i, ctx.blended),
    models: compareModels(i, plans, ctx.blended),
    breakEvens: allBreakEvens(plans, i),
    tiers: ctx.tiers.map((t) => evaluateTier(t, i)),
  });
}
