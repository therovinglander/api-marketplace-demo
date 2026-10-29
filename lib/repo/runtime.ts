import os from "node:os";
import path from "node:path";

type Env = Record<string, string | undefined>;

/** True on a Vercel deploy (the platform sets VERCEL=1), or when PUBLIC_DEMO=1 is set explicitly. */
export function isPublicDemo(env: Env = process.env): boolean {
  return Boolean(env.VERCEL) || env.PUBLIC_DEMO === "1";
}

/**
 * Where file mode writes its edits.
 * 1. DATA_DIR if set (explicit wins).
 * 2. On Vercel the deploy filesystem is read-only except the OS temp dir, so use a folder there.
 *    Edits are per instance and vanish on a cold start. That is the intended ephemeral demo behaviour.
 * 3. Otherwise `<cwd>/.data`, as before (local behaviour unchanged).
 */
export function resolveDataDir(env: Env = process.env, cwd: string = process.cwd(), tmp: string = os.tmpdir()): string {
  const explicit = (env.DATA_DIR ?? "").trim();
  if (explicit) return path.resolve(cwd, explicit);
  if (env.VERCEL) return path.join(tmp, "marketplace-demo-data");
  return path.join(cwd, ".data");
}
