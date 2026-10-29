import path from "node:path";
import { FileRepo } from "./file";
import { resolveDataDir, isPublicDemo } from "./runtime";
import type { Repo } from "./types";

export * from "./types";
export { appendAudit, auditFor } from "./audit";

const g = globalThis as unknown as { __repo?: Promise<Repo> };

/**
 * Mongo when MONGODB_URI is set (and DATA_MODE != file); otherwise file mode.
 * Public-deploy guard: on Vercel (or PUBLIC_DEMO=1), Mongo mode is refused unless ALLOW_PUBLIC_DB=1,
 * so a stray MONGODB_URI can never point the open, unauthenticated demo at a real database.
 */
export function resolveMode(env: Record<string, string | undefined> = process.env): "file" | "mongo" {
  const m = (env.DATA_MODE ?? "").trim().toLowerCase();
  const mode: "file" | "mongo" = m === "file" ? "file" : m === "mongo" ? "mongo" : env.MONGODB_URI ? "mongo" : "file";
  if (mode === "mongo" && isPublicDemo(env) && env.ALLOW_PUBLIC_DB !== "1") {
    throw new PublicDbRefusedError();
  }
  return mode;
}

export class PublicDbRefusedError extends Error {
  constructor() {
    super("Refusing to use MongoDB on a public deploy. Unset MONGODB_URI / DATA_MODE=mongo, or set ALLOW_PUBLIC_DB=1 if you really mean it.");
    this.name = "PublicDbRefusedError";
  }
}

async function create(): Promise<Repo> {
  if (resolveMode() === "mongo") {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("DATA_MODE=mongo needs MONGODB_URI");
    const { MongoRepo } = await import("./mongo");
    return MongoRepo.connect(uri, process.env.MONGODB_DB ?? "marketplace_demo");
  }
  const root = process.cwd();
  return new FileRepo({ seedDir: path.join(root, "seed"), dataDir: resolveDataDir() });
}

/** Process-wide singleton (survives Next dev hot reloads). */
export function getRepo(): Promise<Repo> {
  g.__repo ??= create().catch((e) => {
    g.__repo = undefined;
    throw e;
  });
  return g.__repo;
}
