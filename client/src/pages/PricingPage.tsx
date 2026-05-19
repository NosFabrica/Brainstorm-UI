import { useState } from "react";
import { useLocation } from "wouter";
import { Check, Sparkles, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import { useEffect } from "react";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { CommerceNav } from "@/components/CommerceNav";
import { ComplianceStrip } from "@/components/ComplianceStrip";
import { BrainLogo } from "@/components/BrainLogo";

type BillingCycle = "monthly" | "annual";

interface Tier {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number;
  cadence: string;
  features: string[];
  cta: string;
  ctaPath: string;
  highlight?: boolean;
}

const tiers: Tier[] = [
  {
    id: "observer",
    name: "Free Observer",
    tagline: "Try it out",
    monthlyPrice: 0,
    annualPrice: 0,
    cadence: "Manual recalc, up to 1× per month",
    features: [
      "Full Web of Trust dashboard",
      "Network explorer",
      "Profile lookups & search",
      "Manual GrapeRank recalculation (1/mo limit)",
    ],
    cta: "Get started",
    ctaPath: "/dashboard",
  },
  {
    id: "monthly",
    name: "Monthly Pulse",
    tagline: "For casual users",
    monthlyPrice: 8,
    annualPrice: 80,
    cadence: "Auto-recalc once a month",
    features: [
      "Everything in Observer",
      "Automatic monthly GrapeRank refresh",
      "NIP-85 trust attestation publishing",
      "Priority queue access",
      "Email support",
    ],
    cta: "Choose Monthly",
    ctaPath: "/checkout?plan=monthly",
    highlight: true,
  },
  {
    id: "bimonthly",
    name: "Bi-Monthly Pulse",
    tagline: "For active users & devs",
    monthlyPrice: 12,
    annualPrice: 120,
    cadence: "Auto-recalc twice a month",
    features: [
      "Everything in Monthly Pulse",
      "Twice-monthly GrapeRank refresh",
      "Verified Provider badge on NIP-85 listings",
      "Early access to new features",
      "Direct support channel",
    ],
    cta: "Choose Bi-Monthly",
    ctaPath: "/checkout?plan=bimonthly",
  },
];

const faqs = [
  {
    q: "What does 'recalculation' actually do?",
    a: "Each recalculation runs your GrapeRank trust scores against the latest Nostr network data — adding new follows, accounting for new mutes/reports, and refreshing the trust signal for every account in your extended network. More frequent recalculation means fresher trust scores.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. You can cancel from your Billing page at any time. Your subscription remains active through the end of the current billing period, then stops. No partial-month refunds on monthly plans.",
  },
  {
    q: "What about refunds?",
    a: "Monthly plans: cancel anytime, no refunds on partial months. Annual plans: pro-rata refunds within the first 30 days. See our Refund Policy for the full terms.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards (Visa, Mastercard, American Express, Discover). Payment processing is handled by a PCI-compliant provider — your card details never touch our servers.",
  },
];

export default function PricingPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Pricing — Brainstorm";
    setUser(getCurrentUser());
  }, []);

  const handleTierClick = (tier: Tier) => {
    if (tier.id === "observer") {
      navigate(user ? "/dashboard" : "/login");
      return;
    }
    navigate(`${tier.ctaPath}&billing=${billing}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden" data-testid="page-pricing">
      <PageBackground />
      <CommerceNav user={user} pageTitle="Pricing" />

      <main className="flex-1 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
          <div className="space-y-3 text-center max-w-3xl mx-auto animate-fade-up" data-testid="section-pricing-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm" data-testid="pill-pricing-kicker">
              <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Pricing</p>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-pricing-title">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x block pb-1">
                Pick your refresh cadence
              </span>
            </h1>
            <p className="text-slate-600 font-medium text-lg max-w-2xl mx-auto" data-testid="text-pricing-subtitle">
              You're paying for one thing: how often your personal Web of Trust is recalculated. No fake feature gates — just frequency.
            </p>
          </div>

          <div className="flex justify-center mt-8" data-testid="toggle-billing-cycle">
            <div className="inline-flex rounded-full p-1 bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm">
              <button
                onClick={() => setBilling("monthly")}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${billing === "monthly" ? "bg-[#3730a3] text-white" : "text-slate-500 hover:text-[#333286]"}`}
                data-testid="button-billing-monthly"
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling("annual")}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${billing === "annual" ? "bg-[#3730a3] text-white" : "text-slate-500 hover:text-[#333286]"}`}
                data-testid="button-billing-annual"
              >
                Annual
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${billing === "annual" ? "bg-emerald-400/30 text-emerald-100" : "bg-emerald-100 text-emerald-700"}`}>
                  Save ~16%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10" data-testid="grid-tiers">
            {tiers.map((tier) => {
              const isFree = tier.id === "observer";
              const price = billing === "monthly" ? tier.monthlyPrice : tier.annualPrice / 12;
              const displayPrice = isFree ? "0" : price.toFixed(price % 1 === 0 ? 0 : 2);
              const annualTotal = tier.annualPrice;

              return (
                <div
                  key={tier.id}
                  className={`relative rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border overflow-hidden flex flex-col transition-all duration-500 hover:-translate-y-1 ${
                    tier.highlight
                      ? "border-[#7c86ff]/50 shadow-[0_20px_40px_-12px_rgba(124,134,255,0.35)] ring-2 ring-[#7c86ff]/20"
                      : "border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] hover:shadow-[0_20px_40px_-12px_rgba(124,134,255,0.25)] hover:border-[#7c86ff]/40"
                  }`}
                  data-testid={`card-tier-${tier.id}`}
                >
                  {tier.highlight && (
                    <div className="absolute top-4 right-4">
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#7c86ff] to-[#333286] text-white text-[10px] font-bold uppercase tracking-wide shadow-lg" data-testid={`badge-popular-${tier.id}`}>
                        <Sparkles className="h-3 w-3" />
                        Most popular
                      </div>
                    </div>
                  )}
                  <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                        <BrainLogo size={20} className="text-[#333286]" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid={`text-tier-name-${tier.id}`}>
                          {tier.name}
                        </h3>
                        <p className="text-xs text-slate-500" data-testid={`text-tier-tagline-${tier.id}`}>{tier.tagline}</p>
                      </div>
                    </div>

                    <div className="mt-5 mb-1">
                      <div className="flex items-baseline gap-1.5" data-testid={`text-tier-price-${tier.id}`}>
                        <span className="text-4xl font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
                          ${displayPrice}
                        </span>
                        {!isFree && <span className="text-sm text-slate-500 font-medium">/mo</span>}
                      </div>
                      {!isFree && billing === "annual" && (
                        <p className="text-xs text-emerald-600 font-semibold mt-1" data-testid={`text-tier-annual-total-${tier.id}`}>
                          ${annualTotal}/yr billed upfront
                        </p>
                      )}
                      {!isFree && billing === "monthly" && (
                        <p className="text-xs text-slate-400 font-medium mt-1">Billed monthly, cancel anytime</p>
                      )}
                      {isFree && <p className="text-xs text-slate-400 font-medium mt-1">Free forever</p>}
                    </div>

                    <div className="mt-3 mb-5 rounded-xl bg-[#7c86ff]/8 border border-[#7c86ff]/15 px-3 py-2 flex items-center gap-2" data-testid={`text-tier-cadence-${tier.id}`}>
                      <RefreshCw className="h-3.5 w-3.5 text-[#333286] shrink-0" />
                      <span className="text-xs font-semibold text-[#333286]">{tier.cadence}</span>
                    </div>

                    <ul className="space-y-2.5 mb-6 flex-1" data-testid={`list-tier-features-${tier.id}`}>
                      {tier.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className="w-full bg-[#3730a3] hover:bg-[#3730a3] text-white font-semibold"
                      onClick={() => handleTierClick(tier)}
                      data-testid={`button-select-${tier.id}`}
                    >
                      {tier.cta}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-12 rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden" data-testid="section-pricing-faq">
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="bg-gradient-to-b from-[#7c86ff]/10 to-white/60 border-b border-[#7c86ff]/10 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Common questions</h2>
            </div>
            <div className="p-4 sm:p-5 space-y-2">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className={`rounded-xl transition-all ${expandedFaq === i ? "bg-[#7c86ff]/8 border border-[#7c86ff]/30" : "bg-white/60 border border-slate-200/80 hover:border-[#7c86ff]/25"}`}
                  data-testid={`faq-pricing-${i}`}
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                    data-testid={`button-faq-pricing-${i}`}
                  >
                    <span className={`text-sm font-semibold ${expandedFaq === i ? "text-[#333286]" : "text-slate-700"}`}>{faq.q}</span>
                    <motion.div animate={{ rotate: expandedFaq === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className={`h-4 w-4 ${expandedFaq === i ? "text-[#7c86ff]" : "text-slate-400"}`} />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {expandedFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 text-sm text-slate-600 leading-relaxed" data-testid={`text-faq-pricing-answer-${i}`}>
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>

          <ComplianceStrip />
        </div>
      </main>

      <Footer />
    </div>
  );
}
