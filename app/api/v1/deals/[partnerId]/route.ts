import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { guardWrite } from "@/lib/rateLimit";
import { ConflictError } from "@/lib/repo/types";
import { DealValidationError, editPriceBook, listVersions } from "@/lib/pricing/dealsService";

export const dynamic = "force-dynamic";

/** GET -> all price book versions for a partner, newest first. */
export async function GET(_req: Request, ctx: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await ctx.params;
  const versions = await listVersions(await getRepo(), partnerId);
  if (versions.length === 0) return NextResponse.json({ error: "no price book for this partner" }, { status: 404 });
  return NextResponse.json({ illustrative: true, versions });
}

/** POST { baseVersion, committedMonthlyVolume, note? } -> 201 new version, 409 if baseVersion is stale. */
export async function POST(req: Request, ctx: { params: Promise<{ partnerId: string }> }) {
  const blocked = guardWrite(req, "deals");
  if (blocked) return blocked;
  const { partnerId } = await ctx.params;
  let body: { baseVersion?: unknown; committedMonthlyVolume?: unknown; note?: unknown };
  const parsed = await readJsonObject(req);
  if (!parsed) return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  body = parsed as typeof body;
  if (typeof body.baseVersion !== "number" || typeof body.committedMonthlyVolume !== "number") {
    return NextResponse.json({ error: "baseVersion and committedMonthlyVolume must be numbers" }, { status: 400 });
  }
  try {
    const next = await editPriceBook(
      await getRepo(),
      partnerId,
      body.baseVersion,
      body.committedMonthlyVolume,
      "pricing-manager",
      typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
    );
    return NextResponse.json({ illustrative: true, version: next }, { status: 201 });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof DealValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
