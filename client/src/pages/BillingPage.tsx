import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { BillingPanel } from "@/components/BillingPanel";

/**
 * Standalone billing page (auth-gated via RequireAuth). Uses the shared
 * InfoPageLayout + PageHeader so it reads on the same sheet of music as the
 * About / How-Search / Personalization pages. The current-plan content is the
 * shared BillingPanel, also embedded in Settings → Billing.
 */
export default function BillingPage() {
  return (
    <InfoPageLayout testId="page-billing">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-8 animate-fade-up">
          <PageHeader
            kicker="Billing"
            title={<>Billing <span className="text-[#333286]">&amp; plan</span></>}
            subtitle="Manage your Brainstorm subscription — your current plan, renewal, and payment history."
            testId="section-billing-header"
          />
          <BillingPanel />
        </div>
      </div>
    </InfoPageLayout>
  );
}
