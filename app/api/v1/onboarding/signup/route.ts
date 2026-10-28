import { NextResponse } from "next/server";
import { getRepo } from "@/lib/repo";
import { OnboardingValidationError, signup } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/** POST { partnerName } -> { sessionId, apiKey, signupAt }. The key is returned once and only its hash is stored. */
export async function POST(req: Request) {
  let body: { partnerName?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (typeof body.partnerName !== "string") return NextResponse.json({ error: "partnerName is required" }, { status: 400 });
  try {
    const r = await signup(await getRepo(), body.partnerName);
    return NextResponse.json({ illustrative: true, ...r }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof OnboardingValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
