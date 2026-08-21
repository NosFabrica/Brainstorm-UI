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
  // The interval line is the hero number, not a bullet — said once.
  const features = liveFeatures(id).filter((f) => !f.interval);
  const inheritsName = tier.inherits ? TIERS[tier.inherits].name : null;
  // 60 / 7 = 8.57 — floored, so the claim understates rather than rounds up.
  const timesMoreOften = tier.inherits
    ? Math.floor(TIERS[tier.inherits].recalcIntervalDays / tier.recalcIntervalDays)
    : null;

  // What makes the paid card read as the bigger offer without repeating itself
  // (team review, Aug 21): the interval as the hero with a true multiplier, one
  // "Everything in Free" line that counts as a line, three lines that each say
  // a different thing, a tinted surface — and both CTAs pinned to the card
  // bottom so the two buttons sit on one line.
  return (
    <Card
      className={`flex h-full flex-col p-6 sm:p-7 ${
        paid
          ? "border-brand-accent/40 bg-brand-deep/[0.035] dark:bg-brand-primary/10 ring-1 ring-brand-accent/20"
          : ""
      }`}
      data-testid={`tier-card-${id}`}
    >
      <div className="flex items-center gap-2.5">
        <h2
          className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {tier.name}
        </h2>
        {tier.kicker && (
          <Chip tone="brand" size="sm" data-testid={`tier-kicker-${id}`}>
            {tier.kicker}
          </Chip>
        )}
        {current && !loading && (
          <Chip tone="success" size="sm" data-testid={`tier-current-${id}`}>
            Your plan
          </Chip>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tier.tagline}</p>

      {/* The hero: the interval, as a wait people can feel. */}
      <div className="mt-5" data-testid={`tier-interval-${id}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          New follows show up within
        </p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className={`text-4xl font-bold tracking-tight tabular-nums ${
              paid ? "text-brand-deep dark:text-brand-link" : "text-slate-900 dark:text-slate-100"
            }`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {tier.recalcIntervalDays} days
          </p>
          {timesMoreOften != null && timesMoreOften > 1 && (
            <span className="text-sm font-semibold text-brand-deep dark:text-brand-link" data-testid={`tier-multiplier-${id}`}>
              {timesMoreOften}× more often than {inheritsName}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
          {paid ? formatPrice(id) : "$0"}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">/ month</span>
      </div>

      <ul className="mt-5 space-y-2.5" data-testid={`tier-features-${id}`}>
        {inheritsName && (
          <li className="flex items-start gap-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100" data-testid={`tier-inherits-${id}`}>
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep dark:text-brand-link" />
            Everything in {inheritsName}
          </li>
        )}
        {features.map((f) => (
          <li key={f.key} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {f.label}
          </li>
        ))}
      </ul>

      {/* mt-auto: both cards' buttons land on the same line regardless of list length. */}
      <div className="mt-auto pt-6">
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
