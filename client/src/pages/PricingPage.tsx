import { useState } from "react";
import { Check, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import {
  TIERS,
  TIER_ORDER,
  PAID_TIER,
  liveFeatures,
  plannedFeatures,
  formatPrice,
  type TierId,
} from "@/lib/plans";
import { useSubscription } from "@/hooks/useSubscription";
import { SupporterCheckout } from "@/components/billing/SupporterCheckout";

/**
 * Two tiers, and a hard line between what exists and what doesn't.
 *
 * The previous version of this page listed 21 features across three paid tiers,
 * of which the nine "Sovereign" ones did not exist in any form. This page can't
 * repeat that: the included lists come from `liveFeatures()`, which drops
 * anything marked `planned`, and the roadmap below is rendered from a different
 * accessor entirely and never uses ticks. If someone adds an unbuilt feature to
 * a tier, it silently doesn't render rather than becoming a promise.
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
          title={<>Free to use. <span className="text-brand-link">Supported by people who use it.</span></>}
          subtitle="Brainstorm scores reputation from real human connections. The core is free and stays free — supporters fund the work and get a head start."
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

        {/* Roadmap. Deliberately NOT ticks, NOT inside a tier card, and NOT
            counted anywhere — it is a statement of intent, and it has to read
            like one. */}
        <section className="mt-12" data-testid="section-roadmap">
          <SectionHeader kicker="What your support funds" icon={Sparkles} />
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            None of this exists yet. It's what we're building next, and it's why
            the supporter tier is worth having now rather than later. Supporters
            get it first, at the price they signed up at.
          </p>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2" data-testid="roadmap-list">
            {plannedFeatures().map((f) => (
              <li
                key={f.key}
                className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300"
                data-testid={`roadmap-${f.key}`}
              >
                <span
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
                  aria-hidden
                />
                {f.label}
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-2xl">
          Cancel any time — your support runs to the end of the period you've
          paid for. Payments are handled by Flash; we never see your card
          details.
        </p>
      </div>

      <SupporterCheckout open={checkoutOpen} onOpenChange={setCheckoutOpen} />
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

  return (
    <Card
      className={`p-6 sm:p-7 h-full ${paid ? "border-brand-accent/40" : ""}`}
      data-testid={`tier-card-${id}`}
    >
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

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
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

      <ul className="mt-5 space-y-2.5" data-testid={`tier-features-${id}`}>
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
