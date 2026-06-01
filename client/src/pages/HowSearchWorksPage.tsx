import { useLocation } from "wouter";
import { Search, ShieldCheck, ArrowRight, ExternalLink } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";

export default function HowSearchWorksPage() {
  const [, navigate] = useLocation();

  return (
    <InfoPageLayout testId="page-how-search-works">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="space-y-8 animate-fade-up">
          {/* Header */}
          <div className="space-y-3" data-testid="section-hsw-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit">
              <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">Under the hood</p>
            </div>
            <h1
              className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-hsw-title"
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                How Search Works
              </span>
            </h1>
            <p className="text-slate-600 font-medium max-w-2xl" data-testid="text-hsw-subtitle">
              How Brainstorm finds the right nostr profiles — and how it tells the legitimate ones apart from the noise.
            </p>
          </div>

          {/* Search */}
          <section
            className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden"
            data-testid="card-hsw-search"
          >
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                  <Search className="h-5 w-5 text-[#333286]" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                  Search
                </h2>
              </div>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                Brainstorm indexes millions of nostr profiles (and growing) and lets you search them by
                name, bio, NIP-05, or website. Under the hood we are using{" "}
                <a
                  href="https://vespa.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                  data-testid="link-vespa"
                >
                  Vespa
                  <ExternalLink className="h-3 w-3" />
                </a>
                , a lightning-fast, open-source, and developer-friendly search engine designed to provide
                instant, typo-tolerant full-text and hybrid (semantic) search.
              </p>
            </div>
          </section>

          {/* Verification */}
          <section
            className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden"
            data-testid="card-hsw-verification"
          >
            <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
            <div className="p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5 text-[#333286]" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                  Verification
                </h2>
              </div>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                Brainstorm harnesses organic signals from your community to distinguish "legitimate" nostr
                accounts from spam, impersonators, bots, and other bad actors seeking to weasel their way
                onto the screen in front of your eyes.
              </p>
              <p className="text-[15px] text-slate-600 leading-relaxed">
                Currently we rely upon follows, mutes, and reports, processed using a method called{" "}
                <a
                  href="https://primal.net/straycat/graperank"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                  data-testid="link-graperank"
                >
                  GrapeRank
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                to come up with a verification score between 0 and 100. When one profile (whose score is
                above 0) follows another, that profile's score gets a bump up, leveling out at the max score
                of 100. Mutes and reports push a score down. But have no fear: if an unverified account
                follows, mutes, or reports someone, that follow, mute, or report is completely ignored by
                virtue of having a verification score of 0.
              </p>
              <div className="rounded-xl bg-[#7c86ff]/8 border border-[#7c86ff]/20 px-4 py-3">
                <p className="text-[15px] text-slate-700 leading-relaxed font-medium">
                  So it doesn't matter how many spambots are spun up. A thousand, a million. Without social
                  proof, they will all be ignored.
                </p>
              </div>
            </div>
          </section>

          {/* Cross-link */}
          <button
            onClick={() => navigate("/personalization")}
            className="group w-full text-left rounded-2xl bg-white/80 backdrop-blur-xl border border-[#7c86ff]/20 hover:border-[#7c86ff]/40 hover:shadow-[0_4px_20px_rgba(124,134,255,0.12)] transition-all p-5 sm:p-6 flex items-center justify-between gap-4"
            data-testid="link-to-personalization"
          >
            <div>
              <p className="text-xs font-bold tracking-wide text-[#7c86ff] uppercase mb-1">Keep reading</p>
              <p className="text-base font-semibold text-slate-900">
                Curious how your point of view affects what you see?
              </p>
              <p className="text-sm text-slate-500 mt-0.5">See How Personalization Works</p>
            </div>
            <ArrowRight className="h-5 w-5 text-[#7c86ff] shrink-0 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </InfoPageLayout>
  );
}
