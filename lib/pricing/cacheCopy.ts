// U2: cache page copy that depends on computed values. Pure so it can be tested.
import type { CacheResult } from "./cache";

const fmt6 = (n: number) => `$${n.toFixed(6)}`;

/** Break-even line shown under the net result. Six decimals: two would round $0.000272 to $0.00. */
export function breakEvenLine(res: Pick<CacheResult, "breakEvenCostPerSearch">, supplierCostPerSearch: number): string {
  if (res.breakEvenCostPerSearch === null) {
    return "No searches are served from cache, so there is nothing to break even on.";
  }
  return `At these settings, the cache pays for itself when supplier cost per search is above ${fmt6(res.breakEvenCostPerSearch)}. Today's illustrative cost is ${fmt6(supplierCostPerSearch)}.`;
}

export const LOSES_MONEY_NOTE =
  "On call cost alone, the cache loses money here. The real case for caching is speed and avoiding supplier excess-search fees, which this model does not include.";

export const CACHE_EXPLAINER = [
  "The hit rate is the share of partner searches answered from the platform's cache, with no call to a supplier.",
  "A higher hit rate means lower supplier fees and faster answers. The catch: a cached price can be out of date by checkout, and a \"price changed at checkout\" failure costs money and trust.",
  "The sliders below trade those two against each other. All parameters are illustrative.",
];
