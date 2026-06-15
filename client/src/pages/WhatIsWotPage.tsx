import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "wouter";
import {
  Search,
  ArrowRight,
  ShieldCheck,
  User,
  Users,
  HelpCircle,
  MousePointerClick,
  MessageSquareQuote,
  Globe,
  Building2,
  Store,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import heroPhoto from "@assets/generated_images/wot_hero_cafe.jpg";
import ctaPhoto from "@assets/generated_images/login_human_backdrop.webp";

/**
 * "What is a web of trust" — rebuilt in the light, benefits-first design system
 * shared with /about, /personalization, and /how-search-works.
 *
 * Positioning: plain-English "search that just works." The underlying tech
 * (nostr, relays, keys, signatures) and the formula/parameter tuning from the
 * old dark build are intentionally hidden. Two concepts from the old page are
 * preserved but de-jargoned: trust fades with distance, and actions speak
 * louder than claims.
 */

// Trust fades with distance — the four rings, most-trusted to least.
const trustRings = [
  {
    icon: User,
    label: "You",
    detail: "This is you. Everyone else is measured by how close they are to your circle.",
    level: 4,
    levelLabel: "Anchor",
  },
  {
    icon: Users,
    label: "People you trust",
    detail: "The people you follow and actually talk to. Their take counts the most.",
    level: 3,
    levelLabel: "High trust",
  },
  {
    icon: ConnectionsIcon,
    label: "Their connections",
    detail: "People your friends vouch for. Still trusted, just a little less, since they're one step further out.",
    level: 2,
    levelLabel: "Some trust",
  },
  {
    icon: HelpCircle,
    label: "Strangers",
    detail: "People with no link to your circle yet. They start from scratch and earn trust over time.",
    level: 1,
    levelLabel: "Unproven",
  },
];

// Actions speak louder than claims — the two kinds of signal.
const signalColumns = [
  {
    icon: MousePointerClick,
    kicker: "What people do",
    title: "Actions",
    examples: [
      "Followed them and kept up with their content",
      "Hired them again, or kept coming back",
      "Recommended them to other people",
    ],
    insight: "Actions are hard to fake, so they're the strongest sign of real trust.",
    accent: "indigo" as const,
  },
  {
    icon: MessageSquareQuote,
    kicker: "What people say",
    title: "Endorsements",
    examples: [
      "Left a five-star review",
      "Called them reliable or vouched for them",
      "Flagged or reported a bad actor",
    ],
    insight: "Endorsements add the why. They tell you what someone is actually trusted for.",
    accent: "violet" as const,
  },
];

// Where it shines — enterprise-friendly use cases (no crypto framing).
const useCases = [
  {
    icon: Search,
    title: "Find real people",
    body: "Skip the bots, spam, and fake accounts. The people your circle vouches for show up first.",
  },
  {
    icon: Building2,
    title: "Vet vendors & partners",
    body: "See which providers people you trust have actually worked with, not just who paid to show up first.",
  },
  {
    icon: Store,
    title: "Stronger communities",
    body: "Good communities stay good when trusted members count for more than random newcomers.",
  },
];

// At-a-glance facts (descriptive, not fabricated metrics).
const facts = [
  { value: "0 to 100", label: "Trust scale" },
  { value: "Real time", label: "Updates as your circle acts" },
  { value: "No setup", label: "Works the moment you search" },
  { value: "Everywhere", label: "Follows you across Brainstorm" },
];

// Plain-English FAQ — ideology and protocol jargon removed.
const faqs = [
  {
    q: "How is this different from followers or likes?",
    a: "Followers and likes treat everyone the same, so anyone can buy a million or spin up bots to look popular. Brainstorm looks at who is actually vouching instead. An account with 800 followers that a few people you trust recommend ranks higher for you than a stranger with 500,000 you have never heard of.",
  },
  {
    q: "Will I see the same results as everyone else?",
    a: "Nope, and that's the whole point. Your results are shaped by the people you trust, so they get better the more you use them. Two people can search the same thing and see different results, because their circles are different.",
  },
  {
    q: "What if someone I trust turns out to be a bad actor?",
    a: "Trust isn't set in stone. The moment you or people you trust mute, block, or report someone, their standing drops across your network. It keeps updating as your circle reacts.",
  },
  {
    q: "Do I have to set anything up?",
    a: "Nope. Search works right away using a trusted community we set up for everyone. Sign in whenever you want results tuned to your own circle. It's optional, and there's nothing to configure.",
  },
  {
    q: "Is this a “social credit score”?",
    a: "Not at all. There's no single score that one company controls. Everyone sees their own view, built from their own circle and visible only to them. And you can always see why something ranked where it did.",
  },
];

const ringWidth = ["", "w-1/4", "w-2/4", "w-3/4", "w-full"];

// Example searches that fire the real, trust-ranked search.
const exampleQueries = ["Authors", "Journalists", "Podcasts"];

// Trust-ring cards visually fade with distance: bold indigo at "You",
// receding to muted grey at "Strangers", so the section shows its own point.
const ringChip = [
  "bg-[#7c86ff]/15 border-[#7c86ff]/30",
  "bg-[#7c86ff]/10 border-[#7c86ff]/20",
  "bg-slate-100 border-slate-200",
  "bg-slate-50 border-slate-200",
];
const ringIcon = ["text-[#333286]", "text-[#4b49a0]", "text-slate-500", "text-slate-400"];
const ringFade = [1, 0.94, 0.88, 0.82];

/**
 * Custom "trusted tip" glyph for the simple-version section: a speech bubble
 * with a check inside — a recommendation from someone you trust. Stroke-based
 * to match the lucide line-icon family; inherits color via currentColor.
 */
function TrustedTipIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* speech bubble with a down-left tail */}
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3v-3H5.5A1.5 1.5 0 0 1 4 13.5z" />
      {/* check = trusted */}
      <path d="m8 9.8 2 2 4-4.2" />
    </svg>
  );
}

/**
 * Custom three-person "group" glyph for the "Their connections" ring
 * (friends-of-friends). Stroke-based; inherits color via currentColor.
 */
function ConnectionsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.0096 9.94996C13.7328 9.94996 15.1296 8.55309 15.1296 6.82996C15.1296 5.10683 13.7328 3.70996 12.0096 3.70996C10.2865 3.70996 8.88965 5.10683 8.88965 6.82996C8.88965 8.55309 10.2865 9.94996 12.0096 9.94996Z" />
      <path d="M5.14039 11.77C6.10137 11.77 6.88039 10.991 6.88039 10.03C6.88039 9.06906 6.10137 8.29004 5.14039 8.29004C4.17941 8.29004 3.40039 9.06906 3.40039 10.03C3.40039 10.991 4.17941 11.77 5.14039 11.77Z" />
      <path d="M18.8904 11.77C19.8514 11.77 20.6304 10.991 20.6304 10.03C20.6304 9.06906 19.8514 8.29004 18.8904 8.29004C17.9294 8.29004 17.1504 9.06906 17.1504 10.03C17.1504 10.991 17.9294 11.77 18.8904 11.77Z" />
      <path d="M5.07999 20.29C5.10999 19.84 5.15999 19.4 5.24999 18.98C5.97999 15.26 8.72999 12.5 12.01 12.5C15.21 12.5 17.91 15.12 18.72 18.7C18.83 19.21 18.91 19.74 18.94 20.29" />
      <path d="M2.32999 16.54C2.43999 15 3.72999 13.79 5.29999 13.79C6.07999 13.79 6.79999 14.09 7.32999 14.59" />
      <path d="M22 16.54C21.89 15 20.6 13.79 19.03 13.79C18.25 13.79 17.53 14.09 17 14.59" />
    </svg>
  );
}

export default function WhatIsWotPage() {
  const [, navigate] = useLocation();
  const prefersReduced = useReducedMotion();
  const [query, setQuery] = useState("");

  // Hand off to the real search on the home page (it reads ?q= from the URL).
  const runSearch = (q: string) => {
    const term = q.trim();
    navigate(term ? `/?q=${encodeURIComponent(term)}` : "/");
  };

  return (
    <InfoPageLayout testId="page-what-is-wot">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-12 sm:space-y-16 animate-fade-up">
          {/* Hero */}
          <header className="text-center max-w-3xl mx-auto" data-testid="section-wot-header">
            <div className="flex items-center justify-center gap-2.5 mb-5">
              <div className="h-px w-8 bg-[#7c86ff]/40" />
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                How it works
              </span>
              <div className="h-px w-8 bg-[#7c86ff]/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-[1.05]"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-wot-title"
            >
              Search that knows <span className="text-[#333286]">who to trust</span>.
            </h1>
            <p
              className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto"
              data-testid="text-wot-subtitle"
            >
              When you search, Brainstorm quietly looks at what the people you trust (and the people they
              trust) already think about each result. Real people rise to the top, and bots and fakes
              sink. No setup, no jargon. It just works.
            </p>

            {/* Live search — type and get real, trust-ranked results */}
            <form
              onSubmit={(e) => { e.preventDefault(); runSearch(query); }}
              role="search"
              className="mt-8 max-w-xl mx-auto"
            >
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for real people and trusted voices"
                  aria-label="Search Brainstorm"
                  className="w-full rounded-full border border-slate-200 bg-white py-4 pl-12 pr-14 sm:pr-[7.5rem] text-[15px] text-slate-900 placeholder:text-slate-400 shadow-[0_10px_34px_-12px_rgba(51,50,134,0.25)] focus:border-[#7c86ff] focus:outline-none focus:ring-2 focus:ring-[#7c86ff]/30 transition"
                  data-testid="input-wot-search"
                />
                <button
                  type="submit"
                  aria-label="Search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 sm:px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 active:scale-[0.98] transition-colors shadow-[0_4px_14px_rgba(99,102,241,0.25)]"
                  data-testid="button-wot-search-submit"
                >
                  <Search className="h-4 w-4" />
                  <span className="hidden sm:inline">Search</span>
                </button>
              </div>
            </form>

            {/* Example queries — one click runs the real search */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="text-[13px] text-slate-400">Try:</span>
              {exampleQueries.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => runSearch(q)}
                  className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] text-slate-600 hover:border-[#7c86ff]/40 hover:text-indigo-600 transition-colors"
                  data-testid={`chip-${q.toLowerCase()}`}
                >
                  {q}
                </button>
              ))}
            </div>

            <button
              onClick={() => navigate("/how-search-works")}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
              data-testid="button-wot-how"
            >
              See how search works
              <ArrowRight className="h-4 w-4" />
            </button>
          </header>

          {/* Wide cinematic photo band */}
          <div
            className="relative rounded-3xl overflow-hidden ring-1 ring-slate-200 shadow-[0_24px_70px_-20px_rgba(51,50,134,0.30)] aspect-[3/2] sm:aspect-[2/1] bg-slate-900"
            data-testid="wot-hero-media"
          >
            <motion.img
              src={heroPhoto}
              alt="A diverse group of friends laughing together at a coffee shop"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover object-[center_35%] origin-center"
              data-testid="wot-hero-photo"
              initial={{ scale: 1.05 }}
              animate={
                prefersReduced
                  ? { scale: 1.05 }
                  : { scale: [1.05, 1.12, 1.05], x: [0, -8, 0], y: [0, -5, 0] }
              }
              transition={
                prefersReduced
                  ? undefined
                  : { duration: 26, repeat: Infinity, ease: "easeInOut" }
              }
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#333286]/15 via-transparent to-transparent pointer-events-none" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 pointer-events-none" />
          </div>

          {/* Think of it like this — tinted callout */}
          <section
            className="rounded-2xl border border-[#7c86ff]/25 bg-[#7c86ff]/[0.05] p-6 sm:p-10"
            data-testid="section-wot-simple"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-9 w-9 rounded-xl bg-white border border-[#7c86ff]/25 flex items-center justify-center shrink-0">
                <TrustedTipIcon className="h-[18px] w-[18px] text-[#333286]" />
              </div>
              <span className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase">
                Think of it like this
              </span>
            </div>
            <p className="text-lg text-slate-700 leading-relaxed max-w-3xl">
              Think about the last time a friend told you "you have to try this." That one tip probably
              beat a hundred ads and a pile of anonymous reviews. Brainstorm works the same way. It pays
              attention to the people you already trust, so the real stuff rises and the noise fades out.
            </p>
          </section>

          {/* Trust fades with distance */}
          <section data-testid="section-wot-distance">
            <div className="flex items-center gap-2.5 mb-2.5">
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Trust fades with distance
              </h2>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <p className="text-[15px] text-slate-500 leading-relaxed max-w-2xl mb-7">
              Just like real life. You trust your friends more than strangers, and their
              recommendations more than a stranger's. The further someone is from your circle, the
              less they count, until they earn it.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {trustRings.map((ring, i) => {
                const Icon = ring.icon;
                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 sm:p-6 flex flex-col"
                    style={{ opacity: ringFade[i] }}
                    data-testid={`card-ring-${i}`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={"h-10 w-10 rounded-xl border flex items-center justify-center shrink-0 " + ringChip[i]}>
                        <Icon className={"h-5 w-5 " + ringIcon[i]} />
                      </div>
                      <span className="text-sm font-bold text-slate-300 tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">{ring.label}</h3>
                    <p className="mt-1.5 text-[14px] text-slate-600 leading-relaxed flex-1">{ring.detail}</p>
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-mono font-semibold tracking-[0.15em] text-[#7c86ff] uppercase">
                          {ring.levelLabel}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r from-[#7c86ff] to-[#333286] ${ringWidth[ring.level]}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Actions speak louder than claims */}
          <section data-testid="section-wot-signals">
            <div className="flex items-center gap-2.5 mb-2.5">
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Actions speak louder than claims
              </h2>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <p className="text-[15px] text-slate-500 leading-relaxed max-w-2xl mb-7">
              Brainstorm picks up two kinds of trust signal from your community: what people{" "}
              <span className="font-semibold text-slate-700">do</span>, and what they{" "}
              <span className="font-semibold text-slate-700">say</span>. Together they tell a fuller story
              than either one alone.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {signalColumns.map((col, i) => {
                const Icon = col.icon;
                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-7"
                    data-testid={`card-signal-${i}`}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-[#333286]" />
                      </div>
                      <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-[#7c86ff] uppercase">
                        {col.kicker}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-3">{col.title}</h3>
                    <ul className="space-y-2 mb-4">
                      {col.examples.map((ex, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-[15px] text-slate-600 leading-snug">
                          <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[#7c86ff] shrink-0" />
                          {ex}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[14px] text-slate-500 leading-relaxed border-t border-slate-100 pt-4">
                      {col.insight}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Your network goes with you — dark callout */}
          <section
            className="rounded-2xl bg-[#333286] px-6 py-7 sm:px-10 sm:py-9"
            data-testid="section-wot-portable"
          >
            <div className="flex items-start gap-4 max-w-3xl">
              <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <Globe className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2
                  className="text-xl sm:text-2xl font-bold text-white tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Your network goes with you
                </h2>
                <p className="mt-2 text-[15px] sm:text-base text-white/90 leading-relaxed">
                  Your trusted connections aren't locked inside one app. Your reputation and your
                  network come with you across Brainstorm. Nothing to rebuild, nothing to manage. It
                  just works.
                </p>
              </div>
            </div>
          </section>

          {/* Where it shines */}
          <section data-testid="section-wot-usecases">
            <div className="flex items-center gap-2.5 mb-7">
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Where it shines
              </h2>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {useCases.map((uc, i) => {
                const Icon = uc.icon;
                return (
                  <div
                    key={i}
                    className="rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-[#7c86ff]/50 hover:shadow-md transition-all p-5 sm:p-6"
                    data-testid={`card-usecase-${i}`}
                  >
                    <div className="h-11 w-11 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center mb-4">
                      <Icon className="h-5 w-5 text-[#333286]" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-1.5">{uc.title}</h3>
                    <p className="text-[15px] text-slate-600 leading-relaxed">{uc.body}</p>
                  </div>
                );
              })}
            </div>

            {/* Facts strip */}
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-slate-200 bg-slate-200">
              {facts.map((f, i) => (
                <div key={i} className="bg-white p-5 sm:p-6" data-testid={`fact-${i}`}>
                  <div
                    className="text-xl sm:text-2xl font-bold text-[#333286] tracking-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {f.value}
                  </div>
                  <div className="mt-1 text-[13px] text-slate-500 leading-snug">{f.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section data-testid="section-wot-faq">
            <div className="flex items-center gap-2.5 mb-5">
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Common questions
              </h2>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 sm:px-7">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, i) => (
                  <AccordionItem
                    key={i}
                    value={`faq-${i}`}
                    className="border-slate-100 last:border-0"
                    data-testid={`faq-${i}`}
                  >
                    <AccordionTrigger className="text-left text-[15px] sm:text-base font-semibold text-slate-900 hover:no-underline hover:text-[#333286]">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-[15px] text-slate-600 leading-relaxed">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          {/* CTA + cross-link — photographic enterprise band */}
          <section
            className="relative overflow-hidden rounded-2xl ring-1 ring-[#333286]/20 shadow-[0_24px_70px_-20px_rgba(51,50,134,0.45)]"
            data-testid="section-wot-cta"
          >
            <div className="grid md:grid-cols-2">
              {/* Left: brand panel — copy on a solid, perfectly legible background */}
              <div className="relative overflow-hidden bg-gradient-to-br from-[#3a3893] via-[#2b2972] to-[#16143a] px-7 py-10 sm:px-12 sm:py-14 flex items-center order-2 md:order-1">
                {/* faint concentric "ripples of trust" radiating from the corner */}
                <svg
                  className="absolute -top-28 -right-28 w-[460px] h-[460px] text-white opacity-[0.08] pointer-events-none"
                  viewBox="0 0 200 200"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.7"
                  aria-hidden="true"
                >
                  <circle cx="100" cy="100" r="32" />
                  <circle cx="100" cy="100" r="58" />
                  <circle cx="100" cy="100" r="84" />
                  <circle cx="100" cy="100" r="100" />
                  <circle cx="100" cy="100" r="6" fill="currentColor" stroke="none" opacity="0.5" />
                </svg>
                {/* soft brand glow */}
                <div className="absolute -left-12 bottom-0 w-56 h-56 rounded-full bg-[#7c86ff]/20 blur-3xl pointer-events-none" />

                <div className="relative z-10 max-w-md">
                  <div className="h-11 w-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center mb-5">
                    <ShieldCheck className="h-5 w-5 text-white" />
                  </div>
                  <h2
                    className="text-2xl sm:text-3xl font-bold text-white tracking-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    See who your network trusts
                  </h2>
                  <p className="mt-3 text-white/80 leading-relaxed">
                    Start searching for real people and trusted voices. No account needed to jump in.
                  </p>
                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => navigate("/")}
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#333286] bg-white hover:bg-slate-100 rounded-full transition-colors active:scale-[0.98] shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
                      data-testid="button-wot-cta-search"
                    >
                      <Search className="h-4 w-4" />
                      Start searching
                    </button>
                    <button
                      onClick={() => navigate("/how-search-works")}
                      className="inline-flex items-center gap-1.5 px-4 py-3 text-sm font-semibold text-white/85 hover:text-white transition-colors"
                      data-testid="button-wot-cta-how"
                    >
                      How search works
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: clean photo, blended into the panel at the seam */}
              <div className="relative min-h-[220px] sm:min-h-[300px] md:min-h-full bg-slate-900 order-1 md:order-2">
                <img
                  src={ctaPhoto}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover object-[center_38%]"
                />
                {/* desktop seam: fade the photo's left edge into the panel */}
                <div className="absolute inset-0 hidden md:block bg-gradient-to-r from-[#16143a] via-[#16143a]/10 to-transparent" />
                {/* mobile seam: fade the photo's bottom edge into the panel */}
                <div className="absolute inset-0 md:hidden bg-gradient-to-b from-transparent via-transparent to-[#16143a]" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </InfoPageLayout>
  );
}
