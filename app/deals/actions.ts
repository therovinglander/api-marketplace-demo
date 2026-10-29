"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/repo";
import { TOO_MANY, rateLimitHeaders } from "@/lib/rateLimit";
import { ConflictError } from "@/lib/repo/types";
import { DealValidationError, editPriceBook } from "@/lib/pricing/dealsService";

export async function editDealAction(formData: FormData) {
  if (rateLimitHeaders("deals", await headers())) redirect(`/deals?error=${encodeURIComponent(TOO_MANY)}`);
  const partnerId = String(formData.get("partnerId") ?? "");
  const baseVersion = Number(formData.get("baseVersion"));
  const volume = Number(String(formData.get("committedMonthlyVolume") ?? "").replace(/,/g, ""));
  const note = String(formData.get("note") ?? "").slice(0, 500);
  let error: string | null = null;
  try {
    await editPriceBook(await getRepo(), partnerId, baseVersion, volume, "pricing-manager", note || undefined);
  } catch (e) {
    if (e instanceof ConflictError || e instanceof DealValidationError) error = e.message;
    else throw e;
  }
  revalidatePath("/deals");
  redirect(error ? `/deals?error=${encodeURIComponent(error)}` : "/deals");
}
