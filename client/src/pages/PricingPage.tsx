import { useState } from "react";
import { Link } from "wouter";
import { Check } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionHeader } from "@/components/ui/section-header";
import { productClaims } from "@/lib/plans";
import { useSubscription } from "@/hooks/useSubscription";
import { useBillingPlans } from "@/hooks/useBillingPlans";
import { PlanPicker } from "@/components/billing/PlanPicker";
import { CheckoutDialog } from "@/components/billing/CheckoutDialog";
import type { BillingPlan } from "@/services/subscription";

/**
 * What's on offer is whatever the server says is on offer.
 *
 * There is no tier set here any more, and no two-column layout that assumed
 * exactly two of them: the page renders `GET /billing/plans` through
 * `PlanPicker`, in the order the server returns it. Adding a plan, changing a
 * price or introducing a yearly option is an admin edit, not a release.
 *
 * Two things are still ours to say, and they sit below the picker rather than
 * inside a card:
 *
 * - **What Brainstorm does** — ranked search, verified followers, portability,
 *   network alerts. These were bullets on the old free card, but none is tier
 *   copy: they are true of the product on any plan, so they became one static
 *   section instead of vanishing with the card that listed them.
 * - **The roadmap link.** The roadmap itself lived on this page until the
 *   team's review: ten unbuilt items one click from the buy button, and nobody
 *   deciding on $2 wants to read them first.
 */
export default function PricingPage() {
  const { policy } = useSubscription();
  const { plans, billingAvailable, loadFailed } = useBillingPlans();
  const [checkoutPlan, setCheckoutPlan] = useState<BillingPlan | null>(null);

  // A confirmed-empty plans array is the "this instance has no billing"
  // signal (self-hosts). ONLY that stands the page down — a call that is still
  // in flight or that failed says nothing about whether this instance sells
  // anything, so it must not unsell the product (handoff A8, fail open).
  if (billingAvailable === false) {
    return (
      <InfoPageLayout testId="page-pricing">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center" data-testid="pricing-unavailable">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            This Brainstorm doesn't offer paid plans
          </h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            You're on a self-hosted instance — every feature here is simply on.
          </p>
        </div>
      </InfoPageLayout>
    );
  }

  return (
    <InfoPageLayout testId="page-pricing">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <PageHeader
          kicker="Pricing"
          // Leads with what staleness costs rather than with a rate, because the
          // rate was never the reason to pay — a filter that lags reality is.
          //
          // The subtitle no longer names two tiers and their two intervals:
          // every plan states its own cadence in its row, from the live
          // scheduling policy, so saying it here would be a second copy that
          // can drift.
          title={<>Your network changes <span className="text-brand-link">every day.</span></>}
          subtitle="Brainstorm recalculates who you trust on a schedule. Pick how often."
          testId="section-pricing-header"
        />

        {loadFailed ? (
          // The plans are the only source of what's on offer, so a failed call
          // has nothing to fall back to — and inventing a price here is how a
          // stale number ends up on a public page. Say so, and keep the rest of
          // the page (which is true regardless) on screen.
          <Alert variant="warning" className="mt-8" data-testid="pricing-plans-error">
            <AlertDescription className="text-sm">
              We couldn't load the current plans just now. Reload the page, or
              get in touch if it keeps happening.
            </AlertDescription>
          </Alert>
        ) : (
          <PlanPicker
            plans={plans}
            currentPolicyId={policy?.id ?? null}
            onChoose={setCheckoutPlan}
            className="mt-8"
          />
        )}

        <section className="mt-12" data-testid="pricing-product-claims">
          <SectionHeader kicker="What Brainstorm does" />
          <Card className="mt-3 p-5 sm:p-6">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {productClaims().map((f) => (
                <li key={f.key} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {f.label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              On every plan, including the free one. What you pay for is how
              often it all gets recalculated.
            </p>
          </Card>
        </section>

        <p className="mt-8 text-sm text-slate-600 dark:text-slate-300" data-testid="roadmap-link-line">
          Curious what's coming?{" "}
          <Link href="/roadmap" className="font-semibold text-brand-link hover:underline">
            See the roadmap →
          </Link>
        </p>

        <p className="mt-10 text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-2xl">
          Cancel any time — a paid plan runs to the end of the period you've
          paid for. Payments are handled by Flash; we never see your card
          details.
        </p>
      </div>

      <CheckoutDialog
        open={checkoutPlan !== null}
        onOpenChange={(o) => { if (!o) setCheckoutPlan(null); }}
        plan={checkoutPlan}
      />
    </InfoPageLayout>
  );
}
