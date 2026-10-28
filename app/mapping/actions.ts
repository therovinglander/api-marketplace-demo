"use server";

import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/repo";
import { decideProposal, generateProposals } from "@/lib/matching/service";

export async function generateAction() {
  await generateProposals(await getRepo());
  revalidatePath("/mapping");
}

export async function decideAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  if (!id || (decision !== "approve" && decision !== "reject")) return;
  await decideProposal(await getRepo(), id, decision, "reviewer", note || undefined);
  revalidatePath("/mapping");
  revalidatePath("/mapping/audit");
}
