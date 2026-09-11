import { useState } from "react";
import { Check } from "lucide-react";
import { Link } from "wouter";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSubscription } from "@/hooks/useSubscription";
import { useBillingPlans } from "@/hooks/useBillingPlans";
import { PlanPicker } from "@/components/billing/PlanPicker";
import { CheckoutDialog } from "@/components/billing/CheckoutDialog";
import { productClaims } from "@/lib/plans";
import type { BillingPlan } from "@/services/subscription";

/**
 * What's on offer is whatever the server says is on offer.
 *
 * There is no tier set here any more, and no two-column layout that assumed
 * exactly two of them: the page renders `GET /billing/plans` through
 * `PlanPicker`, in the order the server returns it. Adding a plan, changing a
 * price or introducing a yearly option is an admin edit, not a release.
 *
 * **What Brainstorm does** — ranked search, verified followers, portability,
 * network alerts — is back on the free row where it used to be, rather than in
 * a static section below the picker. It reads as a list of what you get
 * standing under the price of nothing, which is what every paid plan then says
 * "Everything in Free" about. `PlanPicker` renders it for the row with no Flash
 * plan; Flash writes no copy for that row because there is no plan behind it.
 *
 * A failed plans call falls back to a Free card carrying the same list, because
 * none of it depended on that call — the free tier exists whether or not Flash
 * answers, and $0 cannot go stale. What the fallback omits is the cadence: that
 * comes from the scheduling policy we just failed to read, and inventing an
 * interval is the same mistake as inventing a price. An instance with NO
 * billing at all is a different case and returns earlier.
 *
 * The roadmap itself lived on this page until the team's review: ten unbuilt
 * items one click from the buy button, and nobody deciding on $2 wants to read
 * them first.
 */
export default function PricingPage() {
  const { policy, plan } = useSubscription();
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
          // The plans are the only source of what is on SALE, so a failed call
          // leaves nothing to say about the paid rows — inventing a price here
          // is how a stale number ends up on a public page. Free is a different
          // matter: it never came from this call.
          <>
            <Alert variant="warning" className="mt-8" data-testid="pricing-plans-error">
              <AlertDescription className="text-sm">
                We couldn't load the current plans just now. Reload the page, or
                get in touch if it keeps happening.
              </AlertDescription>
            </Alert>

            {/* Free survives a failed call because nothing about it came from
                that call: the free tier exists whether or not Flash answers,
                and $0 cannot go stale. The cadence is the one thing missing —
                it comes from the scheduling policy we just failed to read, and
                a hardcoded interval here is the same mistake as a hardcoded
                price. So the card says what it knows and stops. */}
            <Card className="mt-6 flex flex-col gap-3 p-5 sm:p-6" data-testid="pricing-free-fallback">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3
                  className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Free
                </h3>
                <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
                  $0
                </p>
              </div>
              <ul className="space-y-1.5">
                {productClaims().map((f) => (
                  <li
                    key={f.key}
                    className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="min-w-0 break-words">{f.label}</span>
                  </li>
                ))}
              </ul>
              <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                On every plan, including this one. What you pay for is how often
                it all gets recalculated.
              </p>
            </Card>
          </>
        ) : (
          <PlanPicker
            plans={plans}
            currentPolicyId={policy?.id ?? null}
            currentPlanId={plan?.planId ?? null}
            onChoose={setCheckoutPlan}
            className="mt-8"
          />
        )}

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
