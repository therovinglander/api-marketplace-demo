"use client";

import { useState } from "react";
import { MarketplaceClient, MarketplaceError, type SearchResponse } from "@/sdk";
import { Card, usd } from "@/components/ui";

type Status = { timeToFirstCallSec: number | null; firstCallAt: string | null };

export function OnboardingClient() {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The key lives only in this component's state. Reloading the page loses it, by design: it is shown once.
  const [session, setSession] = useState<{ sessionId: string; apiKey: string } | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  async function signup() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/v1/onboarding/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partnerName: name }) });
      const body = (await res.json()) as { error?: string; sessionId: string; apiKey: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setSession({ sessionId: body.sessionId, apiKey: body.apiKey });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function firstCall() {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      const client = new MarketplaceClient({ apiKey: session.apiKey, baseUrl: `${location.origin}/api/v1/sandbox` });
      setResult(await client.search({ hotelId: "H-1001", checkIn: "2027-03-01", nights: 2 }));
      const s = await fetch(`/api/v1/onboarding/${session.sessionId}`);
      setStatus((await s.json()) as Status);
    } catch (e) {
      setErr(e instanceof MarketplaceError ? `${e.name}: ${e.message}` : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const step = !session ? 1 : !result ? 2 : 3;
  const snippet = `import { MarketplaceClient } from "./sdk";

const client = new MarketplaceClient({ apiKey: "${session ? session.apiKey : "sbx_..."}" });
const quote = await client.search({ hotelId: "H-1001", checkIn: "2027-03-01", nights: 2 });
const booking = await client.book({ rateKey: quote.rateKey, guestName: "Test Guest" }); // idempotent + retried`;

  return (
    <div className="space-y-4">
      <ol className="flex gap-2 text-xs">
        {["Sign up", "Sandbox key", "First call"].map((l, i) => (
          <li key={l} className={`rounded px-2 py-1 ${step === i + 1 ? "bg-teal-700 text-white" : step > i + 1 ? "bg-teal-100 text-teal-800" : "bg-stone-100 text-stone-500"}`}>
            {i + 1}. {l}
          </li>
        ))}
      </ol>
      {err ? <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{err}</div> : null}

      <Card title="1. Sign up">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!!session} aria-label="Partner name" placeholder="Partner name (fictional is fine)" className="min-w-64 flex-1 rounded border border-stone-300 px-2 py-1" />
          <button onClick={signup} disabled={busy || !!session || name.trim().length < 2} className="rounded bg-teal-700 px-3 py-1 text-white hover:bg-teal-800 disabled:opacity-40">
            Get a sandbox key
          </button>
        </div>
      </Card>

      {session ? (
        <Card title="2. Your sandbox key (shown once)">
          <code className="block break-all rounded bg-stone-100 px-2 py-1 text-sm">{session.apiKey}</code>
          <p className="mt-1 text-xs text-stone-600">Copy it now. The server stores only its SHA-256 hash, so it cannot show it again.</p>
          <pre className="mt-2 overflow-x-auto rounded bg-stone-900 p-3 text-xs text-stone-100">{snippet}</pre>
        </Card>
      ) : null}

      {session ? (
        <Card title="3. Make your first call">
          <button onClick={firstCall} disabled={busy} className="rounded bg-teal-700 px-3 py-1 text-sm text-white hover:bg-teal-800 disabled:opacity-40">
            Run client.search() in the sandbox
          </button>
          {result ? (
            <div className="mt-3 text-sm">
              <p>
                Rate <code>{result.rateKey}</code>, {result.nights} nights: <b>{usd(result.totalUsd)}</b> <span className="text-stone-500">(illustrative)</span>
              </p>
              {status?.timeToFirstCallSec != null ? (
                <p className="mt-1 text-lg font-semibold text-teal-800">Time to first call: {status.timeToFirstCallSec.toFixed(1)} s</p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
