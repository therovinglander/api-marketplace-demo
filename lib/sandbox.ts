// Deterministic sandbox behaviour (pure). Same input -> same output. All values illustrative.
import { createHash } from "node:crypto";

export interface SandboxResult {
  status: number;
  body: Record<string, unknown>;
}

export const SANDBOX_CAPABILITIES = ["search", "book", "content-mapping", "room-mapping", "dedupe", "pricing", "taxes"] as const;
export type SandboxCapability = (typeof SANDBOX_CAPABILITIES)[number];

const h = (s: string) => createHash("sha256").update(s).digest("hex");
const num32 = (s: string) => parseInt(h(s).slice(0, 8), 16);
const bad = (error: string): SandboxResult => ({ status: 400, body: { error } });
const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 200;
const priceFor = (key: string, nights = 1) => Math.round((90 + (num32(key) % 21000) / 100) * nights * 100) / 100;

export function handleSandbox(capability: SandboxCapability, body: Record<string, unknown>, idempotencyKey: string | null): SandboxResult {
  switch (capability) {
    case "search": {
      const { hotelId, checkIn, nights } = body;
      if (!str(hotelId)) return bad("hotelId is required");
      if (typeof checkIn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return bad("checkIn must be YYYY-MM-DD");
      if (typeof nights !== "number" || !Number.isInteger(nights) || nights < 1 || nights > 30) return bad("nights must be an integer from 1 to 30");
      const rateKey = `rk_${h(`${hotelId}|${checkIn}|${nights}`).slice(0, 10)}`;
      return { status: 200, body: { rateKey, hotelId, checkIn, nights, totalUsd: priceFor(rateKey, nights), illustrative: true } };
    }
    case "book": {
      const { rateKey, guestName } = body;
      if (!str(rateKey)) return bad("rateKey is required");
      if (!str(guestName)) return bad("guestName is required");
      if (!idempotencyKey) return bad("Idempotency-Key header is required for book");
      return {
        status: 200,
        body: { bookingId: `bk_${h(`${rateKey}|${guestName}|${idempotencyKey}`).slice(0, 10)}`, status: "confirmed", rateKey, guestName, totalUsd: priceFor(rateKey), illustrative: true },
      };
    }
    case "content-mapping": {
      const { supplierCode, supplierHotelId } = body;
      if (!str(supplierCode) || !str(supplierHotelId)) return bad("supplierCode and supplierHotelId are required");
      return { status: 200, body: { supplierCode, supplierHotelId, canonicalId: `canon_${h(`${supplierCode}|${supplierHotelId}`).slice(0, 8)}`, illustrative: true } };
    }
    case "room-mapping": {
      const { roomName } = body;
      if (!str(roomName)) return bad("roomName is required");
      const t = roomName.toLowerCase();
      const canonical = t.includes("suite") ? "Suite" : t.includes("twin") || t.includes("double") ? "Twin/Double" : t.includes("king") ? "King" : "Standard";
      return { status: 200, body: { roomName, canonicalRoom: canonical, confidence: 0.6 + (num32(roomName) % 40) / 100, illustrative: true } };
    }
    case "dedupe": {
      const { name } = body;
      if (!str(name)) return bad("name is required");
      return { status: 200, body: { name, postal: typeof body.postal === "string" ? body.postal : null, matchScore: 0.5 + (num32(name) % 50) / 100, note: "Sandbox score is a deterministic stand-in; see /mapping for the real matcher.", illustrative: true } };
    }
    case "pricing": {
      const { hotelId, rateKey } = body;
      if (!str(hotelId) || !str(rateKey)) return bad("hotelId and rateKey are required");
      return { status: 200, body: { hotelId, rateKey, totalUsd: priceFor(rateKey), illustrative: true } };
    }
    case "taxes": {
      const { hotelId, nights } = body;
      if (!str(hotelId)) return bad("hotelId is required");
      if (typeof nights !== "number" || !Number.isInteger(nights) || nights < 1 || nights > 30) return bad("nights must be an integer from 1 to 30");
      return { status: 200, body: { hotelId, nights, taxesUsd: Math.round(nights * (12 + (num32(hotelId) % 900) / 100) * 100) / 100, illustrative: true } };
    }
  }
}

/** Stable JSON: object keys sorted recursively, so key order in the request body does not matter. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
export const bodyHash = (body: unknown) => h(canonicalJson(body));

interface Stored {
  bodyHash: string;
  result: SandboxResult;
}

/** In-memory Idempotency-Key -> (body hash, response) store. Resets on restart (stated in the README). Bounded. */
export class IdempotencyStore {
  private map = new Map<string, Stored>();
  constructor(private max = 5000) {}
  get(scope: string, key: string) {
    return this.map.get(`${scope}:${key}`);
  }
  set(scope: string, key: string, value: Stored) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(`${scope}:${key}`, value);
  }
}

export interface ExecResult extends SandboxResult {
  replayed: boolean;
}

/**
 * Run a sandbox call with idempotency semantics for `book`:
 * same key + same body -> stored response (replayed); same key + different body -> 422 idempotency_key_reused.
 */
export function executeSandbox(
  capability: SandboxCapability,
  body: Record<string, unknown>,
  idempotencyKey: string | null,
  store: IdempotencyStore,
  scope: string,
): ExecResult {
  if (capability === "book" && idempotencyKey) {
    const hash = bodyHash(body);
    const prior = store.get(scope, idempotencyKey);
    if (prior) {
      if (prior.bodyHash !== hash) {
        return { status: 422, body: { error: "idempotency_key_reused", message: "This Idempotency-Key was already used with a different request body." }, replayed: false };
      }
      return { ...prior.result, replayed: true };
    }
    const result = handleSandbox(capability, body, idempotencyKey);
    if (result.status === 200) store.set(scope, idempotencyKey, { bodyHash: hash, result });
    return { ...result, replayed: false };
  }
  return { ...handleSandbox(capability, body, idempotencyKey), replayed: false };
}
