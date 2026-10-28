import { describe, expect, it } from "vitest";
import { readJsonObject } from "@/lib/http";

const req = (body: string) => new Request("http://x/", { method: "POST", body });

describe("readJsonObject", () => {
  it("returns plain objects", async () => {
    expect(await readJsonObject(req('{"a":1}'))).toEqual({ a: 1 });
  });
  it.each(["null", "[]", "[1]", "5", '"s"', "true", "{not json", ""])("returns null for %j (routes answer 400, not 500)", async (raw) => {
    expect(await readJsonObject(req(raw))).toBeNull();
  });
});
