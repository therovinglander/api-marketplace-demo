import { getRepo } from "@/lib/repo";
import { loadPricingContext } from "@/lib/pricing/load";
import { dealQuote } from "@/lib/pricing/deals";
import { DEALS_SCOPE, DEALS_WHO, DEALS_WHY, DEAL_TERMS } from "@/lib/pricing/dealsCopy";
import { activeBook, listVersions } from "@/lib/pricing/dealsService";
import { Badge, Card, PageTitle, num, usd } from "@/components/ui";
import { editDealAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const repo = await getRepo();
  const [ctx, partners] = await Promise.all([loadPricingContext(repo), repo.find("partners")]);

  const cards = await Promise.all(
    partners.map(async (p) => {
      const [active, versions] = await Promise.all([activeBook(repo, p._id), listVersions(repo, p._id)]);
      const line = (active?.lines as { committedMonthlyVolume: number; discountPct: number }[] | undefined)?.[0];
      const usage = { S: Number(p.monthlySearches), r: Number(p.l2b), c: 0.85, h: 0.3 };
      const q = dealQuote(usage, ctx.perSearch.p, line?.committedMonthlyVolume ?? 0, ctx.blended);
      return { p, active, versions, q };
    }),
  );

  return (
    <>
      <PageTitle
        title="Custom deals: committed-volume discounts"
        subtitle="A large partner trades a volume commitment for a lower rate. Each partner has a versioned price book: an edit never overwrites, it creates the next version and keeps the old one."
      />
      <div className="mb-4 space-y-1 text-sm text-stone-700">
        <p>{DEALS_WHO}</p>
        {DEALS_WHY.map((w) => (
          <p key={w.label}><b>{w.label}</b> {w.text}</p>
        ))}
        <p className="text-xs text-stone-600">{DEALS_SCOPE}</p>
      </div>
      <Card title="Terms in one line" className="mb-4">
        <dl className="space-y-1 text-sm">
          {DEAL_TERMS.map((t) => (
            <div key={t.term}>
              <dt className="inline font-medium">{t.term}: </dt>
              <dd className="inline text-stone-700">{t.def}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {error ? <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</div> : null}
      <Card title="Graduated discount tiers (invented): each slice of volume gets its own rate" className="mb-4">
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["first 1M", 0],
            ["1M to 10M", 8],
            ["10M to 100M", 15],
            ["above 100M", 22],
          ].map(([label, pct]) => (
            <li key={String(label)}>
              {label}: <b>{pct}%</b>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-stone-500">Billing is take-or-pay: you pay for the larger of actual and committed volume. The list per-search rate is {usd(ctx.perSearch.p, 5)}.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map(({ p, active, versions, q }) => (
          <Card key={p._id} title={String(p.name)}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge>{String(p.segment)}</Badge>
              <span>{num(Number(p.monthlySearches))} searches/month</span>
              <span>look-to-book {num(Number(p.l2b))}</span>
              {active ? <Badge tone="teal">active v{String(active.version)}</Badge> : null}
            </div>
            <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt>Committed volume</dt><dd className="text-right tabular-nums">{num(q.committedMonthlyVolume)}</dd>
              <dt>Top tier reached</dt><dd className="text-right tabular-nums">{q.discountPct}%</dd>
              <dt>Blended discount</dt><dd className="text-right tabular-nums">{q.blendedDiscountPct.toFixed(1)}%</dd>
              <dt>Effective rate</dt><dd className="text-right tabular-nums">{usd(q.effectiveRate, 5)}</dd>
              <dt>Bill at list</dt><dd className="text-right tabular-nums">{usd(q.listBill)}</dd>
              <dt>Bill with deal</dt><dd className="text-right tabular-nums">{usd(q.dealBill)}</dd>
              <dt>Platform margin: list / deal</dt><dd className="text-right tabular-nums">{usd(q.marginAtList)} / {usd(q.marginWithDeal)}</dd>
            </dl>
            {q.shortfall ? <p className="mb-2 text-xs text-amber-800">Usage is below the commitment, so this partner pays for volume it does not use.</p> : null}
            <form action={editDealAction} className="flex flex-wrap items-end gap-2 text-sm">
              <input type="hidden" name="partnerId" value={String(p._id)} />
              <input type="hidden" name="baseVersion" value={String(active?.version ?? 0)} />
              <label className="text-xs">
                New committed volume / month
                <input name="committedMonthlyVolume" type="number" min={0} step={100000} defaultValue={q.committedMonthlyVolume} className="mt-0.5 block w-40 rounded border border-stone-300 px-2 py-1 text-sm" />
              </label>
              <input name="note" aria-label="Why (audit note)" placeholder="Why (audit note)" className="min-w-32 flex-1 rounded border border-stone-300 px-2 py-1" />
              <SubmitButton label="Save as new version" />
            </form>
            <ul className="mt-3 space-y-0.5 border-t border-stone-100 pt-2 text-xs text-stone-600">
              {versions.map((v) => {
                const l = (v.lines as { committedMonthlyVolume: number; discountPct: number }[])[0];
                return (
                  <li key={v._id}>
                    v{String(v.version)} <Badge tone={v.status === "active" ? "teal" : "stone"}>{String(v.status)}</Badge> commit {num(l.committedMonthlyVolume)} → top tier {l.discountPct}% · from {String(v.effectiveFrom).slice(0, 10)}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
