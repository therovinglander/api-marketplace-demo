import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isPublicDemo, resolveDataDir } from "@/lib/repo/runtime";
import { FileRepo } from "@/lib/repo/file";

describe("resolveDataDir (S9)", () => {
  const cwd = "/app";
  const tmp = "/tmp";
  it("local: <cwd>/.data, unchanged", () => {
    expect(resolveDataDir({}, cwd, tmp)).toBe(path.join(cwd, ".data"));
  });
  it("on Vercel: a folder under the OS temp dir, never the deploy filesystem", () => {
    const d = resolveDataDir({ VERCEL: "1" }, cwd, tmp);
    expect(d).toBe(path.join(tmp, "marketplace-demo-data"));
    expect(d.startsWith(cwd)).toBe(false);
  });
  it("uses os.tmpdir() by default", () => {
    expect(resolveDataDir({ VERCEL: "1" }, cwd)).toBe(path.join(os.tmpdir(), "marketplace-demo-data"));
  });
  it("DATA_DIR wins over VERCEL and over the default; relative paths resolve against cwd", () => {
    expect(resolveDataDir({ VERCEL: "1", DATA_DIR: "/mnt/x" }, cwd, tmp)).toBe("/mnt/x");
    expect(resolveDataDir({ DATA_DIR: "state" }, cwd, tmp)).toBe(path.join(cwd, "state"));
  });
  it("a blank DATA_DIR is ignored", () => {
    expect(resolveDataDir({ DATA_DIR: "  " }, cwd, tmp)).toBe(path.join(cwd, ".data"));
  });
  it("isPublicDemo: VERCEL or PUBLIC_DEMO=1 only", () => {
    expect(isPublicDemo({})).toBe(false);
    expect(isPublicDemo({ VERCEL: "1" })).toBe(true);
    expect(isPublicDemo({ PUBLIC_DEMO: "1" })).toBe(true);
    expect(isPublicDemo({ PUBLIC_DEMO: "0" })).toBe(false);
  });
  it("a FileRepo pointed at the temp dir writes there and the seed folder stays untouched", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "s9-"));
    const seedDir = path.join(__dirname, "..", "seed");
    const before = fs.readdirSync(seedDir).sort();
    const repo = new FileRepo({ seedDir, dataDir });
    await repo.insert("partners", { _id: "p_s9_test", name: "tmp test" });
    expect(fs.existsSync(path.join(dataDir, "partners.json"))).toBe(true);
    expect(fs.readdirSync(seedDir).sort()).toEqual(before);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
