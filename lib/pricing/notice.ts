// U3: calculator copy and presets. Pure so numbers can be pinned in tests. Presets are illustrative.
import { compareModels, type Inputs, type ModelResult } from "./calculator";
import { plansFor, type PricingContext, type Segment } from "./load";

const money = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp });

export interface Preset {
  label: string;
  inputs: Inputs;
  segment: Segment;
  tooltip: string;
}

export const PRESETS: Preset[] = [
  {
    label: "Typical agency",
    inputs: { S: 800_000, r: 1000, c: 0.85, h: 0.3 },
    segment: "agency",
    tooltip: "Small agency, about 1,000 searches per booking (illustrative; mirrors fictional Maple Row Travel).",
  },
  {
    label: "Browsing-heavy partner (L2B 5,000)",
    inputs: { S: 5_000_000, r: 5000, c: 0.85, h: 0.3 },
    segment: "ota",
    tooltip: "Lots of looking, few bookings. Watch the per-booking margin go negative (illustrative).",
  },
  {
    label: "Bank portal",
    inputs: { S: 60_000_000, r: 2000, c: 0.85, h: 0.3 },
    segment: "bank",
    tooltip: "Large loyalty or bank travel portal with committed volume (illustrative; mirrors fictional Northgate Rewards Bank).",
  },
];

const BROWSING_HEAVY = PRESETS[1];

export interface Notice {
  title: string;
  body: string;
}

function row(rs: ModelResult[], model: ModelResult["model"]): ModelResult {
  const m = rs.find((x) => x.model === model);
  if (!m) throw new Error(`model ${model} missing`);
  return m;
}

/** The three "What to notice" points, with live numbers from the same math as the table. */
export function whatToNotice(ctx: PricingContext, segment: Segment, i: Inputs): Notice[] {
  const now = compareModels(i, plansFor(ctx, segment), ctx.blended);
  const perSearchCostPerBooking = row(now, "per_search").costPerBooking;

  const heavy = BROWSING_HEAVY.inputs;
  const heavyRows = compareModels(heavy, plansFor(ctx, BROWSING_HEAVY.segment), ctx.blended);
  const perBookingMargin = row(heavyRows, "per_booking").margin;

  return [
    {
      title: "Cost per booking is the real price.",
      body: `Per-search rate × look-to-book = what a partner pays per booking. At ${i.r.toLocaleString("en-US")}:1, ${money(ctx.perSearch.p, 4)} a search is ${money(perSearchCostPerBooking)} a booking.`,
    },
    {
      title: "Heavy browsers can make per-booking pricing lose money.",
      body: `Set look-to-book to ${heavy.r.toLocaleString("en-US")} and the per-booking row goes ${perBookingMargin < 0 ? "negative" : "to"} (${money(perBookingMargin)}/month), because the platform still pays suppliers for every search.`,
    },
    {
      title: "Each pricing model wins at a different volume.",
      body: "The break-even column shows where one model becomes cheaper than the next.",
    },
  ];
}

/** Rows whose platform margin is below zero get highlighted. */
export const isLosingMoney = (m: Pick<ModelResult, "margin">) => m.margin < 0;
