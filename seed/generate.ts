// Deterministic seed generator. Run: npm run seed:gen  (writes seed/*.json, committed).
// ALL DATA IS INVENTED AND ILLUSTRATIVE. No real hotels, partners or prices.
import fs from "node:fs";
import path from "node:path";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261028);
const ill = { illustrative: true };

// ---- suppliers, capabilities, plans, partners, config ----
const suppliers = [
  { _id: "SUP_A", name: "Fictional Supplier A", costPerSearch: 0.00012, costPerBooking: 0.2, latencyMs: 180, weight: 0.5 },
  { _id: "SUP_B", name: "Fictional Supplier B", costPerSearch: 0.00018, costPerBooking: 0.28, latencyMs: 240, weight: 0.3 },
  { _id: "SUP_C", name: "Fictional Supplier C", costPerSearch: 0.00009, costPerBooking: 0.15, latencyMs: 320, weight: 0.2 },
].map((s) => ({ ...s, ...ill }));

const capabilities = [
  { _id: "search", name: "Search", unit: "search", summary: "Availability and rates across connected suppliers.", supplierCostPerCall: 0.000132, supplierCostPerBooking: 0.214, cacheable: true, sandboxExample: { hotelId: "H-1001", checkIn: "2027-03-01", nights: 2 } },
  { _id: "content-mapping", name: "Content & Property Mapping", unit: "search", summary: "Normalised property content and supplier-code crosswalk.", supplierCostPerCall: 0.00004, supplierCostPerBooking: 0, cacheable: true, sandboxExample: { supplierCode: "SUP_A", supplierHotelId: "A-0001" } },
  { _id: "room-mapping", name: "Room Mapping", unit: "record", summary: "Match supplier room types to a canonical room list.", supplierCostPerCall: 0.002, supplierCostPerBooking: 0, cacheable: true, sandboxExample: { roomName: "Deluxe King City View" } },
  { _id: "dedupe", name: "Dedupe", unit: "record", summary: "Detect duplicate properties across suppliers; propose merges for human review.", supplierCostPerCall: 0.001, supplierCostPerBooking: 0, cacheable: false, sandboxExample: { name: "Larkspur Harbour Hotel", postal: "M5H 2N2" } },
  { _id: "pricing", name: "Pricing", unit: "search", summary: "Final bookable price including supplier net-rate margin.", supplierCostPerCall: 0.00006, supplierCostPerBooking: 0, cacheable: false, sandboxExample: { hotelId: "H-1001", rateKey: "rk_demo" } },
  { _id: "taxes", name: "Taxes & Fees", unit: "booking", summary: "Estimated taxes and mandatory fees per stay.", supplierCostPerCall: 0, supplierCostPerBooking: 0.02, cacheable: true, sandboxExample: { hotelId: "H-1001", nights: 2 } },
].map((c) => ({ ...c, openapiPath: `/openapi/${c._id}.yaml`, ...ill }));

const hybrid = (capabilityId: string, F: number, A: number, e: number) => ({
  _id: `rp_${capabilityId}_hybrid`, capabilityId, model: "hybrid", segment: "all",
  label: `Hybrid: $${F}/mo includes ${A}:1 look-to-book, then $${e}/excess search`,
  params: { F, A, e }, ...ill,
});
const rate_plans = [
  { _id: "rp_search_flat_agency", capabilityId: "search", model: "flat", segment: "agency", label: "Flat $12,000/mo", params: { F: 12000 }, ...ill },
  { _id: "rp_search_flat_ota", capabilityId: "search", model: "flat", segment: "ota", label: "Flat $30,000/mo", params: { F: 30000 }, ...ill },
  { _id: "rp_search_flat_bank", capabilityId: "search", model: "flat", segment: "bank", label: "Flat $60,000/mo", params: { F: 60000 }, ...ill },
  { _id: "rp_search_per_search", capabilityId: "search", model: "per_search", segment: "all", label: "$0.0004 per search", params: { p: 0.0004 }, ...ill },
  { _id: "rp_search_per_booking", capabilityId: "search", model: "per_booking", segment: "all", label: "$0.65 per confirmed booking", params: { q: 0.65 }, ...ill },
  hybrid("search", 3000, 1500, 0.005),
  hybrid("content-mapping", 1200, 3000, 0.002),
  hybrid("pricing", 2000, 800, 0.01),
];

const partners = [
  { _id: "p_agency", name: "Maple Row Travel (fictional agency)", segment: "agency", monthlySearches: 800000, l2b: 1000, notes: "Small agency, no commitment." },
  { _id: "p_ota", name: "Kestrel Trips (fictional OTA)", segment: "ota", monthlySearches: 5000000, l2b: 1200, notes: "Mid-size OTA." },
  { _id: "p_bank", name: "Northgate Rewards Bank (fictional)", segment: "bank", monthlySearches: 60000000, l2b: 2000, notes: "Large committed-volume partner." },
].map((p) => ({ ...p, ...ill }));

const price_books = [
  { _id: "pb_p_agency_v1", partnerId: "p_agency", version: 1, status: "active", effectiveFrom: "2026-11-01T00:00:00.000Z", supersedes: null,
    lines: [{ capabilityId: "search", ratePlanId: "rp_search_per_search", committedMonthlyVolume: 0, discountPct: 0 }] },
  { _id: "pb_p_bank_v1", partnerId: "p_bank", version: 1, status: "active", effectiveFrom: "2026-11-01T00:00:00.000Z", supersedes: null,
    lines: [{ capabilityId: "search", ratePlanId: "rp_search_per_search", committedMonthlyVolume: 60000000, discountPct: 15 }] },
].map((p) => ({ ...p, ...ill }));

const app_config = [
  { _id: "cache", hitRate: 0.3, ttlMinutes: 10, hitRateMax: 0.9, hitRateVendorClaim: 0.7, staleCap: 0.12, staleBase: 0.0015, failedCheckoutCost: 4 },
  { _id: "matching", ruleVersion: "v2", weights: { name: 0.35, address: 0.3, geo: 0.25, phone: 0.1 }, strong: 0.85, review: 0.6, geoFullDecayMeters: 300, blockMeters: 500, blockPostalPrefix: 3 },
  { _id: "l2b_refs", duffel: { excessFeePerSearch: 0.005, aboveL2B: 1500, source: "duffel.com/pricing (vendor-listed, Oct 2026)" }, ndcGateway: { excessFeePerSearch: 0.05, aboveL2B: 400, source: "ndcgateway.com/en-US/pricing (vendor-listed, Oct 2026)" } },
].map((c) => ({ ...c, ...ill }));

// ---- hotels: 12 true clusters x 3 suppliers + 1 same-name decoy ----
interface Base {
  names: [string, string, string]; line1: string; city: string; region: string; country: string;
  postal: string; lat: number; lng: number; phone: string | null; stars: number;
}
const bases: Base[] = [
  { names: ["Larkspur Harbour Hotel", "The Larkspur Harbour", "LARKSPUR HARBOUR HOTEL"], line1: "100 Queen Street West", city: "Toronto", region: "ON", country: "CA", postal: "M5H 2N2", lat: 43.6532, lng: -79.3832, phone: "4165550142", stars: 4 },
  { names: ["Quillon Court Suites", "Quillon Court Suite Hotel", "Quillon Ct. Suites"], line1: "2250 Sherbrooke Street West", city: "Montreal", region: "QC", country: "CA", postal: "H3H 1G6", lat: 45.499, lng: -73.579, phone: "5145550177", stars: 4 },
  { names: ["Marrow Bay Lodge", "Marrow Bay Lodge & Spa", "Marrow Bay Lodge"], line1: "780 Granville Street", city: "Vancouver", region: "BC", country: "CA", postal: "V6Z 1K3", lat: 49.283, lng: -123.12, phone: "6045550119", stars: 3 },
  { names: ["Copperline Grand Hotel", "Grand Copperline", "Copperline Grand"], line1: "410 North Wabash Avenue", city: "Chicago", region: "IL", country: "US", postal: "60611", lat: 41.89, lng: -87.626, phone: "3125550163", stars: 5 },
  { names: ["Ashgrove Inn & Suites", "Ashgrove Inn and Suites", "The Ashgrove Inn"], line1: "1600 Congress Avenue", city: "Austin", region: "TX", country: "US", postal: "78701", lat: 30.28, lng: -97.743, phone: "5125550188", stars: 3 },
  { names: ["Wren Street Hotel", "Wren St Hotel", "Wren Street Boutique Hotel"], line1: "55 Wren Street", city: "Boston", region: "MA", country: "US", postal: "02108", lat: 42.358, lng: -71.064, phone: "6175550131", stars: 4 },
  { names: ["Tamarack Peak Resort", "Tamarack Peak Resort & Spa", "TAMARACK PEAK"], line1: "1900 Blake Street", city: "Denver", region: "CO", country: "US", postal: "80202", lat: 39.753, lng: -104.999, phone: "3035550154", stars: 5 },
  { names: ["Foghorn Point Hotel", "The Foghorn Point", "Foghorn Pt. Hotel"], line1: "2100 Alaskan Way", city: "Seattle", region: "WA", country: "US", postal: "98121", lat: 47.612, lng: -122.35, phone: "2065550126", stars: 4 },
  { names: ["Eldermere Plaza", "Eldermere Plaza Hotel", "Eldermere Plaza"], line1: "330 Centre Street South", city: "Calgary", region: "AB", country: "CA", postal: "T2P 0K1", lat: 51.048, lng: -114.063, phone: "4035550108", stars: 3 },
  { names: ["Brindle Row Hotel", "Brindle Row", "Brindle Row Hotel Ottawa"], line1: "88 Elgin Street", city: "Ottawa", region: "ON", country: "CA", postal: "K1P 5K7", lat: 45.422, lng: -75.693, phone: "6135550171", stars: 4 },
  { names: ["Saltwick Suites", "Saltwick Hotel Suites", "Saltwick Suites"], line1: "720 SW Salmon Street", city: "Portland", region: "OR", country: "US", postal: "97205", lat: 45.517, lng: -122.68, phone: "5035550149", stars: 3 },
  { names: ["Gannet Quay Hotel", "Gannet Quay", "The Gannet Quay Hotel"], line1: "1550 Lower Water Street", city: "Halifax", region: "NS", country: "CA", postal: "B3J 1R7", lat: 44.648, lng: -63.571, phone: "9025550136", stars: 4 },
];

const ABBR: [RegExp, string][] = [[/\bStreet\b/g, "St."], [/\bAvenue\b/g, "Ave."], [/\bWest\b/g, "W"], [/\bSouth\b/g, "S"], [/\bNorth\b/g, "N"]];
const abbreviate = (s: string) => ABBR.reduce((acc, [re, to]) => acc.replace(re, to), s);
/** Swap the last two digits of the street number (a "transposed digits" typo). */
const transpose = (s: string) => s.replace(/^(\d*)(\d)(\d)\b/, (_m, a: string, b: string, c: string) => `${a}${c}${b}`);

function drift(lat: number, lng: number, minM: number, maxM: number): [number, number] {
  const d = minM + rnd() * (maxM - minM);
  const ang = rnd() * 2 * Math.PI;
  const dLat = (d * Math.cos(ang)) / 111320;
  const dLng = (d * Math.sin(ang)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

const ROOMS: [string, string, number, string][] = [
  ["KNG", "Deluxe King", 1, "city"], ["TWN", "Standard Twin", 2, "garden"], ["STE", "One-Bedroom Suite", 1, "water"],
];

const hotel_records: Record<string, unknown>[] = [];
const sup = ["SUP_A", "SUP_B", "SUP_C"];
bases.forEach((b, i) => {
  sup.forEach((code, s) => {
    const line1 = s === 0 ? b.line1 : s === 1 ? abbreviate(b.line1) : i % 2 === 0 ? transpose(abbreviate(b.line1)) : abbreviate(b.line1).toLowerCase();
    const postal = s === 0 ? b.postal : s === 1 ? b.postal.replace(" ", "") : b.postal.toLowerCase();
    const [lat, lng] = s === 0 ? [b.lat, b.lng] : s === 1 ? drift(b.lat, b.lng, 50, 150) : drift(b.lat, b.lng, 100, 300);
    const phone = b.phone === null ? null : s === 0 ? `+1 ${b.phone.slice(0, 3)} ${b.phone.slice(3, 6)} ${b.phone.slice(6)}` : s === 1 ? `(${b.phone.slice(0, 3)}) ${b.phone.slice(3, 6)}-${b.phone.slice(6)}` : i % 3 === 0 ? null : b.phone;
    hotel_records.push({
      _id: `hr_${code}_${String(i + 1).padStart(4, "0")}`, supplierCode: code, supplierHotelId: `${code.slice(-1)}-${String(i + 1).padStart(4, "0")}`,
      name: b.names[s], address: { line1, city: b.city, region: b.region, country: b.country, postal },
      geo: { type: "Point", coordinates: [r6(lng), r6(lat)] }, phone, stars: b.stars,
      rooms: ROOMS.map(([c, n, beds, view]) => ({ code: `${code.slice(-1)}${c}`, name: s === 2 ? n.toUpperCase() : n, beds, view })),
      ...ill,
    });
  });
});
// Decoy: same name as cluster 1, different city. Must NOT be proposed against cluster 1.
hotel_records.push({
  _id: "hr_SUP_C_decoy", supplierCode: "SUP_C", supplierHotelId: "C-9001", name: "Larkspur Harbour Hotel",
  address: { line1: "9 Barrington Street", city: "Halifax", region: "NS", country: "CA", postal: "B3J 1Z4" },
  geo: { type: "Point", coordinates: [-63.5752, 44.6488] }, phone: "9025550999", stars: 3,
  rooms: [{ code: "CKNG", name: "Standard King", beds: 1, view: "street" }], ...ill,
});

// ---- U5: dedupe scenarios. Each pair is a deliberate test of the matcher; the intended outcome is recorded in
// seed/dedupe_scenarios.json (documentation + test input, not loaded as a collection). ALL INVENTED. ----
type Outcome = "approve" | "reject";
interface Rec { sup: "SUP_A" | "SUP_B" | "SUP_C"; name: string; line1: string; city: string; region: string; country: string; postal: string; lat: number; lng: number; phone: string | null; stars: number }
interface Scenario { id: string; case: string; intended: Outcome; band: "strong" | "review" | "below"; note: string; a: Rec; b: Rec }
const scenarios: Scenario[] = [
  { id: "S01", case: "Same brand, different property", intended: "reject", band: "below",
    note: "Same chain, downtown vs airport: name matches, nothing else does.",
    a: { sup: "SUP_A", name: "Ironbark Grand Downtown", line1: "800 Nicollet Mall", city: "Minneapolis", region: "MN", country: "US", postal: "55402", lat: 44.9778, lng: -93.2650, phone: "6125550201", stars: 4 },
    b: { sup: "SUP_B", name: "Ironbark Grand Airport", line1: "2 Airport Road", city: "Bloomington", region: "MN", country: "US", postal: "55425", lat: 44.8590, lng: -93.2410, phone: "9525550202", stars: 3 } },
  { id: "S02", case: "Sister properties at the same address", intended: "reject", band: "review",
    note: "Hotel and residences share a building; the phone and the name differ. Lands in the review band for a human to reject.",
    a: { sup: "SUP_A", name: "Pelham Street Hotel", line1: "70 Pelham Street", city: "Savannah", region: "GA", country: "US", postal: "31401", lat: 32.0809, lng: -81.0912, phone: "9125550211", stars: 4 },
    b: { sup: "SUP_C", name: "Pelham Street Residences", line1: "70 Pelham Street", city: "Savannah", region: "GA", country: "US", postal: "31401", lat: 32.0809, lng: -81.0912, phone: "9125550212", stars: 4 } },
  { id: "S03", case: "Rebrand", intended: "approve", band: "review",
    note: "Totally different name, same address, location and phone. The name signal is near zero, so the score stays in the review band for a human to approve.",
    a: { sup: "SUP_B", name: "Meridian Lakeside Inn", line1: "15 Shoreline Drive", city: "Kelowna", region: "BC", country: "CA", postal: "V1Y 5B6", lat: 49.8880, lng: -119.4960, phone: "2505550221", stars: 3 },
    b: { sup: "SUP_C", name: "Cedarwood Waterfront Lodge", line1: "15 Shoreline Dr.", city: "Kelowna", region: "BC", country: "CA", postal: "V1Y5B6", lat: 49.8880, lng: -119.4960, phone: "(250) 555-0221", stars: 3 } },
  { id: "S04", case: "Bilingual name", intended: "approve", band: "strong",
    note: "French and English forms of the same name, with diacritics. Needs accent folding (rule v2).",
    a: { sup: "SUP_A", name: "Hôtel Beauclerc", line1: "12 Rue Saint-Louis", city: "Québec", region: "QC", country: "CA", postal: "G1R 3Z2", lat: 46.8110, lng: -71.2050, phone: "4185550231", stars: 4 },
    b: { sup: "SUP_B", name: "Beauclerc Hotel", line1: "12 rue Saint-Louis", city: "Quebec", region: "QC", country: "CA", postal: "G1R3Z2", lat: 46.8112, lng: -71.2052, phone: "+1 418 555 0231", stars: 4 } },
  { id: "S05", case: "Location drift", intended: "approve", band: "review",
    note: "Same hotel, coordinates about 300 m apart, and no phone on one side. A human should look at it.",
    a: { sup: "SUP_A", name: "Harlow Bridge Hotel", line1: "500 Water Street", city: "Wilmington", region: "NC", country: "US", postal: "28401", lat: 34.2360, lng: -77.9480, phone: "9105550241", stars: 3 },
    b: { sup: "SUP_C", name: "Harlow Bridge Hotel", line1: "500 Water St", city: "Wilmington", region: "NC", country: "US", postal: "28401", lat: 34.2387, lng: -77.9480, phone: null, stars: 3 } },
  { id: "S06", case: "Typos and missing fields", intended: "approve", band: "review",
    note: "Misspelt name, extra words and no street line on one side. A lower score than the clean pairs, but still the same hotel.",
    a: { sup: "SUP_B", name: "Tamarak Ridge Lodge", line1: "300 Mountain Avenue", city: "Banff", region: "AB", country: "CA", postal: "T1L 1A1", lat: 51.1784, lng: -115.5708, phone: "4035550251", stars: 4 },
    b: { sup: "SUP_C", name: "Tamarack Ridge Lodge & Spa", line1: "", city: "Banff", region: "AB", country: "CA", postal: "T1L 1A1", lat: 51.1784, lng: -115.5708, phone: "4035550251", stars: 4 } },
  { id: "S07", case: "Same chain, same street", intended: "reject", band: "below",
    note: "Two franchise properties on one road, about 1.2 km apart.",
    a: { sup: "SUP_A", name: "Northwind Suites", line1: "410 Main Street", city: "Boise", region: "ID", country: "US", postal: "83702", lat: 43.6150, lng: -116.2023, phone: "2085550261", stars: 3 },
    b: { sup: "SUP_B", name: "Northwind Suites", line1: "1850 Main Street", city: "Boise", region: "ID", country: "US", postal: "83702", lat: 43.6255, lng: -116.2023, phone: "2085550262", stars: 3 } },
  { id: "S08", case: "Orientation suffix", intended: "reject", band: "review",
    note: "North and South wings sold as separate properties 120 m apart on one road, with different phones. Needs a human to reject.",
    a: { sup: "SUP_A", name: "Harbourview Inn North", line1: "9 Pier Road", city: "Victoria", region: "BC", country: "CA", postal: "V8W 1A1", lat: 48.4222, lng: -123.3657, phone: "2505550271", stars: 3 },
    b: { sup: "SUP_C", name: "Harbourview Inn South", line1: "11 Pier Road", city: "Victoria", region: "BC", country: "CA", postal: "V8W 1A1", lat: 48.4211, lng: -123.3657, phone: "2505550272", stars: 3 } },
];
// Two orphans with no counterpart anywhere: they must never be proposed.
const orphans: Rec[] = [
  { sup: "SUP_A", name: "Lantern Hill Cabins", line1: "1 Ridge Trail", city: "Asheville", region: "NC", country: "US", postal: "28801", lat: 35.5951, lng: -82.5515, phone: "8285550281", stars: 2 },
  { sup: "SUP_C", name: "Fennimore Station Hotel", line1: "22 Depot Street", city: "Fargo", region: "ND", country: "US", postal: "58102", lat: 46.8772, lng: -96.7898, phone: null, stars: 3 },
];
const toRecord = (r: Rec, id: string, n: number): Record<string, unknown> => ({
  _id: id, supplierCode: r.sup, supplierHotelId: `${r.sup.slice(-1)}-${n}`,
  name: r.name, address: { line1: r.line1, city: r.city, region: r.region, country: r.country, postal: r.postal },
  geo: { type: "Point", coordinates: [r6(r.lng), r6(r.lat)] }, phone: r.phone, stars: r.stars,
  rooms: ROOMS.slice(0, 2).map(([c, nm, beds, view]) => ({ code: `${r.sup.slice(-1)}${c}`, name: nm, beds, view })),
  ...ill,
});
const scenarioDocs = scenarios.map((s) => ({
  id: s.id, case: s.case, intended: s.intended, band: s.band, note: s.note,
  aId: `hr_${s.a.sup}_${s.id}`, bId: `hr_${s.b.sup}_${s.id}`,
}));
scenarios.forEach((s, i) => {
  hotel_records.push(toRecord(s.a, `hr_${s.a.sup}_${s.id}`, 9100 + i * 2));
  hotel_records.push(toRecord(s.b, `hr_${s.b.sup}_${s.id}`, 9101 + i * 2));
});
orphans.forEach((o, i) => hotel_records.push(toRecord(o, `hr_${o.sup}_O${String(i + 1).padStart(2, "0")}`, 9200 + i)));

const out: Record<string, unknown[]> = {
  suppliers, capabilities, rate_plans, partners, price_books, hotel_records, app_config,
};
const dir = path.join(process.cwd(), "seed");
fs.mkdirSync(dir, { recursive: true });
for (const [name, rows] of Object.entries(out)) {
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rows, null, 2) + "\n");
}
fs.writeFileSync(path.join(dir, "dedupe_scenarios.json"), JSON.stringify(scenarioDocs, null, 2) + "\n");
console.log(`seed written: ${Object.entries(out).map(([k, v]) => `${k}=${v.length}`).join(" ")}`);
