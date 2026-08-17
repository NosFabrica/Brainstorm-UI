import type { ReactNode } from "react";
import { Check, ArrowRight } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { TIERS, liveFeatures, formatPrice } from "@/lib/plans";

/**
 * TEMPORARY — a scroll-and-compare sheet for four pricing-page treatments.
 *
 * Not linked from anywhere and not meant to ship: delete this file and its route
 * in App.tsx when a direction is picked. It exists because reading four copy
 * options in a chat window is not the same as seeing which one you believe.
 *
 * Everything renders from the real `plans.ts`, so no variant can flatter itself
 * with numbers the product doesn't actually deliver — 60 and 7 are the same 60
 * and 7 everywhere, and the feature lists are `liveFeatures()` as usual.
 *
 * ## The problem all four are answering
 *
 * The shipped page argues against itself. Free shows 8 bullets to Priority's 3,
 * so the free column reads as the bigger offer; Free's tagline actively sells
 * Free; and the header's second sentence — "you can recalculate manually any
 * time" — spends the most valuable line on the page rebutting the pitch. And
 * nowhere does it say what being 53 days stale actually costs, which is the one
 * true argument for paying.
 */

// Priority gets everything Free gets, so the genuinely shared items are Free's
// list minus its schedule line — the schedule is the difference, not a shared
// benefit. Computed rather than hand-listed so it can't drift from plans.ts.
const SHARED = liveFeatures("free").filter((f) => f.key !== "recalc-60d");
const PRIORITY_ONLY = liveFeatures("priority");
const FREE_ALL = liveFeatures("free");

export default function PricingOptionsPage() {
  return (
    <InfoPageLayout testId="page-pricing-options">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-16">
        <header>
          <Chip tone="warning" size="sm">Internal — not linked, not shipping</Chip>
          <h1
            className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Four ways to say the same true thing
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            Same numbers in every version — 60 days, 7 days, $2. What changes is
            which fact leads, and whether the two columns are asked to look
            comparable. Scroll and see which one you believe.
          </p>
        </header>

        <Variant
          id="a"
          label="A — as it is now"
          note="Baseline. Free shows 8 bullets to Priority's 3, so the eye reads Free as the larger offer before anyone has read a word."
        >
          <Head
            title={<>Same features. <B>Two speeds.</B></>}
            sub="Scores recalculated every 60 days on Free, every 7 on Priority. You can recalculate manually any time, on either plan."
          />
          <TwoCards
            freeTagline="nothing held back, just less often"
            freeItems={FREE_ALL}
            priorityTagline="recalculated weekly, without asking"
            priorityNote="Everything in Free, recalculated every 7 days instead of every 60."
            priorityItems={PRIORITY_ONLY}
          />
        </Variant>

        <Variant
          id="b"
          label="B — shared features pulled out"
          note="Structural, not copy. Everything both plans get moves above the cards, so each column carries only its difference. The columns become symmetrical and Free stops looking bigger — without hiding anything."
        >
          <Head
            title={<>One difference: <B>how often we recalculate.</B></>}
            sub="Everything else is the same on both plans."
          />
          <p className="mt-5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Both plans include</span>{" "}
            {SHARED.map((f) => f.label.toLowerCase()).join(", ")}.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 items-start">
            <SlimCard
              tier="free"
              headline="Every 60 days"
              sub="Recalculated automatically, six times a year."
            />
            <SlimCard
              tier="priority"
              headline="Every 7 days"
              sub="Recalculated automatically, and your runs go ahead of the free queue."
              extra="Priority support"
            />
          </div>
        </Variant>

        <Variant
          id="c"
          label="C — led by what staleness costs"
          note="The only version that states a reason to pay rather than a rate. Checkable against the interval, so it stays honest — but it is the first copy here written to persuade, so read it aloud before you believe it."
        >
          <Head
            title={<>Your scores are only as current as <B>their last update.</B></>}
            sub="Someone your network reports today still looks clean to you until your next recalculation. On Free that can be 60 days. On Priority, 7."
          />
          <TwoCards
            freeTagline="for checking someone occasionally"
            freeItems={FREE_ALL}
            priorityTagline="for acting on what you see"
            priorityNote="Everything in Free, recalculated every 7 days instead of every 60."
            priorityItems={PRIORITY_ONLY}
          />
        </Variant>

        <Variant
          id="d"
          label="D — the combination I'd ship"
          note="C's header, B's layout, use-based taglines, and the multiple stated rather than left as arithmetic. Manual recalculation moves into the shared line, where it reassures instead of arguing against the sale."
        >
          <Head
            title={<>Your scores are only as current as <B>their last update.</B></>}
            sub="Someone your network reports today still looks clean to you until your next recalculation. On Free that can be 60 days. On Priority, 7."
          />
          <p className="mt-5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Both plans include</span>{" "}
            {SHARED.map((f) => f.label.toLowerCase()).join(", ")}.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 items-start">
            <SlimCard
              tier="free"
              headline="Every 60 days"
              sub="For checking someone occasionally."
            />
            <SlimCard
              tier="priority"
              headline="Every 7 days"
              sub="For acting on what you see. Your runs go ahead of the free queue."
              extra="Priority support"
              badge="8× fresher"
            />
          </div>
        </Variant>
      </div>
    </InfoPageLayout>
  );
}

/* ------------------------------------------------------------------ */

function B({ children }: { children: ReactNode }) {
  return <span className="text-brand-link">{children}</span>;
}

function Variant({
  id,
  label,
  note,
  children,
}: {
  id: string;
  label: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={`variant-${id}`} className="scroll-mt-8" id={`variant-${id}`}>
      <div className="flex items-center gap-2.5">
        <Chip tone="info" size="sm">{label}</Chip>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-2xl">
        {note}
      </p>
      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-5 sm:p-7">
        {children}
      </div>
    </section>
  );
}

function Head({ title, sub }: { title: ReactNode; sub: string }) {
  return (
    <div>
      <p className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
        Pricing
      </p>
      <h2
        className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
        {sub}
      </p>
    </div>
  );
}

function TwoCards({
  freeTagline,
  freeItems,
  priorityTagline,
  priorityNote,
  priorityItems,
}: {
  freeTagline: string;
  freeItems: { key: string; label: string }[];
  priorityTagline: string;
  priorityNote: string;
  priorityItems: { key: string; label: string }[];
}) {
  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-2 items-start">
      <FullCard name="Free" price="Free" tagline={freeTagline} items={freeItems} />
      <FullCard
        name={TIERS.priority.name}
        price={`${formatPrice("priority")} / month`}
        tagline={priorityTagline}
        note={priorityNote}
        items={priorityItems}
        cta="Get Priority"
        accent
      />
    </div>
  );
}

function FullCard({
  name,
  price,
  tagline,
  note,
  items,
  cta,
  accent,
}: {
  name: string;
  price: string;
  tagline: string;
  note?: string;
  items: { key: string; label: string }[];
  cta?: string;
  accent?: boolean;
}) {
  return (
    <Card className={`p-5 h-full ${accent ? "border-brand-accent/40" : ""}`}>
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
        {name}
      </h3>
      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{price}</div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tagline}</p>
      {note && <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{note}</p>}
      <ul className="mt-4 space-y-2">
        {items.map((f) => (
          <li key={f.key} className="flex items-start gap-2.5 text-[13.5px] text-slate-700 dark:text-slate-200">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {f.label}
          </li>
        ))}
      </ul>
      {cta && (
        <Button className="mt-5 w-full gap-1.5">
          {cta} <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </Card>
  );
}

/** The difference-only card used by B and D. */
function SlimCard({
  tier,
  headline,
  sub,
  extra,
  badge,
}: {
  tier: "free" | "priority";
  headline: string;
  sub: string;
  extra?: string;
  badge?: string;
}) {
  const paid = tier === "priority";
  return (
    <Card className={`p-5 h-full ${paid ? "border-brand-accent/40" : ""}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
          {TIERS[tier].name}
        </h3>
        {badge && <Chip tone="success" size="sm">{badge}</Chip>}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
        {paid ? `${formatPrice("priority")} / month` : "Free"}
      </div>
      <div className="mt-4 text-xl font-bold text-brand-link tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        {headline}
      </div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">{sub}</p>
      {extra && (
        <p className="mt-2 flex items-start gap-2.5 text-[13.5px] text-slate-700 dark:text-slate-200">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          {extra}
        </p>
      )}
      {paid && (
        <Button className="mt-5 w-full gap-1.5">
          Get Priority <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </Card>
  );
}
