import { useLocation } from "wouter";
import { Sparkles, Search, ShieldCheck, Network, ArrowRight, ExternalLink } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function AboutPage() {
  const [, navigate] = useLocation();

  return (
    <InfoPageLayout testId="page-about">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="space-y-8 animate-fade-up">
          {/* Header */}
          <div className="space-y-3" data-testid="section-about-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit">
              <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">About Brainstorm</p>
            </div>
            <h1
              className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-about-title"
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                Clarity in a fragmented world
              </span>
            </h1>
            <p className="text-slate-600 font-medium max-w-2xl" data-testid="text-about-subtitle">
              Brainstorm is a search engine for people. It helps you find the right profiles across an
              open social network — and tells the legitimate ones apart from the noise.
            </p>
          </div>

          {/* Mission */}
          <section
            className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden"
            data-testid="card-about-mission"
          >
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5 text-[#333286]" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                  Our mission
                </h2>
              </div>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                The open web is full of voices, but it's hard to know who to trust. Anyone can claim to be
                anyone, and spam, bots, and impersonators crowd out the real people. Brainstorm exists to
                cut through that — surfacing authentic profiles using the organic trust signals that
                communities already create every day.
              </p>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                We believe reputation should belong to people, not platforms. No single company decides who
                is credible. Instead, your community vouches for itself, and Brainstorm reads those signals
                to give you a clearer view of who's who.
              </p>
            </div>
          </section>

          {/* What it does */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div
              className="rounded-2xl bg-white/85 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.06)] p-5 sm:p-6 space-y-3"
              data-testid="card-about-search"
            >
              <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                <Search className="h-5 w-5 text-[#333286]" />
              </div>
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
                Search
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Find profiles across millions of accounts by name, bio, website, or handle — instant and
                typo-tolerant.
              </p>
            </div>

            <div
              className="rounded-2xl bg-white/85 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.06)] p-5 sm:p-6 space-y-3"
              data-testid="card-about-verify"
            >
              <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-[#333286]" />
              </div>
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
                Verify
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Each profile gets a trust score from real community signals — follows, mutes, and reports —
                so spam and impostors sink.
              </p>
            </div>

            <div
              className="rounded-2xl bg-white/85 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.06)] p-5 sm:p-6 space-y-3"
              data-testid="card-about-personalize"
            >
              <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center">
                <Network className="h-5 w-5 text-[#333286]" />
              </div>
              <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>
                Personalize
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Sign in to see results through your own Web of Trust — your network's perspective on who
                matters.
              </p>
            </div>
          </div>

          {/* Who built it */}
          <section
            className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden"
            data-testid="card-about-who"
          >
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 space-y-4">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                Who's behind it
              </h2>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                Brainstorm is built by{" "}
                <a
                  href="https://nosfabrica.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                  data-testid="link-about-nosfabrica"
                >
                  NosFabrica
                  <ExternalLink className="h-3 w-3" />
                </a>
                , a team building open, user-owned infrastructure for trust and reputation. It runs on{" "}
                <a
                  href="https://nostr.how/en/what-is-nostr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                  data-testid="link-about-nostr"
                >
                  Nostr
                  <ExternalLink className="h-3 w-3" />
                </a>
                , an open protocol where your identity and social graph belong to you — not to any single
                app or company.
              </p>
              <div className="rounded-xl bg-[#7c86ff]/8 border border-[#7c86ff]/20 px-4 py-3">
                <p className="text-[15px] text-slate-700 leading-relaxed font-medium">
                  Open by design: your reputation travels with you, and no platform can take it away.
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
                Want the technical details?
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
