"use client";

import { useMemo, useState } from "react";
import { evaluateCache, sweepTtl, TTL_RANGE, type CacheConfig } from "@/lib/pricing/cache";
import { INPUT_RANGES, type Inputs } from "@/lib/pricing/calculator";
import { SLIDER_STEPS, formatRate, logToSlider, sliderToLog } from "@/lib/pricing/volume";
import { Badge, Card, num, usd } from "@/components/ui";

export function CacheClient({ cfg, costPerSearch, initialHitRate, initialTtl }: { cfg: CacheConfig; costPerSearch: number; initialHitRate: number; initialTtl: number }) {
  const [i, setI] = useState<Inputs>({ S: 5_000_000, r: 1000, c: 0.85, h: initialHitRate });
  const [ttl, setTtl] = useState(initialTtl);
  const res = useMemo(() => evaluateCache(i, ttl, costPerSearch, cfg), [i, ttl, costPerSearch, cfg]);
  const sweep = useMemo(() => sweepTtl(i, [1, 5, 10, 20, 30, 60], costPerSearch, cfg), [i, costPerSearch, cfg]);

  return (
    <div className="space-y-4">
      <Card title="Toggle and tune (illustrative)">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Cache hit rate: {(i.h * 100).toFixed(0)}%</span>
            {res.overVendorClaim ? <span className="ml-2"><Badge tone="amber">above the ~70% vendor claim</Badge></span> : null}
            <input type="range" className="mt-1 w-full" min={0} max={cfg.hitRateMax} step={0.05} value={i.h} onChange={(e) => setI({ ...i, h: Number(e.target.value) })} />
            <span className="text-xs text-stone-500">Vendors claim caches can cut up to ~70% of upstream calls. That is a vendor claim, not a measurement.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Cache lifetime (TTL): {ttl} min</span>
            <input type="range" className="mt-1 w-full" min={TTL_RANGE[0]} max={TTL_RANGE[1]} step={1} value={ttl} onChange={(e) => setTtl(Number(e.target.value))} />
            <span className="text-xs text-stone-500">Longer lifetime means more hits survive but more prices go stale before checkout.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Searches / month: {num(i.S)}</span>
            <span className="ml-2 text-xs text-stone-500">{formatRate(i.S)} (log scale)</span>
            <input type="range" className="mt-1 w-full" min={0} max={SLIDER_STEPS} step={1} value={logToSlider(i.S, INPUT_RANGES.S[0], INPUT_RANGES.S[1])} onChange={(e) => setI({ ...i, S: sliderToLog(Number(e.target.value), INPUT_RANGES.S[0], INPUT_RANGES.S[1]) })} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Look-to-book: {num(i.r)}</span>
            <input type="range" className="mt-1 w-full" min={INPUT_RANGES.r[0]} max={INPUT_RANGES.r[1]} step={50} value={i.r} onChange={(e) => setI({ ...i, r: Number(e.target.value) })} />
          </label>
        </div>
      </Card>

      <Card title="What the cache buys, and what it costs">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between"><dt>Upstream searches avoided</dt><dd className="tabular-nums">{num(res.upstreamCallsAvoided)}</dd></div>
          <div className="flex justify-between"><dt>Supplier cost saved ({usd(costPerSearch, 5)} per search)</dt><dd className="tabular-nums">{usd(res.upstreamSaving)}</dd></div>
          <div className="flex justify-between"><dt>Stale-price rate at checkout (invented)</dt><dd className="tabular-nums">{(res.staleRate * 100).toFixed(2)}%</dd></div>
          <div className="flex justify-between"><dt>Expected failed checkouts / month</dt><dd className="tabular-nums">{num(res.failedCheckouts, 1)}</dd></div>
          <div className="flex justify-between"><dt>Cost of failed checkouts ({usd(cfg.failedCheckoutCost)} each, invented)</dt><dd className="tabular-nums">{usd(res.failedCheckoutCost)}</dd></div>
          <div className="flex justify-between font-semibold"><dt>Net</dt><dd className={`tabular-nums ${res.net < 0 ? "text-red-700" : "text-teal-700"}`}>{usd(res.net)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-stone-600">
          {res.breakEvenCostPerSearch === null
            ? "With a 0% hit rate there is no saving to weigh."
            : `This setting pays for itself only if an upstream search costs more than ${usd(res.breakEvenCostPerSearch, 5)}. With cheap upstream searches, the case for a cache is mostly speed and avoiding supplier excess-search fees, not raw call cost.`}
        </p>
      </Card>

      <Card title="Lifetime sweep at this hit rate">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-stone-500">
            <tr><th className="py-1">TTL (min)</th><th className="text-right">Stale rate</th><th className="text-right">Failed checkouts</th><th className="text-right">Saved</th><th className="text-right">Failure cost</th><th className="text-right">Net</th></tr>
          </thead>
          <tbody>
            {sweep.map((r) => (
              <tr key={r.ttlMinutes} className="border-t border-stone-100">
                <td className="py-1">{r.ttlMinutes}</td>
                <td className="text-right tabular-nums">{(r.staleRate * 100).toFixed(2)}%</td>
                <td className="text-right tabular-nums">{num(r.failedCheckouts, 1)}</td>
                <td className="text-right tabular-nums">{usd(r.upstreamSaving)}</td>
                <td className="text-right tabular-nums">{usd(r.failedCheckoutCost)}</td>
                <td className={`text-right tabular-nums ${r.net < 0 ? "text-red-700" : ""}`}>{usd(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500">The stale rate is capped at {(cfg.staleCap * 100).toFixed(0)}%. All parameters are invented.</p>
      </Card>
    </div>
  );
}
