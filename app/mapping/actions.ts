"use server";

import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/repo";
import { ConflictError } from "@/lib/repo/types";
import { decideProposal, generateProposals, NotFoundError } from "@/lib/matching/service";

export interface ActionState {
  ok: boolean;
  message: string;
}

export async function generateAction(): Promise<void> {
  await generateProposals(await getRepo());
  revalidatePath("/mapping");
}

/** useActionState-compatible: returns a message the UI shows, instead of dropping the result. */
export async function decideAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
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
