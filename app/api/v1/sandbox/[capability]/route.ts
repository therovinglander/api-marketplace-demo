import { NextResponse } from "next/server";
import { getRepo } from "@/lib/repo";
import { authenticate, recordFirstCall } from "@/lib/onboarding";
import { handleSandbox, IdempotencyStore, SANDBOX_CAPABILITIES, type SandboxCapability } from "@/lib/sandbox";

export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __idem?: IdempotencyStore };
const idem = () => (g.__idem ??= new IdempotencyStore());

const SIMULATE = new Set([429, 500, 502, 503]);

/**
 * POST /api/v1/sandbox/{search|book|content-mapping|room-mapping|dedupe|pricing|taxes}
 * Authorization: Bearer sbx_...   (key from /onboarding)
 * Optional X-Sandbox-Simulate: 429|500|502|503 forces that failure so you can watch the SDK retry.
 * Book requires an Idempotency-Key; repeating a key returns the identical response (in-memory, resets on restart).
 */
export async function POST(req: Request, ctx: { params: Promise<{ capability: string }> }) {
  const { capability } = await ctx.params;
  if (!(SANDBOX_CAPABILITIES as readonly string[]).includes(capability)) {
    return NextResponse.json({ error: `unknown capability ${capability}` }, { status: 404 });
  }
  const repo = await getRepo();
  const session = await authenticate(repo, req.headers.get("authorization"));
  if (!session) return NextResponse.json({ error: "invalid or missing sandbox key" }, { status: 401 });

  const simulate = Number(req.headers.get("x-sandbox-simulate"));
  if (SIMULATE.has(simulate)) return NextResponse.json({ error: `simulated ${simulate}` }, { status: simulate });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }

  const key = req.headers.get("idempotency-key");
  if (capability === "book" && key) {
    const prior = idem().get(session._id, key);
    if (prior) return NextResponse.json(prior.body, { status: prior.status, headers: { "Idempotent-Replayed": "true" } });
  }
  const result = handleSandbox(capability as SandboxCapability, body, key);
  if (capability === "book" && key && result.status === 200) idem().set(session._id, key, result);
  if (result.status === 200) await recordFirstCall(repo, session);
  return NextResponse.json(result.body, { status: result.status });
}
