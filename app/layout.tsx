import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { IllustrativeBanner } from "@/components/ui";
import { LIVE_DEMO_BANNER } from "@/lib/liveDemo";
import { isPublicDemo } from "@/lib/repo/runtime";

// Read PUBLIC_DEMO / VERCEL per request rather than baking the banner in at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "API Capability Marketplace (design prototype)",
  description: "Fictional company, invented data. A design prototype of packaging and pricing travel-tech capabilities as partner APIs.",
};

const NAV: [string, string][] = [
  ["/", "Catalog"],
  ["/calculator", "Calculator"],
  ["/mapping", "Mapping"],
  ["/cache", "Cache"],
  ["/deals", "Deals"],
  ["/onboarding", "Onboarding"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <IllustrativeBanner />
        {isPublicDemo() ? (
          <div role="status" className="bg-teal-700 px-4 py-1.5 text-center text-xs text-white">
            {LIVE_DEMO_BANNER}
          </div>
        ) : null}
        <header className="border-b border-stone-200 bg-white">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3 text-sm">
            <span className="font-semibold">Fictional Travel Co. API Marketplace</span>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="text-stone-600 hover:text-teal-700">
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
