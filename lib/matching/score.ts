import { addressSimilarity, nameSimilarity, normalisePostal, phoneDigits } from "./text";

export interface GeoPoint {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
}

export interface HotelRecord {
  _id: string;
  supplierCode: string;
  supplierHotelId: string;
  name: string;
  address: { line1: string; city: string; region: string; country: string; postal: string };
  geo: GeoPoint;
  phone: string | null;
  stars: number;
}

export interface MatchingConfig {
  ruleVersion: string;
  weights: { name: number; address: number; geo: number; phone: number };
  strong: number;
  review: number;
  geoFullDecayMeters: number;
  blockMeters: number;
  blockPostalPrefix: number;
}

export const DEFAULT_MATCHING: MatchingConfig = {
  ruleVersion: "v2",
  weights: { name: 0.35, address: 0.3, geo: 0.25, phone: 0.1 },
  strong: 0.85,
  review: 0.6,
  geoFullDecayMeters: 300,
  blockMeters: 500,
  blockPostalPrefix: 3,
};

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const [lng1, lat1] = a.coordinates;
  const [lng2, lat2] = b.coordinates;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Tier = "strong" | "review";

export interface Signals {
  name: number;
  address: number;
  geo: number;
  /** null when either record has no phone */
  phone: number | null;
}

export interface ScoreResult {
  score: number;
  signals: Signals;
  /** Effective weights actually used; sum to 1. Phone is 0 when it was missing. */
  weights: { name: number; address: number; geo: number; phone: number };
  phoneReweighted: boolean;
  distanceMeters: number;
  /** null when below the review threshold (not proposed) */
  tier: Tier | null;
  reason: string;
}

const f2 = (n: number) => n.toFixed(2);

export function scorePair(a: HotelRecord, b: HotelRecord, cfg: MatchingConfig = DEFAULT_MATCHING): ScoreResult {
  const distanceMeters = haversineMeters(a.geo, b.geo);
  const pa = phoneDigits(a.phone);
  const pb = phoneDigits(b.phone);
  const signals: Signals = {
    name: nameSimilarity(a.name, b.name),
    address: addressSimilarity(a.address, b.address),
    geo: Math.max(0, 1 - distanceMeters / cfg.geoFullDecayMeters),
    phone: pa && pb ? (pa === pb ? 1 : 0) : null,
  };
  const phoneReweighted = signals.phone === null;
  const base = cfg.weights;
  const total = base.name + base.address + base.geo + (phoneReweighted ? 0 : base.phone);
  const weights = {
    name: base.name / total,
    address: base.address / total,
    geo: base.geo / total,
    phone: phoneReweighted ? 0 : base.phone / total,
  };
  const score =
    weights.name * signals.name + weights.address * signals.address + weights.geo * signals.geo + weights.phone * (signals.phone ?? 0);
  const tier: Tier | null = score >= cfg.strong ? "strong" : score >= cfg.review ? "review" : null;

  const parts = [
    `name ${f2(signals.name)} x ${f2(weights.name)}`,
    `address ${f2(signals.address)} x ${f2(weights.address)}`,
    `geo ${f2(signals.geo)} (${Math.round(distanceMeters)} m apart) x ${f2(weights.geo)}`,
    signals.phone === null ? "phone missing on one side, its weight was redistributed over the other signals" : `phone ${f2(signals.phone)} x ${f2(weights.phone)}`,
  ];
  const verdict =
    tier === "strong"
      ? `score ${f2(score)} >= ${f2(cfg.strong)} (strong)`
      : tier === "review"
        ? `score ${f2(score)} is between ${f2(cfg.review)} and ${f2(cfg.strong)} (needs human review)`
        : `score ${f2(score)} < ${f2(cfg.review)} (not proposed)`;
  return {
    score,
    signals,
    weights,
    phoneReweighted,
    distanceMeters,
    tier,
    reason: `${parts.join("; ")}. ${verdict}. Rule ${cfg.ruleVersion}.`,
  };
}

/** Cross-supplier candidate pairs sharing a postal prefix OR within blockMeters. Stored with aId < bId. */
export function candidatePairs(records: HotelRecord[], cfg: MatchingConfig = DEFAULT_MATCHING): [HotelRecord, HotelRecord][] {
  const prefix = (r: HotelRecord) => normalisePostal(r.address.postal).slice(0, cfg.blockPostalPrefix);
  const out: [HotelRecord, HotelRecord][] = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const x = records[i];
      const y = records[j];
      if (x.supplierCode === y.supplierCode) continue;
      const samePrefix = prefix(x) !== "" && prefix(x) === prefix(y);
      if (!samePrefix && haversineMeters(x.geo, y.geo) > cfg.blockMeters) continue;
      out.push(x._id < y._id ? [x, y] : [y, x]);
    }
  }
  return out;
}

export interface Proposal {
  aId: string;
  bId: string;
  result: ScoreResult;
}

/** Pure: every candidate pair that reaches the review threshold, best first. */
export function proposePairs(records: HotelRecord[], cfg: MatchingConfig = DEFAULT_MATCHING): Proposal[] {
  return candidatePairs(records, cfg)
    .map(([a, b]) => ({ aId: a._id, bId: b._id, result: scorePair(a, b, cfg) }))
    .filter((p) => p.result.tier !== null)
    .sort((p, q) => q.result.score - p.result.score || p.aId.localeCompare(q.aId));
}
