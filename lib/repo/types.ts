// Repository seam: every feature talks to this interface, never to Mongo or files directly.

export type Doc = { _id: string } & Record<string, unknown>;
export type Filter = Record<string, unknown>;

export const COLLECTIONS = [
  "suppliers",
  "capabilities",
  "rate_plans",
  "partners",
  "price_books",
  "hotel_records",
  "match_proposals",
  "canonical_hotels",
  "audit_log",
  "onboarding_sessions",
  "app_config",
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** Unique compound keys (mirrors the Mongo unique indexes). */
export const UNIQUE_KEYS: Partial<Record<CollectionName, string[]>> = {
  price_books: ["partnerId", "version"],
  match_proposals: ["aId", "bId"],
  hotel_records: ["supplierCode", "supplierHotelId"],
  onboarding_sessions: ["sandboxKeyHash"],
};

/** audit_log is append-only: only insert() is allowed. */
export const APPEND_ONLY: CollectionName[] = ["audit_log"];

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export interface Repo {
  readonly mode: "file" | "mongo";
  find(coll: CollectionName, filter?: Filter): Promise<Doc[]>;
  findOne(coll: CollectionName, filter: Filter): Promise<Doc | null>;
  /** Throws ConflictError on duplicate _id or unique-key clash. */
  insert(coll: CollectionName, doc: Doc): Promise<void>;
  /** Shallow-merge `patch` into the doc with this _id. Throws if missing. */
  update(coll: CollectionName, id: string, patch: Record<string, unknown>): Promise<void>;
  upsert(coll: CollectionName, doc: Doc): Promise<void>;
  /** All-or-nothing group of writes. */
  transact<T>(fn: (tx: Repo) => Promise<T>): Promise<T>;
}

export function matches(doc: Doc, filter: Filter): boolean {
  return Object.entries(filter).every(([k, v]) => doc[k] === v);
}
