import { useLocation } from "wouter";
import { ArrowRight, Shield, Users, Zap } from "lucide-react";
import { Footer } from "@/components/Footer";

const steps = [
  {
    icon: Shield,
    title: "Install a Nostr Extension",
    description: "Get a NIP-07 browser extension like nos2x or Alby to manage your Nostr identity securely.",
  },
  {
    icon: Users,
    title: "Build Your Network",
    description: "Follow a few accounts. Your follow list is what your personal network is built from.",
  },
  {
    icon: Zap,
    title: "Calculate GrapeRank",
    description: "Run the GrapeRank algorithm to compute scores based on your unique social graph.",
  },
];

export default function OnboardingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950">
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Human-Signals photography (people, nodes baked in) behind an Ink scrim —
          people before technology, per the brand. */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <img
          src="/brand/hero.jpg"
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-slate-950/55" />
        <div className="absolute inset-0 bg-brand-primary/10 mix-blend-overlay" />
      </div>

      <div className="relative flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="relative z-10 w-full max-w-2xl px-6" style={{ animation: "fadeIn 0.4s ease-out" }}>
          <div className="mb-10 text-center" style={{ animation: "fadeInUp 0.5s ease-out 0.1s both" }}>
            <h1
              className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl"
              data-testid="text-onboarding-title"
            >
              Get Started with Brainstorm
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base text-slate-300 sm:text-lg">
              Three steps to your personalized scores
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {steps.map((step, i) => (
              <div
                key={i}
                className="relative flex items-start gap-4 rounded-xl border border-slate-700/50 bg-slate-900/70 p-5 shadow-lg ring-1 ring-brand-primary/5 backdrop-blur-xl sm:p-6"
                style={{ animation: `fadeInUp 0.5s ease-out ${0.2 + i * 0.1}s both` }}
                data-testid={`card-onboarding-step-${i}`}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-brand-primary/20 bg-brand-primary/20">
                  <step.icon className="h-5 w-5 text-brand-link" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-xs text-brand-link">0{i + 1}</span>
                    <h3 className="text-base font-semibold text-white">{step.title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-400">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ animation: "fadeInUp 0.5s ease-out 0.5s both" }}
          >
            <button
              onClick={() => setLocation("/")}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-base font-medium text-white transition-all duration-300 hover:bg-brand-primary/15 hover:text-brand-primary active:scale-[0.98]"
              data-testid="button-onboarding-signin"
            >
              Sign In with Nostr
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => setLocation("/what-is-wot")}
              className="cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-5 py-3 text-sm font-medium text-slate-400 transition-all duration-300 hover:border-brand-primary/[0.3] hover:bg-slate-700/70 hover:text-brand-link"
              data-testid="button-onboarding-learn"
            >
              How Brainstorm works
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
