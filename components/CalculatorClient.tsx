"use client";

import { useMemo, useState } from "react";
import {
  INPUT_RANGES,
  allBreakEvens,
  compareModels,
  confirmedBookings,
  effectiveL2B,
  supplierCost,
  type Inputs,
  type ModelId,
} from "@/lib/pricing/calculator";
import { evaluateTier } from "@/lib/pricing/tiers";
import { plansFor, type PricingContext, type Segment } from "@/lib/pricing/load";
import { Badge, Card, num, usd } from "@/components/ui";

const MODEL_LABEL: Record<ModelId, string> = {
  flat: "Flat monthly fee",
  per_search: "Per search",
  per_booking: "Per confirmed booking",
  hybrid: "Hybrid (platform fee + excess searches)",
};

function Field(props: { label: string; hint?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{props.label}</span>
      {props.hint ? <span className="ml-2 text-xs text-stone-500">{props.hint}</span> : null}
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          className="flex-1"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
        <input
          type="number"
          className="w-28 rounded border border-stone-300 px-2 py-1 text-right"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) props.onChange(Math.min(props.max, Math.max(props.min, v)));
          }}
        />
      </div>
    </label>
  );
}

export function CalculatorClient({ ctx }: { ctx: PricingContext }) {
  const [i, setI] = useState<Inputs>({ S: 5_000_000, r: 1000, c: 0.85, h: 0.3 });
  const [segment, setSegment] = useState<Segment>("agency");
  const set = (k: keyof Inputs) => (v: number) => setI((p) => ({ ...p, [k]: v }));

  const out = useMemo(() => {
    const plans = plansFor(ctx, segment);
    return {
      models: compareModels(i, plans, ctx.blended),
      bes: allBreakEvens(plans, i),
      tiers: ctx.tiers.map((t) => evaluateTier(t, i)),
      bc: confirmedBookings(i),
      sc: supplierCost(i, ctx.blended),
    };
  }, [i, segment, ctx]);

  const best = out.models.reduce((a, b) => (b.costPerBooking < a.costPerBooking ? b : a));

  return (
    <div className="space-y-4">
      <Card title="Inputs (illustrative)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Searches / month" value={i.S} min={INPUT_RANGES.S[0]} max={INPUT_RANGES.S[1]} step={10_000} onChange={set("S")} />
          <Field label="Look-to-book" hint="searches per attempted booking" value={i.r} min={INPUT_RANGES.r[0]} max={INPUT_RANGES.r[1]} step={50} onChange={set("r")} />
          <Field label="Booking success" hint="share of attempts that confirm" value={i.c} min={INPUT_RANGES.c[0]} max={INPUT_RANGES.c[1]} step={0.01} onChange={set("c")} />
          <Field label="Cache hit rate" hint="vendor claims up to ~70%" value={i.h} min={INPUT_RANGES.h[0]} max={INPUT_RANGES.h[1]} step={0.05} onChange={set("h")} />
          <label className="block text-sm">
            <span className="font-medium">Partner segment</span>
            <select className="mt-1 block rounded border border-stone-300 px-2 py-1" value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
              <option value="agency">Agency (flat {usd(ctx.flatBySegment.agency, 0)})</option>
              <option value="ota">OTA (flat {usd(ctx.flatBySegment.ota, 0)})</option>
              <option value="bank">Bank (flat {usd(ctx.flatBySegment.bank, 0)})</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-stone-600">
          Confirmed bookings: <b>{num(out.bc)}</b> / month. Effective look-to-book on confirmed bookings (r / c): <b>{num(effectiveL2B(i))}</b>:1. Supplier cost: <b>{usd(out.sc)}</b> / month.
        </p>
      </Card>

      <Card title="Four ways to charge">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="py-1">Model</th>
                <th className="text-right">Partner bill</th>
                <th className="text-right">Supplier cost</th>
                <th className="text-right">Platform margin</th>
                <th className="text-right">Margin %</th>
                <th className="text-right">Partner cost / booking</th>
              </tr>
            </thead>
            <tbody>
              {out.models.map((m) => (
                <tr key={m.model} className="border-t border-stone-100">
                  <td className="py-1.5">
                    {MODEL_LABEL[m.model]} {m.model === best.model ? <Badge tone="teal">cheapest for partner</Badge> : null}
                  </td>
                  <td className="text-right tabular-nums">{usd(m.bill)}</td>
                  <td className="text-right tabular-nums">{usd(m.supplierCost)}</td>
                  <td className={`text-right tabular-nums ${m.margin < 0 ? "text-red-700" : ""}`}>{usd(m.margin)}</td>
                  <td className="text-right tabular-nums">{(m.marginPct * 100).toFixed(1)}%</td>
                  <td className="text-right tabular-nums">{usd(m.costPerBooking)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Break-even volume between models (searches / month)">
        <p className="mb-2 text-xs text-stone-600">Each bill is linear in volume at fixed look-to-book, so the crossover is closed-form. &ldquo;None&rdquo; means the lines never cross inside the input range.</p>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {out.bes.map((b) => (
            <li key={`${b.a}-${b.b}`}>
              {MODEL_LABEL[b.a].split(" (")[0]} vs {MODEL_LABEL[b.b].split(" (")[0]}: <b>{b.S === null ? "None" : num(b.S)}</b>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Excess-search tiers by capability">
        <p className="mb-2 text-xs text-stone-600">Each capability includes a look-to-book allowance; searches above it cost a per-search fee. Compare the bill with and without the fee. Reference points (vendor-listed, Oct 2026): $0.005 above 1,500:1 and $0.05 above 400:1.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="py-1">Capability</th>
                <th className="text-right">Allowance</th>
                <th className="text-right">Excess searches</th>
                <th className="text-right">Bill</th>
                <th className="text-right">Bill without excess fee</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {out.tiers.map((t) => (
                <tr key={t.capabilityId} className="border-t border-stone-100">
                  <td className="py-1.5">
                    {ctx.labels[t.capabilityId]} {t.overAllowance ? <Badge tone="amber">over allowance</Badge> : <Badge>within</Badge>}
                  </td>
                  <td className="text-right tabular-nums">{num(t.allowance)}:1</td>
                  <td className="text-right tabular-nums">{num(t.excessSearches)}</td>
                  <td className="text-right tabular-nums">{usd(t.bill)}</td>
                  <td className="text-right tabular-nums">{usd(t.billWithoutExcessFee)}</td>
                  <td className={`text-right tabular-nums ${t.margin < 0 ? "text-red-700" : ""}`}>{usd(t.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
