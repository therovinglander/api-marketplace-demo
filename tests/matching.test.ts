import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FileRepo } from "@/lib/repo/file";
import { auditFor } from "@/lib/repo/audit";
import { addressSimilarity, jaroWinkler, nameSimilarity, normaliseName, phoneDigits, tokenDice } from "@/lib/matching/text";
import { haversineMeters, proposePairs, scorePair, candidatePairs, DEFAULT_MATCHING, type HotelRecord } from "@/lib/matching/score";
import { decideProposal, generateProposals, NotFoundError, proposalId } from "@/lib/matching/service";

const seedDir = path.join(__dirname, "..", "seed");
const repo = () => new FileRepo({ seedDir });
const records = async (r = repo()) => (await r.find("hotel_records")) as unknown as HotelRecord[];
const byId = (rs: HotelRecord[], id: string) => rs.find((x) => x._id === id)!;
const num = (i: number) => String(i).padStart(4, "0");

describe("text helpers", () => {
  it("Jaro-Winkler matches the textbook value for MARTHA/MARHTA", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.9611, 3);
  });
  it("is 1 for equal and 0 for disjoint", () => {
    expect(jaroWinkler("abc", "abc")).toBe(1);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });
  it("normalises abbreviations, ampersand, case, articles", () => {
    expect(normaliseName("The Foghorn Pt. Hotel")).toBe("foghorn point hotel");
    expect(normaliseName("Ashgrove Inn & Suites")).toBe("ashgrove inn and suites");
    expect(normaliseName("Wren St Hotel")).toBe("wren street hotel");
  });
  it("phone digits ignore formatting and a leading 1", () => {
    expect(phoneDigits("+1 416 555 0142")).toBe("4165550142");
    expect(phoneDigits("(416) 555-0142")).toBe("4165550142");
    expect(phoneDigits(null)).toBeNull();
  });
  it("tokenDice is order-insensitive", () => {
    expect(tokenDice(["a", "b"], ["b", "a"])).toBe(1);
    expect(tokenDice(["a", "b"], ["c"])).toBe(0);
  });
  it("name similarity handles reordering and extra words", () => {
    expect(nameSimilarity("Copperline Grand Hotel", "Grand Copperline")).toBeGreaterThan(0.8);
    expect(nameSimilarity("Larkspur Harbour Hotel", "Gannet Quay Hotel")).toBeLessThan(0.7);
  });
  it("address similarity tolerates abbreviations and postal formatting", () => {
    const a = { line1: "100 Queen Street West", city: "Toronto", postal: "M5H 2N2" };
    const b = { line1: "100 Queen St. W", city: "Toronto", postal: "m5h2n2" };
    expect(addressSimilarity(a, b)).toBe(1);
  });
  it("haversine: ~111 km per degree of latitude", () => {
    const d = haversineMeters({ type: "Point", coordinates: [0, 0] }, { type: "Point", coordinates: [0, 1] });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_500);
  });
});

describe("seeded dedupe", () => {
  it("has 55 records: 12 clusters x 3 suppliers + 1 decoy + 16 scenario records + 2 orphans", async () => {
    expect((await records()).length).toBe(55);
  });

  it("proposes every true pair (12 clusters x 3 pairs)", async () => {
    const rs = await records();
    const proposed = new Set(proposePairs(rs).map((p) => `${p.aId}|${p.bId}`));
    const missing: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const ids = ["SUP_A", "SUP_B", "SUP_C"].map((s) => `hr_${s}_${num(i)}`);
      for (const [x, y] of [[0, 1], [0, 2], [1, 2]]) {
        const [a, b] = [ids[x], ids[y]].sort();
        if (!proposed.has(`${a}|${b}`)) missing.push(`${a}|${b}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("proposes nothing else (no false positives across clusters)", async () => {
    const rs = await records();
    const clusterOf = (id: string) => (id.includes("decoy") ? "decoy" : id.slice(-4));
    const wrong = proposePairs(rs).filter((p) => clusterOf(p.aId) !== clusterOf(p.bId));
    expect(wrong).toEqual([]);
  });

  it("the same-name / different-city decoy scores < 0.60 against its namesake", async () => {
    const rs = await records();
    const decoy = byId(rs, "hr_SUP_C_decoy");
    for (const s of ["hr_SUP_A_0001", "hr_SUP_B_0001"]) {
      const res = scorePair(byId(rs, s), decoy);
      expect(res.score).toBeLessThan(0.6);
      expect(res.tier).toBeNull();
    }
    // different city and far away, so blocking never pairs it with its namesake (it only meets the Halifax hotel)
    const pairs = candidatePairs(rs).filter(([a, b]) => a._id === "hr_SUP_C_decoy" || b._id === "hr_SUP_C_decoy");
    const partners = pairs.map(([a, b]) => (a._id === "hr_SUP_C_decoy" ? b._id : a._id));
    expect(partners.every((id) => id.endsWith("_0012"))).toBe(true);
    // and it is never proposed against anything
    expect(proposePairs(rs).some((p) => p.aId.includes("decoy") || p.bId.includes("decoy"))).toBe(false);
  });

  it("missing phone: weights still sum to 1 and the reason says it was redistributed", async () => {
    const rs = await records();
    // clusters 1,4,7,10: supplier C has no phone
    const res = scorePair(byId(rs, "hr_SUP_A_0004"), byId(rs, "hr_SUP_C_0004"));
    expect(res.signals.phone).toBeNull();
    expect(res.phoneReweighted).toBe(true);
    const w = res.weights;
    expect(w.name + w.address + w.geo + w.phone).toBeCloseTo(1, 9);
    expect(w.phone).toBe(0);
    expect(res.reason).toContain("redistributed");
  });

  it("with all signals present, weights are the configured 0.35/0.30/0.25/0.10", async () => {
    const rs = await records();
    const res = scorePair(byId(rs, "hr_SUP_A_0001"), byId(rs, "hr_SUP_B_0001"));
    expect(res.signals.phone).toBe(1);
    for (const k of ["name", "address", "geo", "phone"] as const) {
      expect(res.weights[k]).toBeCloseTo(DEFAULT_MATCHING.weights[k], 9);
    }
  });

  it("only pairs across suppliers", async () => {
    const rs = await records();
    for (const [a, b] of candidatePairs(rs)) expect(a.supplierCode).not.toBe(b.supplierCode);
  });
});

describe("dedupe scenarios (U5)", () => {
  type Scn = { id: string; case: string; intended: "approve" | "reject"; band: "strong" | "review" | "below"; aId: string; bId: string };
  const scenarios = (): Scn[] => JSON.parse(fs.readFileSync(path.join(seedDir, "dedupe_scenarios.json"), "utf8"));

  it("covers all six required cases", () => {
    const cases = new Set(scenarios().map((s) => s.case));
    for (const c of ["Same brand, different property", "Sister properties at the same address", "Rebrand", "Bilingual name", "Location drift", "Typos and missing fields"]) {
      expect(cases.has(c)).toBe(true);
    }
  });

  it("every intended non-match scores below the strong (auto-approve) band", async () => {
    const rs = await records();
    for (const s of scenarios().filter((x) => x.intended === "reject")) {
      const res = scorePair(byId(rs, s.aId), byId(rs, s.bId));
      expect(res.score, `${s.id} ${s.case}`).toBeLessThan(DEFAULT_MATCHING.strong);
      expect(res.tier, s.id).not.toBe("strong");
    }
  });

  it("every intended match is proposed (strong or review), never silently dropped", async () => {
    const rs = await records();
    for (const s of scenarios().filter((x) => x.intended === "approve")) {
      const res = scorePair(byId(rs, s.aId), byId(rs, s.bId));
      expect(res.tier, `${s.id} ${s.case}`).not.toBeNull();
    }
  });

  it("each scenario lands in the band recorded for it", async () => {
    const rs = await records();
    for (const s of scenarios()) {
      const tier = scorePair(byId(rs, s.aId), byId(rs, s.bId)).tier ?? "below";
      expect(tier, `${s.id} ${s.case}`).toBe(s.band);
    }
  });

  it("the queue has a real spread: clear approves, a middle review band, and plausible rejects", async () => {
    const ps = proposePairs(await records());
    const strong = ps.filter((p) => p.result.tier === "strong").length;
    const review = ps.filter((p) => p.result.tier === "review").length;
    expect(strong).toBeGreaterThanOrEqual(10);
    expect(review).toBeGreaterThanOrEqual(20);
    const scores = ps.map((p) => p.result.score);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(0.25);
  });

  it("the rebrand is found through address, location and phone even though the names share nothing", async () => {
    const rs = await records();
    const s = scenarios().find((x) => x.case === "Rebrand")!;
    const res = scorePair(byId(rs, s.aId), byId(rs, s.bId));
    expect(res.signals.address).toBe(1);
    expect(res.signals.phone).toBe(1);
    expect(res.signals.name).toBeLessThan(0.7);
    expect(res.reason).toContain("name ");
  });

  it("the bilingual pair needs accent folding: Hôtel == Hotel", () => {
    expect(normaliseName("Hôtel Beauclerc")).toBe("hotel beauclerc");
    expect(nameSimilarity("Hôtel Beauclerc", "Beauclerc Hotel")).toBe(1);
  });

  it("location drift with no phone is reweighted and explained", async () => {
    const rs = await records();
    const s = scenarios().find((x) => x.case === "Location drift")!;
    const res = scorePair(byId(rs, s.aId), byId(rs, s.bId));
    expect(res.phoneReweighted).toBe(true);
    expect(res.reason).toContain("redistributed");
    expect(res.distanceMeters).toBeGreaterThan(250);
  });

  it("orphans are never proposed", async () => {
    const ps = proposePairs(await records());
    expect(ps.some((p) => p.aId.includes("_O0") || p.bId.includes("_O0"))).toBe(false);
  });
});

describe("proposal generation + review", () => {
  it("is idempotent: a re-run creates 0 new rows", async () => {
    const r = repo();
    const first = await generateProposals(r);
    expect(first.created).toBe(42);
    const second = await generateProposals(r);
    expect(second.created).toBe(0);
    expect((await r.find("match_proposals")).length).toBe(42);
    expect((await r.find("audit_log")).length).toBe(42);
  });

  it("a re-run never touches decided rows", async () => {
    const r = repo();
    await generateProposals(r);
    const id = proposalId("hr_SUP_A_0001", "hr_SUP_B_0001");
    await decideProposal(r, id, "reject", "tester", "different building");
    const again = await generateProposals(r);
    expect(again.skippedDecided).toBe(1);
    expect((await r.findOne("match_proposals", { _id: id }))?.status).toBe("rejected");
  });

  it("approve twice -> one canonical, unique members, proposal audited as proposed + approved", async () => {
    const r = repo();
    await generateProposals(r);
    const id = proposalId("hr_SUP_A_0001", "hr_SUP_B_0001");
    const first = await decideProposal(r, id, "approve", "tester", "same address and phone");
    const second = await decideProposal(r, id, "approve", "tester", "again");
    expect(first.alreadyDecided).toBe(false);
    expect(second.alreadyDecided).toBe(true);
    const canon = await r.find("canonical_hotels");
    expect(canon).toHaveLength(1);
    const members = canon[0].memberIds as string[];
    expect(new Set(members).size).toBe(members.length);
    expect(members.sort()).toEqual(["hr_SUP_A_0001", "hr_SUP_B_0001"]);
    const audit = await auditFor(r, "match_proposal", id);
    expect(audit.map((a) => a.action)).toEqual(["proposed", "approved"]);
    expect(audit[1].reason).toBe("same address and phone");
  });

  it("approving the third pair of a cluster unions into the same canonical hotel", async () => {
    const r = repo();
    await generateProposals(r);
    await decideProposal(r, proposalId("hr_SUP_A_0001", "hr_SUP_B_0001"), "approve", "t", "ok");
    await decideProposal(r, proposalId("hr_SUP_A_0001", "hr_SUP_C_0001"), "approve", "t", "ok");
    await decideProposal(r, proposalId("hr_SUP_B_0001", "hr_SUP_C_0001"), "approve", "t", "ok");
    const canon = await r.find("canonical_hotels");
    expect(canon).toHaveLength(1);
    expect((canon[0].memberIds as string[]).sort()).toEqual(["hr_SUP_A_0001", "hr_SUP_B_0001", "hr_SUP_C_0001"]);
  });

  it("reject writes status + audit and creates no canonical hotel", async () => {
    const r = repo();
    await generateProposals(r);
    const id = proposalId("hr_SUP_A_0002", "hr_SUP_B_0002");
    await decideProposal(r, id, "reject", "tester", "different tower");
    expect((await r.find("canonical_hotels")).length).toBe(0);
    expect((await auditFor(r, "match_proposal", id)).map((a) => a.action)).toEqual(["proposed", "rejected"]);
  });

  it("deciding an unknown proposal fails with NotFoundError and writes nothing", async () => {
    const r = repo();
    await expect(decideProposal(r, "mp_nope", "approve", "t", undefined)).rejects.toBeInstanceOf(NotFoundError);
    expect((await r.find("audit_log")).length).toBe(0);
  });

  it("the audit entry for a proposal carries signals, weights, thresholds and rule version", async () => {
    const r = repo();
    await generateProposals(r);
    const id = proposalId("hr_SUP_A_0004", "hr_SUP_C_0004");
    const [entry] = await auditFor(r, "match_proposal", id);
    const d = entry.details as Record<string, unknown>;
    expect(d.ruleVersion).toBe("v2");
    expect(d.thresholds).toEqual({ strong: 0.85, review: 0.6 });
    expect(d.phoneReweighted).toBe(true);
    expect(entry.reason).toContain("redistributed");
  });
});
