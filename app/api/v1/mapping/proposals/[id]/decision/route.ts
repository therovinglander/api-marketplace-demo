import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { guardWrite } from "@/lib/rateLimit";
import { decideProposal, NotFoundError } from "@/lib/matching/service";
import { ConflictError } from "@/lib/repo/types";

export const dynamic = "force-dynamic";

/** POST { decision: "approve" | "reject", note?: string } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = guardWrite(req, "mapping");
  if (blocked) return blocked;
  const { id } = await ctx.params;
  let body: { decision?: unknown; note?: unknown };
  const parsed = await readJsonObject(req);
  if (!parsed) return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  body = parsed as typeof body;
  if (body.decision !== "approve" && body.decision !== "reject") {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
  try {
    const result = await decideProposal(await getRepo(), id, body.decision, "reviewer", note);
    return NextResponse.json({ illustrative: true, ...result });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
