import { useLocation } from 'wouter';
import { ArrowRight, Shield, Users, Zap } from 'lucide-react';
import { ComputingBackground } from '@/components/ComputingBackground';
import { Footer } from '@/components/Footer';

const steps = [
  {
    icon: Shield,
    title: "Install a Nostr Extension",
    description: "Get a NIP-07 browser extension like nos2x or Alby to manage your Nostr identity securely.",
  },
  {
    icon: Users,
    title: "Build Your Network",
    description: "Follow people you trust. Your follow list becomes the foundation of your personal Web of Trust.",
  },
  {
    icon: Zap,
    title: "Calculate GrapeRank",
    description: "Run the GrapeRank algorithm to compute trust scores based on your unique social graph.",
  },
];

export default function OnboardingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
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

      <ComputingBackground variant="dark" />

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 relative">
        <div
          className="max-w-2xl w-full relative z-10 px-6"
          style={{ animation: 'fadeIn 0.4s ease-out' }}
        >
          <div
            className="text-center mb-10"
            style={{ animation: 'fadeInUp 0.5s ease-out 0.1s both' }}
          >
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-white via-indigo-200 to-violet-300 bg-clip-text text-transparent leading-tight"
              data-testid="text-onboarding-title"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Get Started with Brainstorm
            </h1>
            <p className="text-slate-400 mt-3 text-base sm:text-lg max-w-lg mx-auto">
              Three steps to your personalized Web of Trust
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {steps.map((step, i) => (
              <div
                key={i}
                className="relative bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 rounded-xl p-5 sm:p-6 shadow-lg ring-1 ring-indigo-500/5 flex items-start gap-4"
                style={{ animation: `fadeInUp 0.5s ease-out ${0.2 + i * 0.1}s both` }}
                data-testid={`card-onboarding-step-${i}`}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center">
                  <step.icon className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-indigo-400/60">0{i + 1}</span>
                    <h3 className="text-base font-semibold text-white">{step.title}</h3>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8"
            style={{ animation: 'fadeInUp 0.5s ease-out 0.5s both' }}
          >
            <button
              onClick={() => setLocation('/')}
              className="px-6 py-3 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-100 hover:text-indigo-900 rounded-lg transition-all duration-300 inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              data-testid="button-onboarding-signin"
            >
              Sign In with Nostr
              <ArrowRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => setLocation('/what-is-wot')}
              className="px-5 py-3 text-sm font-medium text-slate-400 hover:text-indigo-300 bg-slate-800/50 hover:bg-slate-700/70 border border-slate-700/50 hover:border-indigo-500/30 rounded-lg transition-all duration-300 cursor-pointer"
              data-testid="button-onboarding-learn"
            >
              Learn about Web of Trust
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
