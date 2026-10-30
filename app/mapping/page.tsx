import Link from "next/link";
import { getRepo, type Doc } from "@/lib/repo";
import { Badge, Card, PageTitle } from "@/components/ui";
import { GenerateForm } from "@/components/GenerateForm";
import { DecisionForm } from "@/components/DecisionForm";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function RecordBox({ r }: { r: Doc | undefined }) {
  if (!r) return <div className="text-xs text-stone-500">record missing</div>;
  const a = r.address as Record<string, string>;
  return (
    <div className="rounded border border-stone-200 p-2 text-xs">
      <div className="font-medium">{String(r.name)}</div>
      <div className="text-stone-600">
        {a.line1}, {a.city} {a.region} {a.postal}
      </div>
      <div className="text-stone-500">
        {String(r.supplierCode)} / {String(r.supplierHotelId)} · phone {r.phone ? String(r.phone) : "missing"}
      </div>
    </div>
  );
}

function Signal({ label, v, w }: { label: string; v: number | null; w: number }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums">{v === null ? "n/a" : v.toFixed(2)} × {w.toFixed(2)}</span>
      </div>
      <div className="h-1.5 rounded bg-stone-100">
        <div className="h-1.5 rounded bg-teal-600" style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
      </div>
    </div>
  );
}

export default async function MappingPage() {
  const repo = await getRepo();
  const [proposals, records, canon] = await Promise.all([
    repo.find("match_proposals"),
    repo.find("hotel_records"),
    repo.find("canonical_hotels"),
  ]);
  const rec = new Map(records.map((r) => [r._id, r]));
  proposals.sort((a, b) => Number(b.score) - Number(a.score));
  const open = proposals.filter((p) => p.status === "proposed");
  const decided = proposals.filter((p) => p.status !== "proposed");
  const live = canon.filter((c) => (c.memberIds as string[]).length > 0);

  return (
    <>
      <PageTitle
        title="Property mapping: duplicate review"
        subtitle="The same hotel arrives under different codes from three fictional suppliers. The matcher proposes merges with a score and the reasons; nothing merges until a human approves."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <GenerateForm />
        <span className="text-stone-600">
          {records.length} records · {open.length} to review · {decided.length} decided · {live.length} canonical hotels
        </span>
        <Link href="/mapping/audit" className="text-teal-700 underline">
          Audit log
        </Link>
      </div>

      {proposals.length === 0 ? <Card>No proposals yet. Click &ldquo;Generate proposals&rdquo;.</Card> : null}

      <div className="space-y-3">
        {open.map((p) => {
          const s = p.signals as { name: number; address: number; geo: number; phone: number | null };
          const w = p.weights as { name: number; address: number; geo: number; phone: number };
          return (
            <Card key={p._id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-lg font-semibold tabular-nums">{Number(p.score).toFixed(2)}</span>
                <Badge tone={p.tier === "strong" ? "teal" : "amber"}>{String(p.tier)}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <RecordBox r={rec.get(String(p.aId))} />
                <RecordBox r={rec.get(String(p.bId))} />
              </div>
              <div className="my-2 grid gap-2 sm:grid-cols-4">
                <Signal label="name" v={s.name} w={w.name} />
                <Signal label="address" v={s.address} w={w.address} />
                <Signal label="geo" v={s.geo} w={w.geo} />
                <Signal label="phone" v={s.phone} w={w.phone} />
              </div>
              <p className="mb-2 text-xs text-stone-600">Why: {String(p.reason)}</p>
              <DecisionForm id={String(p._id)} />
            </Card>
          );
        })}
      </div>

      {decided.length > 0 ? (
        <Card title="Decided" className="mt-4">
          <ul className="space-y-1 text-sm">
            {decided.map((p) => (
              <li key={p._id}>
                <Badge tone={p.status === "approved" ? "teal" : "red"}>{String(p.status)}</Badge>{" "}
                {String(rec.get(String(p.aId))?.name)} ↔ {String(rec.get(String(p.bId))?.name)} ({Number(p.score).toFixed(2)})
                {p.decisionNote ? <span className="text-stone-500"> · {String(p.decisionNote)}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {live.length > 0 ? (
        <Card title="Canonical hotels" className="mt-4">
          <ul className="space-y-1 text-sm">
            {live.map((c) => (
              <li key={c._id}>
                <b>{String(c.name)}</b> ← {(c.memberIds as string[]).join(", ")}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
