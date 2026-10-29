import { describe, expect, it } from "vitest";
import path from "node:path";
import { FileRepo } from "@/lib/repo/file";
import { resolveMode, PublicDbRefusedError } from "@/lib/repo";
import { appendAudit, auditFor } from "@/lib/repo/audit";
import { ConflictError } from "@/lib/repo/types";

const seedDir = path.join(__dirname, "..", "seed");
const fresh = () => new FileRepo({ seedDir }); // in-memory: no dataDir

describe("resolveMode", () => {
  it("defaults to file when no URI", () => expect(resolveMode({})).toBe("file"));
  it("uses mongo when URI set", () => expect(resolveMode({ MONGODB_URI: "x" })).toBe("mongo"));
  it("DATA_MODE=file wins over URI", () => expect(resolveMode({ MONGODB_URI: "x", DATA_MODE: "file" })).toBe("file"));

  describe("public-deploy Mongo guard (S9)", () => {
    it("Vercel + MONGODB_URI refuses mongo mode", () => {
      expect(() => resolveMode({ VERCEL: "1", MONGODB_URI: "mongodb://x" })).toThrow(PublicDbRefusedError);
    });
    it("Vercel + DATA_MODE=mongo refuses too", () => {
      expect(() => resolveMode({ VERCEL: "1", DATA_MODE: "mongo", MONGODB_URI: "x" })).toThrow(/ALLOW_PUBLIC_DB/);
    });
    it("PUBLIC_DEMO=1 is treated as public", () => {
      expect(() => resolveMode({ PUBLIC_DEMO: "1", MONGODB_URI: "x" })).toThrow(PublicDbRefusedError);
    });
    it("ALLOW_PUBLIC_DB=1 lifts the guard; any other value does not", () => {
      expect(resolveMode({ VERCEL: "1", MONGODB_URI: "x", ALLOW_PUBLIC_DB: "1" })).toBe("mongo");
      expect(() => resolveMode({ VERCEL: "1", MONGODB_URI: "x", ALLOW_PUBLIC_DB: "true" })).toThrow(PublicDbRefusedError);
    });
    it("Vercel with no URI, or DATA_MODE=file, stays in file mode without error", () => {
      expect(resolveMode({ VERCEL: "1" })).toBe("file");
      expect(resolveMode({ VERCEL: "1", MONGODB_URI: "x", DATA_MODE: "file" })).toBe("file");
    });
    it("local with a URI still gets mongo (unchanged)", () => {
      expect(resolveMode({ MONGODB_URI: "x" })).toBe("mongo");
    });
  });
});

describe("seed", () => {
  it("has 6 capabilities, 3 suppliers and 55 hotel records (12x3 + 1 decoy + 16 scenario + 2 orphans)", async () => {
    const r = fresh();
    expect((await r.find("capabilities")).length).toBe(6);
    expect((await r.find("suppliers")).length).toBe(3);
    expect((await r.find("hotel_records")).length).toBe(55);
  });
  it("every seeded doc is labelled illustrative", async () => {
    const r = fresh();
    for (const c of ["suppliers", "capabilities", "partners", "hotel_records"] as const) {
      for (const d of await r.find(c)) expect(d.illustrative).toBe(true);
    }
  });
});

describe("FileRepo", () => {
  it("rejects a duplicate unique key with ConflictError", async () => {
    const r = fresh();
    await expect(
      r.insert("price_books", { _id: "pb_dupe", partnerId: "p_bank", version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
  it("transact rolls back every write on failure", async () => {
    const r = fresh();
    await expect(
      r.transact(async (tx) => {
        await tx.update("partners", "p_bank", { name: "changed" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await r.findOne("partners", { _id: "p_bank" }))?.name).not.toBe("changed");
  });
  it("returns copies, so callers cannot mutate stored state", async () => {
    const r = fresh();
    const a = await r.findOne("partners", { _id: "p_bank" });
    if (a) a.name = "mutated";
    expect((await r.findOne("partners", { _id: "p_bank" }))?.name).not.toBe("mutated");
  });
});

describe("audit log", () => {
  it("appends and is the only write path (update/upsert rejected)", async () => {
    const r = fresh();
    const id = await appendAudit(r, { entity: "x", entityId: "1", action: "proposed", actor: "system", reason: "why" });
    expect((await auditFor(r, "x", "1")).length).toBe(1);
    await expect(r.update("audit_log", id, { reason: "edited" })).rejects.toThrow("append-only");
    await expect(r.upsert("audit_log", { _id: id })).rejects.toThrow("append-only");
  });
});
