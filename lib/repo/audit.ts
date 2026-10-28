import { randomUUID } from "node:crypto";
import type { Doc, Repo } from "./types";

export type AuditAction =
  | "proposed"
  | "approved"
  | "rejected"
  | "pricebook_versioned"
  | "key_issued";

export interface AuditEntry {
  entity: string;
  entityId: string;
  action: AuditAction;
  actor: string;
  /** Human-readable "why". */
  reason: string;
  /** Machine-readable evidence: signals, weights, thresholds, rule version. */
  details?: Record<string, unknown>;
}

/** The ONLY write path to audit_log. There is deliberately no update or delete. */
export async function appendAudit(repo: Repo, entry: AuditEntry, now: Date = new Date()): Promise<string> {
  const id = `aud_${randomUUID()}`;
  const doc: Doc = { _id: id, ts: now.toISOString(), illustrative: true, ...entry };
  await repo.insert("audit_log", doc);
  return id;
}

export async function auditFor(repo: Repo, entity: string, entityId: string): Promise<Doc[]> {
  const rows = await repo.find("audit_log", { entity, entityId });
  return rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
