import { describe, expect, it } from "vitest";
import path from "node:path";
import { FileRepo } from "@/lib/repo/file";
import { COLLECTIONS } from "@/lib/repo/types";
import { auditFor } from "@/lib/repo/audit";
import { authenticate, generateKey, hashKey, OnboardingValidationError, recordFirstCall, signup } from "@/lib/onboarding";
import { canonicalJson, executeSandbox, handleSandbox, IdempotencyStore, SANDBOX_CAPABILITIES } from "@/lib/sandbox";
import { MarketplaceClient, AuthError, ValidationError } from "@/sdk";

const seedDir = path.join(__dirname, "..", "seed");
const repo = () => new FileRepo({ seedDir });

describe("sandbox keys", () => {
  it("format: sbx_ + 24 alphanumerics, and different each time", () => {
    const a = generateKey();
    expect(a).toMatch(/^sbx_[A-Za-z0-9]{24}$/);
    expect(generateKey()).not.toBe(a);
  });
  it("rejection sampling: bytes >= 248 are skipped (no modulo bias)", () => {
    const stream = [255, 250, 248, ...Array.from({ length: 29 }, (_, i) => i)];
    let call = 0;
    const key = generateKey((n) => {
      call++;
      return Uint8Array.from(call === 1 ? stream.slice(0, n) : Array.from({ length: n }, () => 0));
    });
    expect(key.startsWith("sbx_")).toBe(true);
    expect(key.slice(4, 8)).toBe("ABCD"); // 255, 250, 248 skipped; 0,1,2,3 -> A,B,C,D
  });
});

describe("onboarding", () => {
  it("signup stores only the hash: the plaintext key is nowhere in the store", async () => {
    const r = repo();
    const s = await signup(r, "Test Partner");
    for (const c of COLLECTIONS) {
      expect(JSON.stringify(await r.find(c))).not.toContain(s.apiKey);
    }
    const row = await r.findOne("onboarding_sessions", { _id: s.sessionId });
    expect(row?.sandboxKeyHash).toBe(hashKey(s.apiKey));
    expect(String(row?.sandboxKeyHash)).toMatch(/^[0-9a-f]{64}$/);
    expect((await auditFor(r, "onboarding_session", s.sessionId))[0].action).toBe("key_issued");
  });
  it("rejects bad partner names", async () => {
    await expect(signup(repo(), " ")).rejects.toBeInstanceOf(OnboardingValidationError);
    await expect(signup(repo(), "x".repeat(81))).rejects.toBeInstanceOf(OnboardingValidationError);
  });
  it("authenticate: valid key ok; wrong, malformed, missing -> null", async () => {
    const r = repo();
    const s = await signup(r, "Test Partner");
    expect((await authenticate(r, `Bearer ${s.apiKey}`))?._id).toBe(s.sessionId);
    expect(await authenticate(r, `Bearer ${generateKey()}`)).toBeNull();
    expect(await authenticate(r, "Bearer nope")).toBeNull();
    expect(await authenticate(r, null)).toBeNull();
  });
  it("time-to-first-call = firstCallAt - signupAt, recorded once", async () => {
    const r = repo();
    const t0 = new Date("2027-01-01T00:00:00Z");
    const s = await signup(r, "Test Partner", t0);
    const session = (await authenticate(r, `Bearer ${s.apiKey}`))!;
    await recordFirstCall(r, session, new Date(t0.getTime() + 42_500));
    const after = (await r.findOne("onboarding_sessions", { _id: s.sessionId }))!;
    expect(after.timeToFirstCallSec).toBe(42.5);
    await recordFirstCall(r, after, new Date(t0.getTime() + 999_000));
    expect((await r.findOne("onboarding_sessions", { _id: s.sessionId }))?.timeToFirstCallSec).toBe(42.5);
  });
});

describe("sandbox handlers", () => {
  it("are deterministic", () => {
    const a = handleSandbox("search", { hotelId: "H-1", checkIn: "2027-03-01", nights: 2 }, null);
    const b = handleSandbox("search", { hotelId: "H-1", checkIn: "2027-03-01", nights: 2 }, null);
    expect(a).toEqual(b);
    expect(a.status).toBe(200);
  });
  it("search validates", () => {
    expect(handleSandbox("search", { hotelId: "", checkIn: "2027-03-01", nights: 2 }, null).status).toBe(400);
    expect(handleSandbox("search", { hotelId: "H", checkIn: "03/01/2027", nights: 2 }, null).status).toBe(400);
    expect(handleSandbox("search", { hotelId: "H", checkIn: "2027-03-01", nights: 0 }, null).status).toBe(400);
    expect(handleSandbox("search", { hotelId: "H", checkIn: "2027-03-01", nights: 2.5 }, null).status).toBe(400);
  });
  it("book requires an idempotency key", () => {
    expect(handleSandbox("book", { rateKey: "rk", guestName: "G" }, null).status).toBe(400);
    expect(handleSandbox("book", { rateKey: "rk", guestName: "G" }, "k").status).toBe(200);
  });
  it("every listed capability answers a valid example with 200", () => {
    const examples: Record<string, Record<string, unknown>> = {
      search: { hotelId: "H", checkIn: "2027-03-01", nights: 1 },
      book: { rateKey: "rk", guestName: "G" },
      "content-mapping": { supplierCode: "SUP_A", supplierHotelId: "A-0001" },
      "room-mapping": { roomName: "Deluxe King City View" },
      dedupe: { name: "Larkspur Harbour Hotel" },
      pricing: { hotelId: "H", rateKey: "rk" },
      taxes: { hotelId: "H", nights: 2 },
    };
    for (const c of SANDBOX_CAPABILITIES) expect(handleSandbox(c, examples[c], "k").status).toBe(200);
  });
  it("idempotency store is bounded", () => {
    const s = new IdempotencyStore(2);
    const v = { bodyHash: "x", result: { status: 200, body: {} } };
    s.set("a", "1", v);
    s.set("a", "2", v);
    s.set("a", "3", v);
    expect(s.get("a", "1")).toBeUndefined();
    expect(s.get("a", "3")).toBeDefined();
  });
});

/** In-process stand-in for the HTTP route: same auth + idempotency logic, no network. */
function inProcessFetch(r: FileRepo, store: IdempotencyStore, failFirst = 0): typeof fetch {
  let failures = failFirst;
  let calls = 0;
  const f = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    const cap = String(input).split("/").pop() as (typeof SANDBOX_CAPABILITIES)[number];
    const headers = new Headers(init?.headers);
    const session = await authenticate(r, headers.get("authorization"));
    if (!session) return Response.json({ error: "invalid or missing sandbox key" }, { status: 401 });
    if (failures > 0) {
      failures--;
      return Response.json({ error: "simulated 503" }, { status: 503 });
    }
    const res = executeSandbox(cap, JSON.parse(String(init?.body)), headers.get("idempotency-key"), store, session._id);
    if (res.status === 200 && !res.replayed) await recordFirstCall(r, session);
    return Response.json(res.body, { status: res.status, headers: res.replayed ? { "Idempotent-Replayed": "true" } : undefined });
  };
  (f as unknown as { calls: () => number }).calls = () => calls;
  return f as typeof fetch;
}

describe("idempotency key reuse (M3)", () => {
  it("same key + same body replays; same key + different body -> 422 idempotency_key_reused", () => {
    const store = new IdempotencyStore();
    const first = executeSandbox("book", { rateKey: "rk_1", guestName: "A" }, "k1", store, "s1");
    expect(first.status).toBe(200);
    expect(first.replayed).toBe(false);
    const again = executeSandbox("book", { rateKey: "rk_1", guestName: "A" }, "k1", store, "s1");
    expect(again.replayed).toBe(true);
    expect(again.body).toEqual(first.body);
    const clash = executeSandbox("book", { rateKey: "rk_DIFFERENT", guestName: "B" }, "k1", store, "s1");
    expect(clash.status).toBe(422);
    expect(clash.body.error).toBe("idempotency_key_reused");
    // the original booking is still what replays afterwards
    expect(executeSandbox("book", { rateKey: "rk_1", guestName: "A" }, "k1", store, "s1").body).toEqual(first.body);
  });
  it("key order in the body does not matter (canonical body hash)", () => {
    const store = new IdempotencyStore();
    executeSandbox("book", { rateKey: "rk_1", guestName: "A" }, "k1", store, "s1");
    const r = executeSandbox("book", { guestName: "A", rateKey: "rk_1" }, "k1", store, "s1");
    expect(r.replayed).toBe(true);
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
  it("keys are scoped per session; failed (4xx) books are not stored", () => {
    const store = new IdempotencyStore();
    executeSandbox("book", { rateKey: "rk_1", guestName: "A" }, "k1", store, "s1");
    expect(executeSandbox("book", { rateKey: "rk_2", guestName: "B" }, "k1", store, "s2").status).toBe(200);
    expect(executeSandbox("book", { rateKey: "", guestName: "B" }, "k9", store, "s1").status).toBe(400);
    expect(executeSandbox("book", { rateKey: "rk_3", guestName: "B" }, "k9", store, "s1").status).toBe(200);
  });
  it("SDK surfaces the 422 as ValidationError without retrying", async () => {
    const r = repo();
    const s = await signup(r, "Test Partner");
    const f = inProcessFetch(r, new IdempotencyStore());
    const client = new MarketplaceClient({ apiKey: s.apiKey, fetch: f, sleep: async () => undefined });
    await client.book({ rateKey: "rk_1", guestName: "A" }, "dup");
    await expect(client.book({ rateKey: "rk_2", guestName: "B" }, "dup")).rejects.toBeInstanceOf(ValidationError);
    expect((f as unknown as { calls: () => number }).calls()).toBe(2);
  });
});

describe("SDK against the sandbox logic (in-process)", () => {
  const noSleep = async () => undefined;

  it("sign up -> first call succeeds and time-to-first-call is recorded", async () => {
    const r = repo();
    const s = await signup(r, "Test Partner");
    const client = new MarketplaceClient({ apiKey: s.apiKey, fetch: inProcessFetch(r, new IdempotencyStore()), sleep: noSleep });
    const out = await client.search({ hotelId: "H-1001", checkIn: "2027-03-01", nights: 2 });
    expect(out.rateKey).toMatch(/^rk_/);
    const row = await r.findOne("onboarding_sessions", { _id: s.sessionId });
    expect(typeof row?.timeToFirstCallSec).toBe("number");
  });

  it("repeated book with the same Idempotency-Key returns the identical response; a new key is a new booking", async () => {
    const r = repo();
    const s = await signup(r, "Test Partner");
    const client = new MarketplaceClient({ apiKey: s.apiKey, fetch: inProcessFetch(r, new IdempotencyStore()), sleep: noSleep });
    const req = { rateKey: "rk_abc", guestName: "Test Guest" };
    const a = await client.book(req, "same-key");
    const b = await client.book(req, "same-key");
    const c = await client.book(req, "other-key");
    expect(b).toEqual(a);
    expect(c.bookingId).not.toBe(a.bookingId);
  });

  it("retry through two simulated 503s still books once, with a stable booking id", async () => {
    const r = repo();
    const s = await signup(r, "Test Partner");
    const f = inProcessFetch(r, new IdempotencyStore(), 2);
    const client = new MarketplaceClient({ apiKey: s.apiKey, fetch: f, sleep: noSleep });
    const res = await client.book({ rateKey: "rk_abc", guestName: "Test Guest" }, "retry-key");
    expect(res.status).toBe("confirmed");
    expect((f as unknown as { calls: () => number }).calls()).toBe(3);
  });

  it("wrong key -> AuthError; bad input -> ValidationError (no retry)", async () => {
    const r = repo();
    const s = await signup(r, "Test Partner");
    const bad = new MarketplaceClient({ apiKey: generateKey(), fetch: inProcessFetch(r, new IdempotencyStore()), sleep: noSleep });
    await expect(bad.search({ hotelId: "H", checkIn: "2027-03-01", nights: 1 })).rejects.toBeInstanceOf(AuthError);
    const good = new MarketplaceClient({ apiKey: s.apiKey, fetch: inProcessFetch(r, new IdempotencyStore()), sleep: noSleep });
    await expect(good.search({ hotelId: "H", checkIn: "nope", nights: 1 })).rejects.toBeInstanceOf(ValidationError);
  });
});
