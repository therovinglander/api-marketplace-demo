import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { IllustrativeBanner } from "@/components/ui";

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
