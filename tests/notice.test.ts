import { describe, expect, it } from "vitest";
import path from "node:path";
import { FileRepo } from "@/lib/repo/file";
import { compareModels, validateInputs } from "@/lib/pricing/calculator";
import { loadPricingContext, plansFor } from "@/lib/pricing/load";
import { PRESETS, isLosingMoney, whatToNotice } from "@/lib/pricing/notice";

const ctx = () => loadPricingContext(new FileRepo({ seedDir: path.join(__dirname, "..", "seed") }));

describe("calculator copy and presets (U3)", () => {
  it("has the three required presets and every one is within input ranges", () => {
    expect(PRESETS.map((p) => p.label)).toEqual(["Typical agency", "Browsing-heavy partner (L2B 5,000)", "Bank portal"]);
    for (const p of PRESETS) {
      expect(validateInputs(p.inputs), p.label).toEqual([]);
      expect(p.tooltip).toContain("illustrative");
    }
    expect(PRESETS[0].inputs).toEqual({ S: 800_000, r: 1000, c: 0.85, h: 0.3 });
    expect(PRESETS[1].inputs).toEqual({ S: 5_000_000, r: 5000, c: 0.85, h: 0.3 });
    expect(PRESETS[2].inputs).toEqual({ S: 60_000_000, r: 2000, c: 0.85, h: 0.3 });
  });

  it("browsing-heavy preset: per-booking margin is -$91.40 (552.50 revenue less 462.00 + 181.90 supplier cost)", async () => {
    const c = await ctx();
    const p = PRESETS[1];
    const rows = compareModels(p.inputs, plansFor(c, p.segment), c.blended);
    const pb = rows.find((r) => r.model === "per_booking")!;
    expect(pb.bill).toBeCloseTo(552.5, 6);
    expect(pb.supplierCost).toBeCloseTo(643.9, 6);
    expect(pb.margin).toBeCloseTo(-91.4, 6);
    expect(isLosingMoney(pb)).toBe(true);
  });

  it("the red highlight keys off margin < 0, not off r = 5000", async () => {
    const c = await ctx();
    // Same r, much higher volume of bookings per search is irrelevant; use r where the model is profitable
    const ok = compareModels({ S: 5_000_000, r: 1000, c: 0.85, h: 0.3 }, plansFor(c, "agency"), c.blended).find((r) => r.model === "per_booking")!;
    expect(isLosingMoney(ok)).toBe(false);
    // A different r that also loses money: r = 8000
    const bad = compareModels({ S: 5_000_000, r: 8000, c: 0.85, h: 0.3 }, plansFor(c, "agency"), c.blended).find((r) => r.model === "per_booking")!;
    expect(isLosingMoney(bad)).toBe(true);
    expect(isLosingMoney({ margin: 0 })).toBe(false);
  });

  it("the three 'what to notice' points use live numbers", async () => {
    const c = await ctx();
    const n = whatToNotice(c, "agency", { S: 5_000_000, r: 1000, c: 0.85, h: 0.3 });
    expect(n).toHaveLength(3);
    // $0.0004 x 1000 / 0.85 = $0.4706 per confirmed booking
    expect(n[0].body).toContain("At 1,000:1, $0.0004 a search is $0.47 a booking.");
    expect(n[1].body).toContain("5,000");
    expect(n[1].body).toContain("negative (-$91.40/month)");
    expect(n[2].body).toContain("break-even");
  });

  it("point 1 follows the look-to-book input", async () => {
    const c = await ctx();
    const n = whatToNotice(c, "agency", { S: 5_000_000, r: 2000, c: 0.85, h: 0.3 });
    expect(n[0].body).toContain("At 2,000:1");
    expect(n[0].body).toContain("$0.94 a booking");
  });
});
