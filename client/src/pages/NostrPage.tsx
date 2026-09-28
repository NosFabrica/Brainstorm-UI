import { useState } from "react";
import { SupportedClientsGrid } from "@/components/SupportedClientsGrid";
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
import { Card } from "@/components/ui/card";
import { tone as getTone } from "@/lib/tones";

type Benefit = {
  icon: typeof Fingerprint;
  title: string;
  body: string;
};

const BENEFITS: Benefit[] = [
  {
    icon: Fingerprint,
    title: "One identity, everywhere",
    body: "Sign in once and your profile, posts, and connections follow you from app to app. No re-creating your account every time you try something new.",
  },
  {
    icon: Unlock,
    title: "Your account stays yours",
    body: "Because no single company owns the network, your identity and connections don't disappear if one app shuts down or changes its mind about you.",
  },
  {
    icon: Repeat,
    title: "Easy to switch apps",
    body: "Don't like an app? Move to another one and keep your network and content. Apps have to earn your attention rather than rely on you being stuck.",
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
    body: "Instead of a username and password, you have a pair of keys. Your public key is the handle you share with others. Your private key is the secret that proves a message is really from you — think of it as a signature only you can produce.",
  },
  {
    icon: Radio,
    term: "Relays",
    body: "Your posts live on relays — simple servers that pass messages along. Anyone can run one, and your app talks to several at once, so there's no single place that holds everything (and no single place that can lose it). You can even run your own and choose exactly where your posts go — your content, your turf.",
  },
  {
    icon: FileSignature,
    term: "Events",
    body: "Everything you do — a post, a follow, a profile update — is a small message called an event. Each one is signed with your key, so any app can check that it genuinely came from you and hasn't been tampered with.",
  },
];

const RESOURCES: { name: string; note: string; href: string }[] = [
  { name: "grownostr.org", note: "A friendly starting point", href: "https://grownostr.org/" },
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
  const accent = getTone("accent");

  return (
    <InfoPageLayout testId="page-nostr">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="animate-fade-up space-y-12 sm:space-y-16">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-nostr-header">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-accent">
                Built on Nostr
              </span>
              <div className="h-px w-12 bg-brand-accent/40" />
            </div>
            <h1
              className="text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-nostr-title"
            >
              Brainstorm runs on <span className="text-brand-link">Nostr</span>.
            </h1>
            <p
              className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="text-nostr-subtitle"
            >
              You don't need to know what that means to use Brainstorm. But if you're curious about the network
              underneath it, here's the short version — in plain language.
            </p>
          </header>

          {/* Plain-language intro */}
          <section
            className="rounded-2xl border border-brand-accent/25 bg-brand-accent/[0.05] p-6 sm:p-10"
            data-testid="section-nostr-plain"
          >
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-accent/25 bg-white dark:bg-slate-900">
                <Plane className="h-[18px] w-[18px] text-brand-deep" />
              </div>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-accent">
                The simple version
              </span>
            </div>
            <div className="max-w-2xl space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-200">
                Think about your passport. It's yours, and it proves who you are at any border. You can fly any airline
                to get where you're going — no single airline owns your identity or decides whether you're allowed to
                travel.
              </p>
              <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                Nostr brings that same idea to the internet. On most platforms today, your profile, your posts, and your
                followers live inside one company's app — and they're stuck there. With Nostr, they belong to you, like
                a passport you carry from app to app — and everything comes along.
              </p>
              <p className="text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
                That's really all you need to know to get started. Everything below is for the curious.
              </p>
            </div>
          </section>

          {/* What it means for you */}
          <section data-testid="section-nostr-benefits">
            <div className="mb-7 flex items-center gap-2.5">
              <h2
                className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                What that means for you
              </h2>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {BENEFITS.map((b) => {
                const Icon = b.icon;
                return (
                  <Card
                    key={b.title}
                    className="p-6 sm:p-7"
                    data-testid={`card-benefit-${b.title
                      .toLowerCase()
                      .replace(/[^a-z]+/g, "-")
                      .replace(/(^-|-$)/g, "")}`}
                  >
                    <div
                      className={`h-10 w-10 rounded-xl ${accent.bg} border ${accent.border} mb-4 flex items-center justify-center`}
                    >
                      <Icon className={`h-5 w-5 ${accent.icon}`} />
                    </div>
                    <h3 className="mb-1.5 text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                      {b.title}
                    </h3>
                    <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">{b.body}</p>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Get into the weeds — progressive depth */}
          <Card className="p-6 sm:p-8" data-testid="section-nostr-weeds">
            <div className="max-w-2xl">
              <h2
                className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
              >
                How it actually works
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                Most people never need this part. But if you like knowing what's under the hood, there are really just
                three ideas to grasp.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowWeeds((v) => !v)}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep transition-colors hover:text-brand-accent"
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
                className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800/60 dark:border-slate-800"
                data-testid="panel-nostr-weeds"
              >
                {CONCEPTS.map((c) => {
                  const Icon = c.icon;
                  return (
                    <div
                      key={c.term}
                      className="flex flex-col gap-3 bg-slate-50/60 p-5 dark:bg-slate-900/60 sm:flex-row sm:gap-5 sm:p-6"
                      data-testid={`concept-${c.term.toLowerCase()}`}
                    >
                      <div className="flex shrink-0 items-center gap-3 sm:w-28 sm:flex-col sm:items-start">
                        <div
                          className={`h-10 w-10 rounded-xl ${accent.bg} border ${accent.border} flex items-center justify-center`}
                        >
                          <Icon className={`h-5 w-5 ${accent.icon}`} />
                        </div>
                        <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:mt-2">
                          {c.term}
                        </h3>
                      </div>
                      <p className="min-w-0 text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">{c.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Get an app — the practical next step after "what is Nostr". Brainstorm
              is a trust + search layer, not a client, so pointing at real apps is
              part of the answer rather than a competitor plug. Mirrors the
              "Open in a Nostr app" picker used on share pages. */}
          <section data-testid="section-nostr-apps">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                Get a Nostr app
              </span>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>
            <SupportedClientsGrid testIdPrefix="nostr-app" />
          </section>

          {/* Learn more — outbound resources */}
          <section data-testid="section-nostr-resources">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                Want to go further
              </span>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {RESOURCES.map((r) => (
                <a
                  key={r.name}
                  href={r.href}
                  target="_blank"
                  rel="noopener"
                  className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 transition-all hover:border-brand-accent/40 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  data-testid={`resource-${r.name
                    .toLowerCase()
                    .replace(/[^a-z]+/g, "-")
                    .replace(/(^-|-$)/g, "")}`}
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{r.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{r.note}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-accent dark:text-slate-600" />
                </a>
              ))}
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
                Curious how Brainstorm turns all this into trustworthy search?
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
