import { useState } from "react";
import { Link } from "wouter";
import { Check, ArrowRight, Loader2 } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import {
  TIERS,
  TIER_ORDER,
  PAID_TIER,
  liveFeatures,
  formatPrice,
  type TierId,
} from "@/lib/plans";
import { useSubscription } from "@/hooks/useSubscription";
import { PriorityCheckout } from "@/components/billing/PriorityCheckout";

/**
 * Two tiers, and a hard line between what exists and what doesn't.
 *
 * The previous version of this page listed 21 features across three paid tiers,
 * of which the nine "Sovereign" ones did not exist in any form. This page can't
 * repeat that: the included lists come from `liveFeatures()`, which drops
 * anything marked `planned`. Anything unbuilt lives on /roadmap, rendered from a
 * different accessor entirely and never with ticks. If someone adds an unbuilt
 * feature to a tier it silently doesn't render, rather than becoming a promise.
 *
 * There is no third "coming soon" column on purpose — that is just more unbuilt
 * promises in a wider layout.
 */
export default function PricingPage() {
  const { tier: currentTier, isLoading } = useSubscription();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    <InfoPageLayout testId="page-pricing">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <PageHeader
          kicker="Pricing"
          // Leads with what staleness costs rather than with a rate, because the
          // rate was never the reason to pay — a filter that lags reality is.
          //
          // The staleness argument, minus the jargon: "your network changes every
          // day" carries the whole premise (what you see lags reality between
          // runs) without the words "scores" or "trust" — Benjamin's call, and
          // right: those words were doing scatter, not work. Still checkable —
          // the intervals are the configured numbers — and if either changes,
          // this changes with it or becomes a lie.
          title={<>Your network changes <span className="text-brand-link">every day.</span></>}
          subtitle="New follows show up in Brainstorm within 60 days on Free, 7 on Priority."
          testId="section-pricing-header"
        />

        <div className="mt-8 grid gap-5 sm:grid-cols-2 items-start">
          {TIER_ORDER.map((id) => (
            <TierCard
              key={id}
              id={id}
              current={currentTier === id}
              loading={isLoading}
              onSubscribe={() => setCheckoutOpen(true)}
            />
          ))}
        </div>

        {/* The roadmap lived here until the team's review: ten unbuilt items one
            click from the buy button, and nobody deciding on $2 wants to read
            them first. One line and a link — the page is now a decision, not a
            document. */}
        <p className="mt-8 text-sm text-slate-600 dark:text-slate-300" data-testid="roadmap-link-line">
          Curious what's coming?{" "}
          <Link href="/roadmap" className="font-semibold text-brand-link hover:underline">
            See the roadmap →
          </Link>
        </p>

        <p className="mt-10 text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-2xl">
          Cancel any time — Priority runs to the end of the period you've paid
          for. Payments are handled by Flash; we never see your card details.
        </p>
      </div>

      <PriorityCheckout open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </InfoPageLayout>
  );
}

function TierCard({
  id,
  current,
  loading,
  onSubscribe,
}: {
  id: TierId;
  current: boolean;
  loading: boolean;
  onSubscribe: () => void;
}) {
  const tier = TIERS[id];
  const paid = id === PAID_TIER;
  const features = liveFeatures(id);
  const inherited = tier.inherits ? liveFeatures(tier.inherits) : [];

  // Three things make the paid card READ as the bigger offer without a single
  // invented line (team review, Aug 21 — "it should feel like you get more"):
  //   1. the interval is the hero number, not a bullet — 60 vs 7 is the product;
  //   2. the inherited Free list is drawn, dimmed, above a "Plus" section, so the
  //      card visibly contains Free and rises above it;
  //   3. the paid surface is tinted and carries a true kicker.
  return (
    <Card
      className={`p-6 sm:p-7 h-full ${
        paid
          ? "border-brand-accent/40 bg-brand-deep/[0.035] dark:bg-brand-primary/10 ring-1 ring-brand-accent/20"
          : ""
      }`}
      data-testid={`tier-card-${id}`}
    >
      {tier.kicker && (
        <p
          className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-link"
          data-testid={`tier-kicker-${id}`}
        >
          {tier.kicker}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <h2
          className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {tier.name}
        </h2>
        {current && !loading && (
          <Chip tone="success" size="sm" data-testid={`tier-current-${id}`}>
            Your plan
          </Chip>
        )}
      </div>

      {/* The hero: the interval, as a wait people can feel. */}
      <div className="mt-4" data-testid={`tier-interval-${id}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          New follows show up within
        </p>
        <p
          className={`mt-0.5 text-4xl font-bold tracking-tight tabular-nums ${
            paid ? "text-brand-deep dark:text-brand-link" : "text-slate-900 dark:text-slate-100"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {tier.recalcIntervalDays} days
        </p>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
          {formatPrice(id)}
        </span>
        {paid && (
          <span className="text-sm text-slate-500 dark:text-slate-400">/ month</span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tier.tagline}</p>

      {tier.note && (
        <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          {tier.note}
        </p>
      )}

      {inherited.length > 0 && (
        <>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Everything in {TIERS[tier.inherits!].name}
          </p>
          <ul className="mt-2 space-y-1.5" data-testid={`tier-inherited-${id}`}>
            {inherited.map((f) => (
              <li key={f.key} className="flex items-start gap-2.5 text-[13px] text-slate-500 dark:text-slate-400">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                {f.label}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-brand-deep dark:text-brand-link">
            Plus
          </p>
        </>
      )}

      <ul className={`${inherited.length > 0 ? "mt-2" : "mt-5"} space-y-2.5`} data-testid={`tier-features-${id}`}>
        {features.map((f) => (
          <li key={f.key} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {f.label}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {current ? (
          <Button variant="outline" className="w-full" disabled data-testid={`cta-${id}`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tier.cta.current}
          </Button>
        ) : paid ? (
          <Button className="w-full gap-1.5" onClick={onSubscribe} data-testid={`cta-${id}`}>
            {tier.cta.upgrade} <ArrowRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
