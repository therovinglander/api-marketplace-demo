import Link from "next/link";
import { getRepo } from "@/lib/repo";
import { Badge, Card, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const rows = await (await getRepo()).find("audit_log");
  rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  return (
    <>
      <PageTitle title="Audit log" subtitle="Append-only. Every proposal and decision records why: signals, weights, thresholds and rule version." />
      <Link href="/mapping" className="mb-3 inline-block text-sm text-teal-700 underline">
        ← Back to review queue
      </Link>
      {rows.length === 0 ? <Card>No entries yet.</Card> : null}
      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r._id}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={r.action === "approved" ? "teal" : r.action === "rejected" ? "red" : "stone"}>{String(r.action)}</Badge>
              <span className="text-stone-500">{String(r.ts)}</span>
              <span className="text-stone-500">by {String(r.actor)}</span>
              <span className="font-mono text-xs text-stone-500">{String(r.entityId)}</span>
            </div>
            <p className="mt-1 text-sm">{String(r.reason)}</p>
            <details className="mt-1 text-xs text-stone-600">
              <summary className="cursor-pointer">Evidence</summary>
              <pre className="overflow-x-auto rounded bg-stone-50 p-2">{JSON.stringify(r.details, null, 2)}</pre>
            </details>
          </Card>
        ))}
      </div>
    </>
  );
}
