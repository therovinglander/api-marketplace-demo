import { getRepo } from "@/lib/repo";
import { loadPricingContext } from "@/lib/pricing/load";
import { dealQuote } from "@/lib/pricing/deals";
import { activeBook, listVersions } from "@/lib/pricing/dealsService";
import { Badge, Card, PageTitle, num, usd } from "@/components/ui";
import { editDealAction } from "./actions";

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
      {error ? <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</div> : null}
      <Card title="Discount tiers (invented)" className="mb-4">
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            ["under 1M", 0],
            ["1M to under 10M", 8],
            ["10M to 100M inclusive", 15],
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
              <dt>Discount</dt><dd className="text-right tabular-nums">{q.discountPct}%</dd>
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
              <input name="note" placeholder="Why (audit note)" className="min-w-32 flex-1 rounded border border-stone-300 px-2 py-1" />
              <button className="rounded bg-teal-700 px-3 py-1 text-white hover:bg-teal-800">Save as new version</button>
            </form>
            <ul className="mt-3 space-y-0.5 border-t border-stone-100 pt-2 text-xs text-stone-600">
              {versions.map((v) => {
                const l = (v.lines as { committedMonthlyVolume: number; discountPct: number }[])[0];
                return (
                  <li key={v._id}>
                    v{String(v.version)} <Badge tone={v.status === "active" ? "teal" : "stone"}>{String(v.status)}</Badge> commit {num(l.committedMonthlyVolume)} → {l.discountPct}% · from {String(v.effectiveFrom).slice(0, 10)}
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
