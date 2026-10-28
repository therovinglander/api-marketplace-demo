import path from "node:path";
import { FileRepo } from "./file";
import type { Repo } from "./types";

export * from "./types";
export { appendAudit, auditFor } from "./audit";

const g = globalThis as unknown as { __repo?: Promise<Repo> };

/** Mongo when MONGODB_URI is set (and DATA_MODE != file); otherwise file mode. */
export function resolveMode(env: Record<string, string | undefined> = process.env): "file" | "mongo" {
  const m = (env.DATA_MODE ?? "").trim().toLowerCase();
  if (m === "file") return "file";
  if (m === "mongo") return "mongo";
  return env.MONGODB_URI ? "mongo" : "file";
}

async function create(): Promise<Repo> {
  if (resolveMode() === "mongo") {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("DATA_MODE=mongo needs MONGODB_URI");
    const { MongoRepo } = await import("./mongo");
    return MongoRepo.connect(uri, process.env.MONGODB_DB ?? "marketplace_demo");
  }
  const root = process.cwd();
  return new FileRepo({ seedDir: path.join(root, "seed"), dataDir: path.join(root, ".data") });
}

/** Process-wide singleton (survives Next dev hot reloads). */
export function getRepo(): Promise<Repo> {
  g.__repo ??= create().catch((e) => {
    g.__repo = undefined;
    throw e;
  });
  return g.__repo;
}
