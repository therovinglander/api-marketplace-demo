import { getRepo } from "@/lib/repo";
import { Badge, Card, PageTitle } from "@/components/ui";
import { CAPABILITY_COPY, CATALOG_DISCLAIMER, FLOW_CAPTION, FLOW_STRIP, badgeTone } from "@/lib/catalogCopy";

export const dynamic = "force-dynamic";

export default async function Home() {
  const repo = await getRepo();
  const caps = await repo.find("capabilities");
  return (
    <>
      <PageTitle
        title="Capability catalog"
        subtitle={`Six fictional capabilities a travel-tech company could sell to partners. Data mode: ${repo.mode}.`}
      />
      <ol className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-stone-800" aria-label="Booking flow">
        {FLOW_STRIP.map((s, n) => (
          <li key={s} className="flex items-center gap-2">
            {n > 0 ? <span aria-hidden className="text-stone-400">→</span> : null}
            {s}
          </li>
        ))}
      </ol>
      <p className="mb-1 text-xs text-stone-600">{FLOW_CAPTION}</p>
      <p className="mb-4 text-xs text-stone-500">{CATALOG_DISCLAIMER}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {caps.map((c) => {
          const copy = CAPABILITY_COPY[String(c._id)];
          return (
            <Card key={c._id} title={String(c.name)}>
              <p className="mb-2 text-sm text-stone-600">{String(c.summary)}</p>
              {copy ? (
                <dl className="mb-2 space-y-1 text-sm">
                  <div><dt className="inline font-medium">Who buys it: </dt><dd className="inline text-stone-700">{copy.buyer}</dd></div>
                  <div><dt className="inline font-medium">Example price: </dt><dd className="inline text-stone-700">{copy.price}</dd></div>
                  <div><dt className="inline font-medium">Freshness: </dt><dd className="inline text-stone-700">{copy.why}</dd></div>
                  <div><dt className="inline font-medium">Illustrative target: </dt><dd className="inline text-stone-700">{copy.target}</dd></div>
                </dl>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="teal">billed per {String(c.unit)}</Badge>
                <Badge tone={copy ? badgeTone(copy.freshness) : c.cacheable ? "stone" : "amber"}>
                  {copy ? copy.freshness : c.cacheable ? "cacheable" : "always fresh"}
                </Badge>
                <a className="text-teal-700 underline" href={String(c.openapiPath)}>
                  OpenAPI
                </a>
                {copy?.tryIt.map((t) => (
                  <a key={t.href} className="text-teal-700 underline" href={t.href}>
                    {t.label}
                  </a>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
