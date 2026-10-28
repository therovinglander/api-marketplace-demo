import { describe, expect, it, vi } from "vitest";
import { AuthError, MarketplaceClient, MarketplaceError, RateLimitError, UpstreamError, ValidationError } from "./index";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const SEARCH_OK = { rateKey: "rk_1", hotelId: "H-1", checkIn: "2027-03-01", nights: 2, totalUsd: 300, illustrative: true };
const BOOK_OK = { bookingId: "bk_1", status: "confirmed", rateKey: "rk_1", guestName: "Test Guest", totalUsd: 300, illustrative: true };

function setup(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("no more mocked responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  const client = new MarketplaceClient({
    apiKey: "sbx_test",
    baseUrl: "http://x/api",
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  });
  return { client, calls, sleeps };
}

const headersOf = (c: { init: RequestInit }) => new Headers(c.init.headers);

describe("SDK happy path", () => {
  it("search sends bearer auth + JSON and returns the typed body", async () => {
    const { client, calls } = setup([json(200, SEARCH_OK)]);
    const r = await client.search({ hotelId: "H-1", checkIn: "2027-03-01", nights: 2 });
    expect(r.rateKey).toBe("rk_1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://x/api/search");
    expect(headersOf(calls[0]).get("Authorization")).toBe("Bearer sbx_test");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ hotelId: "H-1", checkIn: "2027-03-01", nights: 2 });
  });

  it("book sends an Idempotency-Key", async () => {
    const { client, calls } = setup([json(200, BOOK_OK)]);
    await client.book({ rateKey: "rk_1", guestName: "Test Guest" });
    expect(headersOf(calls[0]).get("Idempotency-Key")).toMatch(/^idem_/);
  });

  it("search does not send an Idempotency-Key", async () => {
    const { client, calls } = setup([json(200, SEARCH_OK)]);
    await client.search({ hotelId: "H-1", checkIn: "2027-03-01", nights: 2 });
    expect(headersOf(calls[0]).get("Idempotency-Key")).toBeNull();
  });
});

describe("SDK retry path", () => {
  it("503, 503, 200 -> success after 3 calls with the SAME Idempotency-Key", async () => {
    const { client, calls, sleeps } = setup([json(503, { error: "down" }), json(503, { error: "down" }), json(200, BOOK_OK)]);
    const r = await client.book({ rateKey: "rk_1", guestName: "Test Guest" });
    expect(r.bookingId).toBe("bk_1");
    expect(calls).toHaveLength(3);
    const keys = new Set(calls.map((c) => headersOf(c).get("Idempotency-Key")));
    expect(keys.size).toBe(1);
    // backoff: 200*2^0 + 0.5*200 = 300, then 200*2^1 + 100 = 500
    expect(sleeps).toEqual([300, 500]);
  });

  it("a caller-supplied idempotency key is used as is", async () => {
    const { client, calls } = setup([json(200, BOOK_OK)]);
    await client.book({ rateKey: "rk_1", guestName: "G" }, "my-key-1");
    expect(headersOf(calls[0]).get("Idempotency-Key")).toBe("my-key-1");
  });

  it("4 x 503 -> UpstreamError after 4 calls (1 + 3 retries)", async () => {
    const { client, calls } = setup([503, 503, 503, 503].map((s) => json(s, { error: "down" })));
    await expect(client.search({ hotelId: "H", checkIn: "2027-03-01", nights: 1 })).rejects.toBeInstanceOf(UpstreamError);
    expect(calls).toHaveLength(4);
  });

  it("429 is retried, and surfaces as RateLimitError when it never clears", async () => {
    const { client, calls } = setup([429, 429, 429, 429].map((s) => json(s, { error: "slow down" })));
    await expect(client.search({ hotelId: "H", checkIn: "2027-03-01", nights: 1 })).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toHaveLength(4);
  });

  it("network errors are retried", async () => {
    const { client, calls } = setup([new TypeError("fetch failed"), json(200, SEARCH_OK)]);
    await client.search({ hotelId: "H", checkIn: "2027-03-01", nights: 1 });
    expect(calls).toHaveLength(2);
  });

  it("network errors that never clear -> UpstreamError", async () => {
    const e = () => new TypeError("fetch failed");
    const { client } = setup([e(), e(), e(), e()]);
    await expect(client.search({ hotelId: "H", checkIn: "2027-03-01", nights: 1 })).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("SDK typed errors, no retry on client errors", () => {
  it("400 -> ValidationError, exactly one call", async () => {
    const { client, calls } = setup([json(400, { error: "nights must be 1-30" })]);
    const err = await client.search({ hotelId: "H", checkIn: "2027-03-01", nights: 99 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toBe("nights must be 1-30");
    expect((err as ValidationError).status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it("401 -> AuthError, exactly one call", async () => {
    const { client, calls } = setup([json(401, { error: "invalid or missing sandbox key" })]);
    await expect(client.search({ hotelId: "H", checkIn: "2027-03-01", nights: 1 })).rejects.toBeInstanceOf(AuthError);
    expect(calls).toHaveLength(1);
  });

  it("all typed errors extend MarketplaceError and carry their class name", async () => {
    const { client } = setup([json(401, {})]);
    const err = await client.search({ hotelId: "H", checkIn: "2027-03-01", nights: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MarketplaceError);
    expect((err as Error).name).toBe("AuthError");
  });

  it("a non-JSON error body still yields a typed error", async () => {
    const { client } = setup([new Response("oops", { status: 400 })]);
    await expect(client.search({ hotelId: "H", checkIn: "2027-03-01", nights: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires an apiKey", () => {
    expect(() => new MarketplaceClient({ apiKey: "" })).toThrow(ValidationError);
  });
});
