import { getRepo } from "@/lib/repo";
import { loadPricingContext } from "@/lib/pricing/load";
import { PageTitle } from "@/components/ui";
import { CalculatorClient } from "@/components/CalculatorClient";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const ctx = await loadPricingContext(await getRepo());
  return (
    <>
      <PageTitle
        title="Cost-per-booking calculator"
        subtitle="Compare four ways to charge a partner for Search. The cheap per-search rate can cost more per booking than it looks: cost per booking = rate per search x look-to-book."
      />
      <CalculatorClient ctx={ctx} />
    </>
  );
}
