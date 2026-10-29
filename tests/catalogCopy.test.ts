import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAPABILITY_COPY, CATALOG_DISCLAIMER, FLOW_STRIP } from "@/lib/catalogCopy";

const seed = (n: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "seed", `${n}.json`), "utf8"));

describe("capability catalog copy (U6)", () => {
  const caps = seed("capabilities") as { _id: string; cacheable: boolean }[];
  const plans = seed("rate_plans") as { capabilityId: string }[];

  it("has copy for every seeded capability and no extras", () => {
    expect(Object.keys(CAPABILITY_COPY).sort()).toEqual(caps.map((c) => c._id).sort());
  });
  it("flow strip has the six steps in order", () => {
    expect(FLOW_STRIP).toEqual(["Supplier feeds", "Content & room mapping", "Dedupe", "Search", "Pricing & taxes", "Book"]);
  });
  it("badges agree with the seed: cacheable flag false <=> always fresh or per run", () => {
    for (const c of caps) {
      const f = CAPABILITY_COPY[c._id].freshness;
      if (c.cacheable) expect(["cacheable", "cacheable rules"]).toContain(f);
      else expect(["always fresh", "per run"]).toContain(f);
    }
  });
  it("seededPlan matches the rate plans in the seed, so no invented price is presented as seeded", () => {
    const withPlans = new Set(plans.map((p) => p.capabilityId));
    for (const id of Object.keys(CAPABILITY_COPY)) {
      expect(CAPABILITY_COPY[id].seededPlan, id).toBe(withPlans.has(id));
      if (!CAPABILITY_COPY[id].seededPlan) expect(CAPABILITY_COPY[id].price).toContain("illustrative; not in seed");
    }
  });
  it("calculator deep-link only on capabilities with a seeded plan", () => {
    for (const [id, c] of Object.entries(CAPABILITY_COPY)) {
      if (!c.seededPlan) expect(c.tryIt.some((t) => t.href === "/calculator"), id).toBe(false);
    }
  });
  it("every try-it link is a real page route", () => {
    for (const c of Object.values(CAPABILITY_COPY)) {
      for (const t of c.tryIt) expect(fs.existsSync(path.join(__dirname, "..", "app", t.href.slice(1), "page.tsx")), t.href).toBe(true);
    }
  });
  it("declares prices, freshness and latency illustrative", () => {
    expect(CATALOG_DISCLAIMER).toContain("illustrative");
  });
});
