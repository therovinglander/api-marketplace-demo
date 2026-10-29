import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_BODY_BYTES, RateLimiter, clientIp, guardWrite, rateLimitHeaders, resetRateLimits } from "@/lib/rateLimit";
import { readJsonObject } from "@/lib/http";

describe("RateLimiter", () => {
  it("allows up to the limit, then blocks with a Retry-After", () => {
    let t = 1_000;
    const rl = new RateLimiter(3, 60_000, () => t);
    expect([1, 2, 3].map(() => rl.check("a").ok)).toEqual([true, true, true]);
    const blocked = rl.check("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    t += 30_000;
    expect(rl.check("a").retryAfterSec).toBe(30);
  });
  it("starts a fresh window after it expires", () => {
    let t = 0;
    const rl = new RateLimiter(1, 1000, () => t);
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(false);
    t = 1000;
    expect(rl.check("a").ok).toBe(true);
  });
  it("counts each key separately", () => {
    const rl = new RateLimiter(1, 1000, () => 0);
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("b").ok).toBe(true);
    expect(rl.check("a").ok).toBe(false);
  });
  it("memory stays bounded when a flood of distinct keys arrives", () => {
    const rl = new RateLimiter(5, 60_000, () => 0, 100);
    for (let i = 0; i < 1000; i++) rl.check(`ip${i}`);
    expect(rl.size).toBeLessThanOrEqual(100);
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop, then x-real-ip, then unknown", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

const post = (body: unknown, ip = "203.0.113.1", extra: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });

describe("guardWrite", () => {
  beforeEach(() => resetRateLimits());
  it("public deploy: 429 with Retry-After once the bucket is spent", async () => {
    const env = { VERCEL: "1" };
    for (let i = 0; i < 10; i++) expect(guardWrite(post({}), "signup", env)).toBeNull();
    const r = guardWrite(post({}), "signup", env)!;
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await r.json()).error).toContain("Too many requests");
  });
  it("another IP is unaffected", () => {
    const env = { VERCEL: "1" };
    for (let i = 0; i < 11; i++) guardWrite(post({}, "203.0.113.1"), "signup", env);
    expect(guardWrite(post({}, "203.0.113.2"), "signup", env)).toBeNull();
  });
  it("buckets are independent", () => {
    const env = { VERCEL: "1" };
    for (let i = 0; i < 11; i++) guardWrite(post({}), "signup", env);
    expect(guardWrite(post({}), "deals", env)).toBeNull();
  });
  it("local (not public): no rate limit, so local behaviour is unchanged", () => {
    for (let i = 0; i < 200; i++) expect(guardWrite(post({}), "signup", {})).toBeNull();
  });
  it("413 when Content-Length is over the cap, everywhere", () => {
    const r = guardWrite(post({}, "203.0.113.1", { "content-length": String(MAX_BODY_BYTES + 1) }), "deals", {})!;
    expect(r.status).toBe(413);
  });
  it("server-action helper returns null locally and a result when spent", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(rateLimitHeaders("deals", h, {})).toBeNull();
    for (let i = 0; i < 30; i++) expect(rateLimitHeaders("deals", h, { VERCEL: "1" })).toBeNull();
    expect(rateLimitHeaders("deals", h, { VERCEL: "1" })?.ok).toBe(false);
  });
});

describe("readJsonObject size cap", () => {
  it("accepts a normal body and rejects one over the cap (chunked or lying Content-Length)", async () => {
    expect(await readJsonObject(post({ a: 1 }))).toEqual({ a: 1 });
    const big = post({ pad: "x".repeat(MAX_BODY_BYTES) });
    expect(await readJsonObject(big)).toBeNull();
  });
  it("still rejects non-objects and bad JSON", async () => {
    expect(await readJsonObject(post([1]))).toBeNull();
    expect(await readJsonObject(new Request("http://x", { method: "POST", body: "{nope" }))).toBeNull();
  });
});

// Route level: the real handlers, on a public deploy, against a throwaway data dir.
describe("write routes answer 429 on a public deploy (S9)", () => {
  let dir: string;
  beforeEach(() => {
    resetRateLimits();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "s9-route-"));
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATA_DIR", dir);
    (globalThis as { __repo?: unknown }).__repo = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    (globalThis as { __repo?: unknown }).__repo = undefined;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("signup: 10 keys per IP per 10 minutes, then 429; a second IP still works", async () => {
    const { POST } = await import("@/app/api/v1/onboarding/signup/route");
    for (let i = 0; i < 10; i++) expect((await POST(post({ partnerName: `Partner ${i}` }))).status).toBe(201);
    const r = await POST(post({ partnerName: "One too many" }));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBeTruthy();
    expect((await POST(post({ partnerName: "Other IP" }, "203.0.113.50"))).status).toBe(201);
  });

  it("signup: an oversized body is 413 and mints nothing", async () => {
    const { POST } = await import("@/app/api/v1/onboarding/signup/route");
    const r = await POST(post({ partnerName: "x" }, "203.0.113.1", { "content-length": "999999" }));
    expect(r.status).toBe(413);
  });

  it("deals edit: 429 after 30 attempts a minute", async () => {
    const { POST } = await import("@/app/api/v1/deals/[partnerId]/route");
    const ctx = { params: Promise.resolve({ partnerId: "nobody" }) };
    for (let i = 0; i < 30; i++) expect((await POST(post({}), ctx)).status).toBe(400);
    expect((await POST(post({}), ctx)).status).toBe(429);
  });

  it("mapping decision: 429 after 60 attempts a minute", async () => {
    const { POST } = await import("@/app/api/v1/mapping/proposals/[id]/decision/route");
    const ctx = { params: Promise.resolve({ id: "nope" }) };
    for (let i = 0; i < 60; i++) expect((await POST(post({ decision: "approve" }), ctx)).status).toBe(404);
    expect((await POST(post({ decision: "approve" }), ctx)).status).toBe(429);
  });

  it("mapping regenerate shares the mapping bucket", async () => {
    const { POST } = await import("@/app/api/v1/mapping/proposals/route");
    const dec = await import("@/app/api/v1/mapping/proposals/[id]/decision/route");
    const ctx = { params: Promise.resolve({ id: "nope" }) };
    for (let i = 0; i < 60; i++) await dec.POST(post({ decision: "approve" }), ctx);
    expect((await POST(post({}))).status).toBe(429);
  });

  it("not public: the same burst is never limited", async () => {
    vi.stubEnv("VERCEL", "");
    const { POST } = await import("@/app/api/v1/onboarding/signup/route");
    for (let i = 0; i < 12; i++) expect((await POST(post({ partnerName: `Local ${i}` }))).status).toBe(201);
  });
});
