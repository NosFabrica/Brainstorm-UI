import { useLocation } from "wouter";
import {
  Eye,
  UserCheck,
  ArrowRight,
  ExternalLink,
  Home,
  Calculator,
  Settings as SettingsIcon,
  ToggleRight,
  Building2,
  UserCircle,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { tone as getTone } from "@/lib/tones";
import ownPerspectiveImg from "@assets/generated_images/about_yours_identity.webp";

const steps = [
  { icon: Home, text: "Sign in with your key or extension." },
  { icon: Calculator, text: "Calculate your personalized Trust Metrics at brainstorm.world." },
  { icon: SettingsIcon, text: "Visit Settings to sync your scores and configure your filters." },
  { icon: ToggleRight, text: 'Switch to "My Point of View" from the search page.' },
];

export default function PersonalizationPage() {
  const [, navigate] = useLocation();
  const emerald = getTone("emerald");

  return (
    <InfoPageLayout testId="page-personalization">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="animate-fade-up space-y-12 sm:space-y-16">
          {/* Editorial hero */}
          <PageHeader
            size="hero"
            kicker="Your perspective"
            title={
              <>
                Every search has a <span className="text-brand-link">point of view</span>.
              </>
            }
            subtitle="By default, you see the network through a trusted community curated by the house. Sign in, and you can see it through your own network — here's how Brainstorm decides whose opinions shape what you see."
            testId="section-personalization-header"
          />

          {/* The big idea — tinted two-column */}
          <section
            className="overflow-hidden rounded-2xl border border-brand-accent/25 bg-brand-accent/[0.05]"
            data-testid="section-personalization-idea"
          >
            <div className="grid md:grid-cols-2 md:items-stretch">
              {/* Image */}
              <div className="relative min-h-[220px] bg-slate-950 sm:min-h-[280px] md:order-2 md:min-h-[340px]">
                <img
                  src={ownPerspectiveImg}
                  alt="A person walking through the city, viewing the world through their own perspective"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  data-testid="section-personalization-image"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tl from-brand-deep/30 via-transparent to-transparent" />
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
              </div>

              {/* Copy */}
              <div className="flex flex-col justify-center p-6 sm:p-10 md:order-1">
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-accent/25 bg-white dark:bg-slate-900">
                    <Eye className="h-[18px] w-[18px] text-brand-deep" />
                  </div>
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-accent">
                    The big idea
                  </span>
                </div>
                <div className="space-y-4">
                  <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-200">
                    Every profile's verification score starts at{" "}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">0</span> — "unverified" — with
                    one exception: the reference profile (the point of view), whose score is fixed at{" "}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">100</span>.
                  </p>
                  <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 dark:text-slate-600">
                    Think of it this way: you are, by default, 100 percent certain that you are not an impersonator or
                    some other bad actor. Everyone else on the network is presumed "unverified" until your trusted
                    community says otherwise.
                  </p>
                  <p className="text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Which trusted community? That's the choice you get to make.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Two points of view — comparison */}
          <section data-testid="card-two-povs">
            <div className="mb-7 flex items-center gap-2.5">
              <h2
                className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Two points of view
              </h2>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-6 sm:p-7" data-testid="card-house-pov">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/10">
                    <Building2 className="h-5 w-5 text-brand-deep" />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-accent">
                    Default
                  </span>
                </div>
                <h3 className="mb-1.5 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  House Point of View
                </h3>
                <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 dark:text-slate-600">
                  Uses scores selected by the operator of this instance — the "house." Available to everyone, with no
                  account and no sign-in required.
                </p>
              </Card>

              <Card className="border-emerald-200 p-6 sm:p-7" data-testid="card-my-pov">
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-xl ${emerald.bg} border ${emerald.border} flex shrink-0 items-center justify-center`}
                  >
                    <UserCircle className={`h-5 w-5 ${emerald.icon}`} />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600">
                    Personalized
                  </span>
                </div>
                <h3 className="mb-1.5 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  My Point of View
                </h3>
                <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 dark:text-slate-600">
                  Your personalized perspective. Uses scores derived from your extended community, calculated and made
                  available to platforms like{" "}
                  <a
                    href="https://amethyst.social/"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 transition-colors hover:text-emerald-800 hover:underline"
                    data-testid="link-amethyst"
                  >
                    amethyst.social
                    <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  by a service such as the one at{" "}
                  <a
                    href="https://brainstorm.world"
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 transition-colors hover:text-emerald-800 hover:underline"
                    data-testid="link-brainstorm-world"
                  >
                    brainstorm.world
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  . Or, if you prefer, you can be your own trust-scores service provider by running the open-source
                  code.
                </p>
              </Card>
            </div>
          </section>

          {/* Getting personalized — numbered stages */}
          <section data-testid="card-getting-personalized">
            <div className="mb-7 flex items-center gap-2.5">
              <h2
                className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Getting personalized
              </h2>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>
            <Card className="divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
              {steps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 sm:gap-4 sm:px-5 sm:py-4"
                    data-testid={`step-personalize-${i}`}
                  >
                    <span
                      className="w-5 shrink-0 text-sm font-bold tabular-nums leading-none text-slate-300 dark:text-slate-600"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-accent/20 bg-brand-accent/10">
                      <Icon className="h-[18px] w-[18px] text-brand-deep" />
                    </div>
                    <p className="min-w-0 text-[14px] leading-snug text-slate-700 dark:text-slate-200 sm:text-[15px]">
                      {step.text}
                    </p>
                  </div>
                );
              })}
            </Card>

            {/* Optional note callout — house accent panel (subtle cyan tint),
                matching the How-Search-Works callout in both themes. */}
            <div
              className="mt-6 rounded-2xl border border-brand-accent/25 bg-brand-accent/[0.06] px-5 py-4 sm:px-6 sm:py-5"
              data-testid="callout-optional"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-accent/20 bg-brand-accent/10">
                  <UserCheck className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
                </div>
                <p className="pt-1 text-[15px] font-medium leading-relaxed text-[#0A0E18] dark:text-slate-100">
                  Personalization is entirely optional. The house point of view works well for most searches — your
                  personalized perspective simply lets you see the world through your own trust network.
                </p>
              </div>
            </div>
          </section>

          {/* Cross-link */}
          <button
            onClick={() => navigate("/how-search-works")}
            className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:border-brand-accent/40 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
            data-testid="link-to-how-search-works"
          >
            <div>
              <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-accent">
                Keep reading
              </p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Curious how the underlying mechanics work?
              </p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">See How Search Works</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-brand-accent transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </InfoPageLayout>
  );
}
