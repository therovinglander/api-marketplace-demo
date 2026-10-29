"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getRepo } from "@/lib/repo";
import { TOO_MANY, rateLimitHeaders } from "@/lib/rateLimit";
import { ConflictError } from "@/lib/repo/types";
import { decideProposal, generateProposals, NotFoundError } from "@/lib/matching/service";

export interface ActionState {
  ok: boolean;
  message: string;
}

export async function generateAction(): Promise<void> {
  // Over the limit: do nothing (the form has no place to show a message; the next click works once the window passes).
  if (rateLimitHeaders("mapping", await headers())) return;
  await generateProposals(await getRepo());
  revalidatePath("/mapping");
}

/** useActionState-compatible: returns a message the UI shows, instead of dropping the result. */
export async function decideAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  if (rateLimitHeaders("mapping", await headers())) return { ok: false, message: TOO_MANY };
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  if (!id || (decision !== "approve" && decision !== "reject")) return { ok: false, message: "Invalid request." };
  try {
    const r = await decideProposal(await getRepo(), id, decision, "reviewer", note || undefined);
    revalidatePath("/mapping");
    revalidatePath("/mapping/audit");
    return { ok: true, message: r.alreadyDecided ? `Already ${r.status}; nothing changed.` : `Recorded: ${r.status}.` };
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ConflictError) {
      revalidatePath("/mapping");
      return { ok: false, message: e.message };
    }
    throw e;
  }
}
