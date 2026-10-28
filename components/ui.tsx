import type { ReactNode } from "react";

// Small shadcn-style primitives (Tailwind, no runtime dependency).

export function IllustrativeBanner() {
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
      Illustrative data: fictional company, invented numbers, built from public sources. Not a claim about any real business.
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-stone-200 bg-white p-4 shadow-sm ${className}`}>
      {title ? <h2 className="mb-2 text-base font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "stone" }: { children: ReactNode; tone?: "stone" | "teal" | "amber" | "red" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    teal: "bg-teal-100 text-teal-800",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-800",
  };
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-stone-600">{subtitle}</p> : null}
    </div>
  );
}

export const usd = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp });
export const num = (n: number, dp = 0) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
