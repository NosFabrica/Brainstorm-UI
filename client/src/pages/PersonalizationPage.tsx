import { useLocation } from "wouter";
import { Eye, UserCheck, ArrowRight, ExternalLink, Home, Calculator, Settings as SettingsIcon, ToggleRight } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";

const steps = [
  { icon: Home, text: "Sign in with a nostr browser extension (NIP-07)" },
  { icon: Calculator, text: "Calculate your personalized Trust Metrics at brainstorm.nosfabrica.com" },
  { icon: SettingsIcon, text: "Visit Settings to sync your scores and configure your filters" },
  { icon: ToggleRight, text: 'Switch to "My Point of View" from the search page' },
];

export default function PersonalizationPage() {
  const [, navigate] = useLocation();

  return (
    <InfoPageLayout testId="page-personalization">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="space-y-8 animate-fade-up">
          {/* Header */}
          <div className="space-y-3" data-testid="section-personalization-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit">
              <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Your perspective</p>
            </div>
            <h1
              className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-personalization-title"
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                How Personalization Works
              </span>
            </h1>
            <p className="text-slate-600 font-medium max-w-2xl" data-testid="text-personalization-subtitle">
              Every search is filtered through a point of view. Here's how Brainstorm decides whose trust
              shapes what you see.
            </p>
          </div>

          {/* Two Points of View */}
          <section
            className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden"
            data-testid="card-two-povs"
          >
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                  <Eye className="h-5 w-5 text-[#333286]" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                  Two Points of View
                </h2>
              </div>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                Every search is filtered through a point of view. By default, every profile's verification
                score starts out at 0, meaning "unverified", with the exception of the profile designated as
                the reference (the point of view) profile, whose score is fixed at 100. Think of this as
                meaning that you are, by default, 100 percent certain that you are not an impersonator or
                some other bad actor! As for the rest of the nostr profiles out there, they are presumed
                "unverified" until your trusted community says otherwise.
              </p>
              <p className="text-[15px] text-slate-600 leading-relaxed">We provide you with two options:</p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-white/70 border border-slate-200/80 p-5" data-testid="card-house-pov">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 mb-3">
                    <p className="text-[10px] font-bold tracking-wide text-indigo-700 uppercase">Default</p>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1.5">House Point of View</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Uses trust scores selected by the operator of this instance, the "house". Available to
                    everyone, no need for a nostr account, no sign-in required.
                  </p>
                </div>

                <div className="rounded-xl bg-white/70 border border-emerald-200/80 p-5" data-testid="card-my-pov">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 mb-3">
                    <p className="text-[10px] font-bold tracking-wide text-emerald-700 uppercase">Personalized</p>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1.5">My Point of View</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Your personalized perspective. Uses trust scores derived from your extended community,
                    calculated and made available to platforms like brainstorm.world by a service such as the
                    one at{" "}
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
                    . Or if you prefer, you can be your own trust scores service provider by running the open
                    source code.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Getting Personalized */}
          <section
            className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden"
            data-testid="card-getting-personalized"
          >
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                  <UserCheck className="h-5 w-5 text-[#333286]" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                  Getting Personalized
                </h2>
              </div>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                To unlock your personalized point of view:
              </p>

              <ol className="space-y-3">
                {steps.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <li key={i} className="flex items-start gap-3" data-testid={`step-personalize-${i}`}>
                      <div className="relative flex items-center justify-center h-8 w-8 rounded-lg bg-[#7c86ff]/12 border border-[#7c86ff]/25 shrink-0">
                        <Icon className="h-4 w-4 text-[#333286]" />
                        <span className="absolute -top-1.5 -left-1.5 flex items-center justify-center h-4 w-4 rounded-full bg-[#3730a3] text-white text-[9px] font-bold">
                          {i + 1}
                        </span>
                      </div>
                      <p className="text-[15px] text-slate-700 leading-relaxed pt-1">{step.text}</p>
                    </li>
                  );
                })}
              </ol>

              <div className="rounded-xl bg-[#7c86ff]/8 border border-[#7c86ff]/20 px-4 py-3">
                <p className="text-[15px] text-slate-700 leading-relaxed font-medium">
                  Personalization is entirely optional. The house point of view works well for most searches.
                  Your personalized perspective simply lets you see the nostr world through your own trust
                  network.
                </p>
              </div>
            </div>
          </section>

          {/* Cross-link */}
          <button
            onClick={() => navigate("/how-search-works")}
            className="group w-full text-left rounded-2xl bg-white/80 backdrop-blur-xl border border-[#7c86ff]/20 hover:border-[#7c86ff]/40 hover:shadow-[0_4px_20px_rgba(124,134,255,0.12)] transition-all p-5 sm:p-6 flex items-center justify-between gap-4"
            data-testid="link-to-how-search-works"
          >
            <div>
              <p className="text-xs font-bold tracking-wide text-[#7c86ff] uppercase mb-1">Keep reading</p>
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
