// U6: capability catalog copy (from plan/s8-copy.md). Prices, freshness and latency targets are ILLUSTRATIVE (invented).
export const FLOW_STRIP = ["Supplier feeds", "Content & room mapping", "Dedupe", "Search", "Pricing & taxes", "Book"];
export const FLOW_CAPTION = "How a hotel booking moves through the platform. Each card below is one step you can buy on its own.";
export const CATALOG_DISCLAIMER = "Prices, freshness and latency targets are illustrative, invented for this demo.";

export type Freshness = "cacheable" | "cacheable rules" | "always fresh" | "per run";

export interface CapabilityCopy {
  buyer: string;
  price: string;
  /** true when the price is a seeded rate plan; false = illustrative text only, no calculator link. */
  seededPlan: boolean;
  freshness: Freshness;
  why: string;
  target: string;
  tryIt: { href: string; label: string }[];
}

const T = {
  calc: { href: "/calculator", label: "Calculator" },
  cache: { href: "/cache", label: "Cache" },
  mapping: { href: "/mapping", label: "Mapping" },
  deals: { href: "/deals", label: "Deals" },
  onboarding: { href: "/onboarding", label: "Onboarding" },
};

export const CAPABILITY_COPY: Record<string, CapabilityCopy> = {
  search: {
    buyer: "OTAs, agencies and bank/loyalty portals that need hotel availability and rates from many suppliers through one API.",
    price: "$0.0004 per search, or Hybrid $3,000/mo incl. 1,500:1 look-to-book",
    seededPlan: true,
    freshness: "cacheable",
    why: "Availability changes by the minute, not the millisecond, so short-lived caching cuts supplier calls. The final price is re-checked by Pricing.",
    target: "Cache lifetime 1–15 min · p95 < 800 ms",
    tryIt: [T.calc, T.cache, T.onboarding],
  },
  "content-mapping": {
    buyer: "Partner catalog teams that need one clean listing per hotel, whichever supplier it came from.",
    price: "Hybrid $1,200/mo incl. 3,000:1 look-to-book",
    seededPlan: true,
    freshness: "cacheable",
    why: "Hotel names, photos and supplier-code crosswalks change rarely.",
    target: "Refreshed daily · p95 < 150 ms",
    tryIt: [T.calc, T.mapping, T.onboarding],
  },
  "room-mapping": {
    buyer: "Partner product teams that need \"Deluxe King\" from three suppliers shown as one comparable room.",
    price: "$0.005 per record (illustrative; not in seed)",
    seededPlan: false,
    freshness: "cacheable",
    why: "A supplier's room list changes only when the hotel changes its rooms.",
    target: "Refreshed weekly or on a new room type · p95 < 300 ms",
    tryIt: [T.mapping, T.onboarding],
  },
  dedupe: {
    buyer: "Content ops teams that stop the same hotel being listed twice under different supplier codes.",
    price: "$0.004 per record checked (illustrative; not in seed)",
    seededPlan: false,
    freshness: "per run",
    why: "Each run compares new records against the current catalog, and a human approves merges. Decisions are stored; responses aren't cached.",
    target: "Nightly batch · proposals reviewed within 2 business days",
    tryIt: [T.mapping, T.onboarding],
  },
  pricing: {
    buyer: "Partner checkout teams that need the price shown to equal the price charged.",
    price: "Hybrid $2,000/mo incl. 800:1 look-to-book",
    seededPlan: true,
    freshness: "always fresh",
    why: "This is the bookable price. A stale price here is a \"price changed at checkout\" failure.",
    target: "Live on every call · p95 < 1.2 s",
    tryIt: [T.calc, T.deals, T.onboarding],
  },
  taxes: {
    buyer: "Partner finance and compliance teams that must show the full stay cost, including mandatory local fees.",
    price: "$0.05 per booking (illustrative; not in seed)",
    seededPlan: false,
    freshness: "cacheable rules",
    why: "Tax rates and fee rules change rarely. The amount is computed on the fresh price and re-checked at book time.",
    target: "Rules refreshed daily · p95 < 100 ms",
    tryIt: [T.onboarding],
  },
};

export const badgeTone = (f: Freshness): "stone" | "amber" | "teal" => (f === "always fresh" ? "amber" : f === "per run" ? "teal" : "stone");
