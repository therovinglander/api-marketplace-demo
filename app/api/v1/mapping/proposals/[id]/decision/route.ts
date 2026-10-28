import { NextResponse } from "next/server";
import { getRepo } from "@/lib/repo";
import { decideProposal, NotFoundError } from "@/lib/matching/service";

export const dynamic = "force-dynamic";

/** POST { decision: "approve" | "reject", note?: string } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { decision?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (body.decision !== "approve" && body.decision !== "reject") {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
  try {
    const result = await decideProposal(await getRepo(), id, body.decision, "reviewer", note);
    return NextResponse.json({ illustrative: true, ...result });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
