import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RootLayout from "@/app/layout";
import { LIVE_DEMO_BANNER } from "@/lib/liveDemo";

const render = () => renderToStaticMarkup(createElement(RootLayout, null, createElement("p", null, "page body")));

afterEach(() => vi.unstubAllEnvs());

describe("live demo banner (S9)", () => {
  it("is exactly the approved one-liner", () => {
    expect(LIVE_DEMO_BANNER).toBe("Live demo: anyone can try it, and changes reset periodically. All data is fictional.");
  });
  it("shows on every page when running on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    const html = render();
    expect(html).toContain(LIVE_DEMO_BANNER);
    expect(html).toContain("page body");
  });
  it("shows with PUBLIC_DEMO=1", () => {
    vi.stubEnv("PUBLIC_DEMO", "1");
    expect(render()).toContain(LIVE_DEMO_BANNER);
  });
  it("does not show locally, where nothing resets", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("PUBLIC_DEMO", "");
    expect(render()).not.toContain(LIVE_DEMO_BANNER);
  });
});
