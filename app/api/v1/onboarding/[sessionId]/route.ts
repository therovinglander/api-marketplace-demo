import { NextResponse } from "next/server";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** GET -> onboarding status incl. time-to-first-call. Never returns the key or its hash. */
export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const s = await (await getRepo()).findOne("onboarding_sessions", { _id: sessionId });
  if (!s) return NextResponse.json({ error: "unknown session" }, { status: 404 });
  return NextResponse.json({
    illustrative: true,
    sessionId: s._id,
    partnerName: s.partnerName,
    signupAt: s.signupAt,
    firstCallAt: s.firstCallAt,
    timeToFirstCallSec: s.timeToFirstCallSec,
  });
}
