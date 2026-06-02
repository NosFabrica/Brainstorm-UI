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
import ownPerspectiveImg from "@assets/generated_images/about_yours_identity.webp";

const steps = [
  { icon: Home, text: "Sign in with your key or extension." },
  { icon: Calculator, text: "Calculate your personalized Trust Metrics at brainstorm.world." },
  { icon: SettingsIcon, text: "Visit Settings to sync your scores and configure your filters." },
  { icon: ToggleRight, text: 'Switch to "My Point of View" from the search page.' },
];

export default function PersonalizationPage() {
  const [, navigate] = useLocation();

  return (
    <InfoPageLayout testId="page-personalization">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-12 sm:space-y-16 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-personalization-header">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                Your perspective
              </span>
              <div className="h-px w-12 bg-[#7c86ff]/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-personalization-title"
            >
              Every search has a <span className="text-[#333286]">point of view</span>.
            </h1>
            <p
              className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl"
              data-testid="text-personalization-subtitle"
            >
              By default, you see the network through a trusted community curated by the house. Sign in, and you can
              see it through your own Web of Trust — here's how Brainstorm decides whose trust shapes what you
              see.
            </p>
          </header>

          {/* The big idea — tinted two-column */}
          <section
            className="rounded-2xl border border-[#7c86ff]/25 bg-[#7c86ff]/[0.05] overflow-hidden"
            data-testid="section-personalization-idea"
          >
            <div className="grid md:grid-cols-2 md:items-stretch">
              {/* Image */}
              <div className="relative min-h-[220px] sm:min-h-[280px] md:min-h-[340px] bg-slate-950 md:order-2">
                <img
                  src={ownPerspectiveImg}
                  alt="A person walking through the city, viewing the world through their own perspective"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  data-testid="section-personalization-image"
                />
                <div className="absolute inset-0 bg-gradient-to-tl from-[#333286]/30 via-transparent to-transparent pointer-events-none" />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/5 pointer-events-none" />
              </div>

              {/* Copy */}
              <div className="p-6 sm:p-10 flex flex-col justify-center md:order-1">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="h-9 w-9 rounded-xl bg-white border border-[#7c86ff]/25 flex items-center justify-center shrink-0">
                    <Eye className="h-[18px] w-[18px] text-[#333286]" />
                  </div>
                  <span className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase">
                    The big idea
                  </span>
                </div>
                <div className="space-y-4">
                  <p className="text-lg text-slate-700 leading-relaxed">
                    Every profile's verification score starts at{" "}
                    <span className="font-semibold text-slate-900">0</span> — "unverified" — with one exception:
                    the reference profile (the point of view), whose score is fixed at{" "}
                    <span className="font-semibold text-slate-900">100</span>.
                  </p>
                  <p className="text-[15px] text-slate-600 leading-relaxed">
                    Think of it this way: you are, by default, 100 percent certain that you are not an
                    impersonator or some other bad actor. Everyone else on the network is presumed "unverified" until
                    your trusted community says otherwise.
                  </p>
                  <p className="text-[15px] text-slate-500 leading-relaxed">
                    Which trusted community? That's the choice you get to make.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Two points of view — comparison */}
          <section data-testid="card-two-povs">
            <div className="flex items-center gap-2.5 mb-7">
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Two points of view
              </h2>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div
                className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-7"
                data-testid="card-house-pov"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-[#333286]" />
                  </div>
                  <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-[#7c86ff] uppercase">
                    Default
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-1.5">House Point of View</h3>
                <p className="text-[15px] text-slate-600 leading-relaxed">
                  Uses trust scores selected by the operator of this instance — the "house." Available to
                  everyone, with no account and no sign-in required.
                </p>
              </div>

              <div
                className="rounded-2xl border border-emerald-200 bg-white shadow-sm p-6 sm:p-7"
                data-testid="card-my-pov"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                    <UserCircle className="h-5 w-5 text-emerald-700" />
                  </div>
                  <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-emerald-600 uppercase">
                    Personalized
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-1.5">My Point of View</h3>
                <p className="text-[15px] text-slate-600 leading-relaxed">
                  Your personalized perspective. Uses trust scores derived from your extended community,
                  calculated and made available to platforms like brainstorm.world by a service such as the one
                  at{" "}
                  <a
                    href="https://brainstorm.nosfabrica.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 hover:text-emerald-800 hover:underline transition-colors"
                    data-testid="link-brainstorm-nosfabrica"
                  >
                    brainstorm.nosfabrica.com
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  . Or, if you prefer, you can be your own trust-scores service provider by running the
                  open-source code.
                </p>
              </div>
            </div>
          </section>

          {/* Getting personalized — numbered stages */}
          <section data-testid="card-getting-personalized">
            <div className="flex items-center gap-2.5 mb-7">
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Getting personalized
              </h2>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {steps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3.5 sm:gap-4 px-4 py-3.5 sm:px-5 sm:py-4 hover:bg-slate-50/60 transition-colors"
                    data-testid={`step-personalize-${i}`}
                  >
                    <span
                      className="text-sm font-bold text-slate-300 tabular-nums leading-none w-5 shrink-0"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="h-9 w-9 rounded-lg bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
                      <Icon className="h-[18px] w-[18px] text-[#333286]" />
                    </div>
                    <p className="min-w-0 text-[14px] sm:text-[15px] text-slate-700 leading-snug">{step.text}</p>
                  </div>
                );
              })}
            </div>

            {/* Optional note callout */}
            <div className="mt-6 rounded-2xl bg-[#333286] px-5 py-4 sm:px-6 sm:py-5" data-testid="callout-optional">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                  <UserCheck className="h-4 w-4 text-white" />
                </div>
                <p className="text-[15px] text-white/95 leading-relaxed font-medium pt-1">
                  Personalization is entirely optional. The house point of view works well for most searches —
                  your personalized perspective simply lets you see the world through your own trust
                  network.
                </p>
              </div>
            </div>
          </section>

          {/* Cross-link */}
          <button
            onClick={() => navigate("/how-search-works")}
            className="group w-full text-left rounded-2xl border border-slate-200 bg-white hover:border-[#7c86ff]/40 hover:shadow-sm transition-all p-6 flex items-center justify-between gap-4"
            data-testid="link-to-how-search-works"
          >
            <div>
              <p className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase mb-1.5">
                Keep reading
              </p>
              <p className="text-base font-semibold text-slate-900">
                Curious how the underlying mechanics work?
              </p>
              <p className="text-sm text-slate-500 mt-0.5">See How Search Works</p>
            </div>
            <ArrowRight className="h-5 w-5 text-[#7c86ff] shrink-0 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </InfoPageLayout>
  );
}
