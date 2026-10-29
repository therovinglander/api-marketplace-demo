import { NextResponse } from "next/server";
import { getRepo } from "@/lib/repo";
import { guardWrite } from "@/lib/rateLimit";
import { generateProposals } from "@/lib/matching/service";

export const dynamic = "force-dynamic";

/** GET ?status=proposed|approved|rejected -> proposals, best score first. */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  const repo = await getRepo();
  const rows = await repo.find("match_proposals", status ? { status } : {});
  rows.sort((a, b) => Number(b.score) - Number(a.score));
  return NextResponse.json({ illustrative: true, proposals: rows });
}

/** POST -> (re)generate proposals. Idempotent: never touches decided rows. */
export async function POST(req: Request) {
  const blocked = guardWrite(req, "mapping");
  if (blocked) return blocked;
  const summary = await generateProposals(await getRepo());
  return NextResponse.json({ illustrative: true, ...summary });
}
