import { PageTitle } from "@/components/ui";
import { OnboardingClient } from "@/components/OnboardingClient";

export default function OnboardingPage() {
  return (
    <>
      <PageTitle
        title="Partner onboarding"
        subtitle="Sign up, get a sandbox key, make a first call with the thin TypeScript SDK. The page times how long that takes: time-to-first-call is the onboarding metric a partner team lives by."
      />
      <OnboardingClient />
    </>
  );
}
