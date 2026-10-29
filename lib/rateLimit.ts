// S9: abuse limits for the open, unauthenticated public demo. In-memory and per instance by design:
// a cold start resets the counters, which is fine for a demo and keeps this dependency-free.
import { isPublicDemo } from "@/lib/repo/runtime";

export interface RateResult {
  ok: boolean;
  retryAfterSec: number;
}

/** Fixed-window counter per key. `now` is injectable for tests. Memory is bounded by `maxKeys`. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private now: () => number = Date.now,
    private maxKeys = 5000,
  ) {}

  check(key: string): RateResult {
    const t = this.now();
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.evictIfFull(t);
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return { ok: true, retryAfterSec: 0 };
    }
    if (cur.count >= this.limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - t) / 1000)) };
    cur.count += 1;
    return { ok: true, retryAfterSec: 0 };
  }

  get size(): number {
    return this.hits.size;
  }

  private evictIfFull(t: number): void {
    if (this.hits.size < this.maxKeys) return;
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    // Still full of live windows: drop the oldest entries so a flood of fake IPs cannot grow memory.
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}

/** Per-IP limits on the routes that write. Generous for a human, tight for a script. */
export const BUCKETS = {
  signup: { limit: 10, windowMs: 10 * 60_000 }, // mints sandbox keys
  mapping: { limit: 60, windowMs: 60_000 }, // match decisions, regenerate
  deals: { limit: 30, windowMs: 60_000 }, // price book edits
} as const;
export type Bucket = keyof typeof BUCKETS;

/** Largest JSON body any write route accepts. Real bodies are a few hundred bytes. */
export const MAX_BODY_BYTES = 16_384;

const g = globalThis as unknown as { __limiters?: Partial<Record<Bucket, RateLimiter>> };
function limiter(b: Bucket): RateLimiter {
  g.__limiters ??= {};
  return (g.__limiters[b] ??= new RateLimiter(BUCKETS[b].limit, BUCKETS[b].windowMs));
}

/** Test helper. */
export function resetRateLimits(): void {
  g.__limiters = {};
}

/**
 * Client IP. On Vercel the platform sets x-forwarded-for (the client cannot forge the first hop there).
 * Elsewhere the header is spoofable, which is why limiting is only enforced on public deploys.
 */
export function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return h.get("x-real-ip")?.trim() || "unknown";
}

/** Rate-limit check for server actions, which have headers but no Request. Null = allowed. */
export function rateLimitHeaders(bucket: Bucket, h: Headers, env: Record<string, string | undefined> = process.env): RateResult | null {
  if (!isPublicDemo(env)) return null;
  const r = limiter(bucket).check(clientIp(h));
  return r.ok ? null : r;
}

export const TOO_MANY = "Too many requests from this address. This is a public demo; please wait a moment and try again.";

/**
 * Gate for write routes. Returns a Response to send (429 or 413) or null to carry on.
 * Rate limits apply on public deploys only; the body-size cap applies everywhere.
 */
export function guardWrite(req: Request, bucket: Bucket, env: Record<string, string | undefined> = process.env): Response | null {
  const limited = rateLimitHeaders(bucket, req.headers, env);
  if (limited) {
    return Response.json({ error: TOO_MANY }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } });
  }
  const len = Number(req.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return Response.json({ error: `body too large (max ${MAX_BODY_BYTES} bytes)` }, { status: 413 });
  }
  return null;
}
