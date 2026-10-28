import { getRepo } from "@/lib/repo";
import { Badge, Card, PageTitle } from "@/components/ui";

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
      <div className="grid gap-4 sm:grid-cols-2">
        {caps.map((c) => (
          <Card key={c._id} title={String(c.name)}>
            <p className="mb-2 text-sm text-stone-600">{String(c.summary)}</p>
            <div className="flex items-center gap-2 text-xs">
              <Badge tone="teal">billed per {String(c.unit)}</Badge>
              {c.cacheable ? <Badge>cacheable</Badge> : <Badge tone="amber">always fresh</Badge>}
              <a className="text-teal-700 underline" href={String(c.openapiPath)}>
                OpenAPI
              </a>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
