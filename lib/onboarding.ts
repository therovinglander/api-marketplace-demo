// Sandbox keys and onboarding sessions. The plaintext key exists only in the signup response; only its SHA-256 is stored.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendAudit } from "@/lib/repo/audit";
import type { Doc, Repo } from "@/lib/repo/types";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export class OnboardingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingValidationError";
  }
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** `sbx_` + 24 random chars from [A-Za-z0-9], drawn without modulo bias. */
export function generateKey(bytes: (n: number) => Uint8Array = randomBytes): string {
  let out = "";
  while (out.length < 24) {
    for (const b of bytes(32)) {
      if (b < 248 && out.length < 24) out += ALPHABET[b % 62]; // 248 = 62 * 4
    }
  }
  return `sbx_${out}`;
}

export interface SignupResult {
  sessionId: string;
  /** Shown once, never stored. */
  apiKey: string;
  signupAt: string;
}

export async function signup(repo: Repo, partnerName: string, now: Date = new Date()): Promise<SignupResult> {
  const name = partnerName.trim();
  if (name.length < 2 || name.length > 80) throw new OnboardingValidationError("partnerName must be 2 to 80 characters");
  const apiKey = generateKey();
  const sessionId = `ob_${randomUUID()}`;
  await repo.transact(async (tx) => {
    await tx.insert("onboarding_sessions", {
      _id: sessionId,
      partnerName: name,
      signupAt: now.toISOString(),
      sandboxKeyHash: hashKey(apiKey),
      firstCallAt: null,
      timeToFirstCallSec: null,
      illustrative: true,
    });
    await appendAudit(
      tx,
      { entity: "onboarding_session", entityId: sessionId, action: "key_issued", actor: "system", reason: `Sandbox key issued to ${name}. Only its hash is stored.`, details: { keyPrefix: "sbx_" } },
      now,
    );
  });
  return { sessionId, apiKey, signupAt: now.toISOString() };
}

/** Returns the session for a valid key, or null. Records time-to-first-call on the first authenticated call. */
export async function authenticate(repo: Repo, authorization: string | null, now: Date = new Date()): Promise<Doc | null> {
  const m = /^Bearer (sbx_[A-Za-z0-9]{24})$/.exec(authorization ?? "");
  if (!m) return null;
  return repo.findOne("onboarding_sessions", { sandboxKeyHash: hashKey(m[1]) });
}

export async function recordFirstCall(repo: Repo, session: Doc, now: Date = new Date()): Promise<void> {
  if (session.firstCallAt) return;
  const sec = Math.max(0, (now.getTime() - new Date(String(session.signupAt)).getTime()) / 1000);
  await repo.update("onboarding_sessions", session._id, { firstCallAt: now.toISOString(), timeToFirstCallSec: sec });
}
