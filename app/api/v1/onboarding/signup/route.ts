import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getRepo } from "@/lib/repo";
import { OnboardingValidationError, signup } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/** POST { partnerName } -> { sessionId, apiKey, signupAt }. The key is returned once and only its hash is stored. */
export async function POST(req: Request) {
  let body: { partnerName?: unknown };
  const parsed = await readJsonObject(req);
  if (!parsed) return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  body = parsed as typeof body;
  if (typeof body.partnerName !== "string") return NextResponse.json({ error: "partnerName is required" }, { status: 400 });
  try {
    const r = await signup(await getRepo(), body.partnerName);
    return NextResponse.json({ illustrative: true, ...r }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof OnboardingValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
