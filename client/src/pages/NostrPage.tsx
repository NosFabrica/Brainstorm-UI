import { useState } from "react";
import { useLocation } from "wouter";
import {
  Plane,
  Fingerprint,
  Unlock,
  Repeat,
  Key,
  Radio,
  FileSignature,
  ArrowRight,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";

type Benefit = {
  icon: typeof Fingerprint;
  title: string;
  body: string;
};

const BENEFITS: Benefit[] = [
  {
    icon: Fingerprint,
    title: "One identity, everywhere",
    body:
      "Sign in once and your profile, posts, and connections follow you from app to app. No re-creating your account every time you try something new.",
  },
  {
    icon: Unlock,
    title: "Your account stays yours",
    body:
      "Because no single company owns the network, your identity and connections don't disappear if one app shuts down or changes its mind about you.",
  },
  {
    icon: Repeat,
    title: "Easy to switch apps",
    body:
      "Don't like an app? Move to another one and keep your followers. Apps have to earn your attention rather than rely on you being stuck.",
  },
];

type Concept = {
  icon: typeof Key;
  term: string;
  body: string;
};

const CONCEPTS: Concept[] = [
  {
    icon: Key,
    term: "Keys",
    body:
      "Instead of a username and password, you have a pair of keys. Your public key is the handle you share with others. Your private key is the secret that proves a message is really from you — think of it as a signature only you can produce.",
  },
  {
    icon: Radio,
    term: "Relays",
    body:
      "Your posts live on relays — simple servers that pass messages along. Anyone can run one, and your app talks to several at once, so there's no single place that holds everything (and no single place that can lose it).",
  },
  {
    icon: FileSignature,
    term: "Events",
    body:
      "Everything you do — a post, a follow, a profile update — is a small message called an event. Each one is signed with your key, so any app can check that it genuinely came from you and hasn't been tampered with.",
  },
];

const RESOURCES: { name: string; note: string; href: string }[] = [
  { name: "nostr.com", note: "A friendly starting point", href: "https://nostr.com/" },
  { name: "nostr.how", note: "Step-by-step guides", href: "https://nostr.how/" },
  {
    name: "NIPs on GitHub",
    note: "The technical specs",
    href: "https://github.com/nostr-protocol/nips",
  },
];

export default function NostrPage() {
  const [, navigate] = useLocation();
  const [showWeeds, setShowWeeds] = useState(false);

  return (
    <InfoPageLayout testId="page-nostr">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-12 sm:space-y-16 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-nostr-header">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                Built on Nostr
              </span>
              <div className="h-px w-12 bg-[#7c86ff]/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-nostr-title"
            >
              Brainstorm runs on <span className="text-[#333286]">Nostr</span>.
            </h1>
            <p
              className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl"
              data-testid="text-nostr-subtitle"
            >
              You don't need to know what that means to use Brainstorm. But if you're curious about the
              network underneath it, here's the short version — in plain language.
            </p>
          </header>

          {/* Plain-language intro */}
          <section
            className="rounded-2xl border border-[#7c86ff]/25 bg-[#7c86ff]/[0.05] p-6 sm:p-10"
            data-testid="section-nostr-plain"
          >
            <div className="flex items-center gap-2.5 mb-5">
              <div className="h-9 w-9 rounded-xl bg-white border border-[#7c86ff]/25 flex items-center justify-center shrink-0">
                <Plane className="h-[18px] w-[18px] text-[#333286]" />
              </div>
              <span className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase">
                The simple version
              </span>
            </div>
            <div className="space-y-4 max-w-2xl">
              <p className="text-lg text-slate-700 leading-relaxed">
                Think about your passport. It's yours, and it proves who you are at any border. You can fly
                any airline to get where you're going — no single airline owns your identity or decides
                whether you're allowed to travel.
              </p>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                Nostr brings that same idea to social apps. On most platforms today, your profile, your posts,
                and your followers live inside one company's app — and they're stuck there. With Nostr, they
                belong to you, like a passport you carry from app to app — and everything comes along.
              </p>
              <p className="text-[15px] text-slate-500 leading-relaxed">
                That's really all you need to know to get started. Everything below is for the curious.
              </p>
            </div>
          </section>

          {/* What it means for you */}
          <section data-testid="section-nostr-benefits">
            <div className="flex items-center gap-2.5 mb-7">
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                What that means for you
              </h2>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {BENEFITS.map((b) => {
                const Icon = b.icon;
                return (
                  <div
                    key={b.title}
                    className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-7"
                    data-testid={`card-benefit-${b.title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "")}`}
                  >
                    <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center mb-4">
                      <Icon className="h-5 w-5 text-[#333286]" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight mb-1.5">{b.title}</h3>
                    <p className="text-[14px] text-slate-600 leading-relaxed">{b.body}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Get into the weeds — progressive depth */}
          <section
            className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-8"
            data-testid="section-nostr-weeds"
          >
            <div className="max-w-2xl">
              <h2
                className="text-xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                How it actually works
              </h2>
              <p className="mt-2 text-[15px] text-slate-600 leading-relaxed">
                Most people never need this part. But if you like knowing what's under the hood, there are
                really just three ideas to grasp.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowWeeds((v) => !v)}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#333286] hover:text-[#7c86ff] transition-colors"
              data-testid="button-into-the-weeds"
              aria-expanded={showWeeds}
              aria-controls="nostr-weeds-panel"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showWeeds ? "rotate-180" : ""}`} />
              {showWeeds ? "Hide the details" : "Get into the weeds"}
            </button>

            {showWeeds && (
              <div
                id="nostr-weeds-panel"
                className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden"
                data-testid="panel-nostr-weeds"
              >
                {CONCEPTS.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div
                      key={c.term}
                      className="flex flex-col sm:flex-row gap-3 sm:gap-5 p-5 sm:p-6 bg-slate-50/60"
                      data-testid={`concept-${c.term.toLowerCase()}`}
                    >
                      <div className="flex items-center gap-3 sm:flex-col sm:items-start shrink-0 sm:w-28">
                        <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center">
                          <Icon className="h-5 w-5 text-[#333286]" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900 tracking-tight sm:mt-2">{c.term}</h3>
                      </div>
                      <p className="min-w-0 text-[14px] text-slate-600 leading-relaxed">{c.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Learn more — outbound resources */}
          <section data-testid="section-nostr-resources">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.2em] text-slate-400 uppercase">
                Want to go further
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {RESOURCES.map((r) => (
                <a
                  key={r.name}
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 hover:border-[#7c86ff]/40 hover:shadow-sm transition-all"
                  data-testid={`resource-${r.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "")}`}
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.note}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-300 group-hover:text-[#7c86ff] shrink-0 transition-colors" />
                </a>
              ))}
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
                Curious how Brainstorm turns all this into trustworthy search?
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
