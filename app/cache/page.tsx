import { getRepo } from "@/lib/repo";
import { loadPricingContext } from "@/lib/pricing/load";
import { DEFAULT_CACHE, type CacheConfig } from "@/lib/pricing/cache";
import { PageTitle } from "@/components/ui";
import { CacheClient } from "@/components/CacheClient";

export const dynamic = "force-dynamic";

export default async function CachePage() {
  const repo = await getRepo();
  const [ctx, doc] = await Promise.all([loadPricingContext(repo), repo.findOne("app_config", { _id: "cache" })]);
  const cfg: CacheConfig = { ...DEFAULT_CACHE, ...(doc as Partial<CacheConfig> | null) };
  return (
    <>
      <PageTitle
        title="Cache toggle: freshness vs cost"
        subtitle="Serving some searches from a cache saves upstream calls but risks a price that changed by checkout. Move the sliders to see the trade."
      />
      <CacheClient
        cfg={cfg}
        costPerSearch={ctx.blended.costPerSearch}
        initialHitRate={Number((doc as { hitRate?: number } | null)?.hitRate ?? 0.3)}
        initialTtl={Number((doc as { ttlMinutes?: number } | null)?.ttlMinutes ?? 10)}
      />
    </>
  );
}
