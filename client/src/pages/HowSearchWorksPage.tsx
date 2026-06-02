import { useState } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Database,
  ListFilter,
  ShieldCheck,
  ArrowUpDown,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Plus,
  Minus,
  Ban,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { BrainLogo } from "@/components/BrainLogo";
import trustedRecommendationImg from "@assets/generated_images/hsw_trusted_recommendation.webp";

const BrainLogoIcon = ({ className }: { className?: string }) => <BrainLogo className={className} />;

const PuzzleToyIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M9.15 5.76C8.55 6.48 8.55 7.52 9.15 8.24C9.75 8.96 10.78 9.14 11.59 8.68C11.68 8.63 11.78 8.63 11.87 8.68C11.95 8.73 12 8.82 12 8.92V12H8.92C8.82 12 8.73 12.05 8.68 12.13C8.63 12.22 8.63 12.32 8.68 12.41C9.14 13.22 8.96 14.25 8.24 14.85C7.52 15.45 6.48 15.45 5.76 14.85C5.04 14.25 4.86 13.22 5.32 12.41C5.37 12.32 5.37 12.22 5.32 12.13C5.27 12.05 5.18 12 5.08 12H2V6.03C2 3.81 3.81 2 6.03 2H12V5.08C12 5.18 11.95 5.27 11.87 5.32C11.78 5.37 11.68 5.37 11.59 5.32C10.78 4.86 9.75 5.04 9.15 5.76Z" />
    <path d="M22 12.0002V17.9702C22 20.1902 20.19 22.0002 17.97 22.0002H12V18.9202C12 18.8202 12.05 18.7302 12.13 18.6802C12.22 18.6302 12.32 18.6302 12.41 18.6802C13.22 19.1402 14.25 18.9602 14.85 18.2402C15.45 17.5202 15.45 16.4802 14.85 15.7602C14.25 15.0402 13.22 14.8602 12.41 15.3202C12.32 15.3702 12.22 15.3702 12.13 15.3202C12.05 15.2702 12 15.1802 12 15.0802V12.0002H15.08C15.18 12.0002 15.27 11.9502 15.32 11.8702C15.37 11.7802 15.37 11.6802 15.32 11.5902C14.86 10.7802 15.04 9.75025 15.76 9.15025C16.48 8.55025 17.51 8.55025 18.23 9.15025C18.95 9.75025 19.13 10.7802 18.67 11.5902C18.62 11.6802 18.62 11.7802 18.67 11.8702C18.72 11.9502 18.81 12.0002 18.91 12.0002H22Z" />
    <path d="M18 3.5C19.38 3.5 20.5 4.62 20.5 6V18C20.5 19.38 19.38 20.5 18 20.5H6C4.62 20.5 3.5 19.38 3.5 18V6C3.5 4.62 4.62 3.5 6 3.5H18ZM18 2H6C3.79 2 2 3.79 2 6V18C2 20.21 3.79 22 6 22H18C20.21 22 22 20.21 22 18V6C22 3.79 20.21 2 18 2Z" />
  </svg>
);

type PipelineNode = {
  key: string;
  step: string;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PIPELINE: PipelineNode[] = [
  { key: "query", step: "Input", label: "Query", sub: "You type a name", icon: Search },
  { key: "index", step: "01", label: "Index", sub: "Vespa", icon: Database },
  { key: "match", step: "02", label: "Retrieve", sub: "Match profiles", icon: ListFilter },
  { key: "verify", step: "03", label: "Verify", sub: "GrapeRank", icon: ShieldCheck },
  { key: "rank", step: "04", label: "Rank", sub: "Order by trust", icon: ArrowUpDown },
  { key: "results", step: "Output", label: "Results", sub: "Real people", icon: BrainLogoIcon },
];

type Stage = {
  num: string;
  title: string;
  body: React.ReactNode;
  detail: string;
  icon: typeof Search;
};

const STAGES: Stage[] = [
  {
    num: "01",
    title: "Index",
    icon: Database,
    body: (
      <>
        Brainstorm continuously indexes millions of profiles — and counting — so they can be searched
        the instant you start typing.
      </>
    ),
    detail: "Powered by Vespa · typo-tolerant full-text + hybrid (semantic) search",
  },
  {
    num: "02",
    title: "Retrieve & Match",
    icon: ListFilter,
    body: (
      <>
        Every query is matched against each profile's name, bio, identifier, and website to surface the
        closest candidates.
      </>
    ),
    detail: "Instant matching across name · bio · identifier · website",
  },
  {
    num: "03",
    title: "Verify",
    icon: ShieldCheck,
    body: (
      <>
        Organic community signals — follows, mutes, and reports — separate legitimate accounts from spam,
        bots, and impersonators before they ever reach your screen.
      </>
    ),
    detail: "GrapeRank · 0–100 verification score",
  },
  {
    num: "04",
    title: "Rank",
    icon: ArrowUpDown,
    body: (
      <>
        Verified candidates are ordered by trust — either from the NosFabrica "house" point of view or your
        own personalized Web of Trust.
      </>
    ),
    detail: "House POV (default) or My POV (personalized)",
  },
];

const METRICS: { value: string; label: string }[] = [
  { value: "Millions", label: "Profiles indexed & growing" },
  { value: "Hybrid", label: "Full-text + semantic search" },
  { value: "0–100", label: "Community verification score" },
  { value: "0 = ignored", label: "Unverified accounts carry no weight" },
];

const POWERED_BY: { name: string; note: string; href: string }[] = [
  { name: "Vespa", note: "Search engine", href: "https://vespa.ai/" },
  { name: "GrapeRank", note: "Trust scoring", href: "https://primal.net/straycat/graperank" },
  { name: "Nostr", note: "Open protocol", href: "https://nostr.com/" },
];

function PipelineDiagram() {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 sm:p-7"
      data-testid="diagram-pipeline"
    >
      <div className="flex items-center gap-2 mb-5">
        <span className="text-[10px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase">
          The pipeline
        </span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {PIPELINE.map((node, i) => {
          const Icon = node.icon;
          const isEndpoint = node.step === "Input" || node.step === "Output";
          return (
            <div key={node.key} className="contents">
              <div
                className={`flex-1 rounded-xl border p-4 flex flex-col items-center text-center gap-2 ${
                  isEndpoint ? "border-slate-200 bg-slate-50" : "border-[#7c86ff]/25 bg-[#7c86ff]/[0.04]"
                }`}
                data-testid={`node-pipeline-${node.key}`}
              >
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    isEndpoint ? "bg-white border border-slate-200 text-slate-500" : "bg-white border border-[#7c86ff]/25 text-[#333286]"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[9px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                  {node.step}
                </span>
                <p className="text-sm font-bold text-slate-900 leading-none">{node.label}</p>
                <p className="text-[11px] text-slate-500 leading-tight">{node.sub}</p>
              </div>
              {i < PIPELINE.length - 1 && (
                <div className="flex items-center justify-center text-slate-300 py-1 lg:py-0 lg:px-1">
                  <ChevronRight className="hidden lg:block h-5 w-5" />
                  <ChevronDown className="lg:hidden h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrustSignal({
  icon: Icon,
  tone,
  title,
  effect,
  fill,
}: {
  icon: typeof Plus;
  tone: "up" | "down" | "off";
  title: string;
  effect: string;
  fill: number;
}) {
  const toneStyles = {
    up: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", icon: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    down: { chip: "bg-rose-50 text-rose-700 border-rose-200", bar: "bg-rose-500", icon: "text-rose-600 bg-rose-50 border-rose-200" },
    off: { chip: "bg-slate-100 text-slate-500 border-slate-200", bar: "bg-slate-300", icon: "text-slate-400 bg-slate-50 border-slate-200" },
  }[tone];
  return (
    <div className="flex items-center gap-3" data-testid={`signal-${tone}`}>
      <div className={`h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 ${toneStyles.icon}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-sm font-semibold text-slate-800 truncate">{title}</p>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${toneStyles.chip}`}>
            {effect}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${toneStyles.bar}`} style={{ width: `${fill}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function HowSearchWorksPage() {
  const [, navigate] = useLocation();
  const [showMechanics, setShowMechanics] = useState(false);

  return (
    <InfoPageLayout testId="page-how-search-works">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-12 sm:space-y-16 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-hsw-header">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                Under the hood
              </span>
              <div className="h-px w-12 bg-[#7c86ff]/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-hsw-title"
            >
              How Brainstorm finds the <span className="text-[#333286]">real people</span>.
            </h1>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl" data-testid="text-hsw-subtitle">
              Search is only half the job. The harder part is telling legitimate accounts apart from the
              spam, bots, and impersonators. Here's the pipeline that does both — from query to verified
              results.
            </p>
          </header>

          {/* Plain-language intro */}
          <section
            className="rounded-2xl border border-[#7c86ff]/25 bg-[#7c86ff]/[0.05] overflow-hidden"
            data-testid="section-hsw-plain"
          >
            <div className="grid md:grid-cols-2 md:items-stretch">
              {/* Image */}
              <div className="relative min-h-[220px] sm:min-h-[280px] md:min-h-[340px] bg-slate-950 md:order-2">
                <img
                  src={trustedRecommendationImg}
                  alt="Two friends sharing a trusted recommendation over coffee"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  data-testid="section-hsw-plain-image"
                />
                <div className="absolute inset-0 bg-gradient-to-tl from-[#333286]/30 via-transparent to-transparent pointer-events-none" />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/5 pointer-events-none" />
              </div>

              {/* Copy */}
              <div className="p-6 sm:p-10 flex flex-col justify-center md:order-1">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="h-9 w-9 rounded-xl bg-white border border-[#7c86ff]/25 flex items-center justify-center shrink-0">
                    <PuzzleToyIcon className="h-4.5 w-4.5 text-[#333286]" />
                  </div>
                  <span className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase">
                    The simple version
                  </span>
                </div>
                <div className="space-y-4">
                  <p className="text-lg text-slate-700 leading-relaxed">
                    Imagine you've just moved to a new town and you need a good coffee shop. You wouldn't trust a
                    random flyer stapled to a pole — you'd ask the friends you trust where they go.
                    Brainstorm works the same way.
                  </p>
                  <p className="text-[15px] text-slate-600 leading-relaxed">
                    When you search, it quietly checks what the people you (and your wider community) already
                    trust have to say about each result. Real accounts that those people vouch for rise to the
                    top. Bots, scammers, and impersonators that no one trusts get pushed aside — no matter how
                    many of them there are.
                  </p>
                  <p className="text-[15px] text-slate-500 leading-relaxed">
                    That's the whole idea. Everything below is just a closer look at how it happens under the
                    hood.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Pipeline diagram */}
          <PipelineDiagram />

          {/* Metrics strip */}
          <section
            className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-slate-200 bg-slate-200"
            data-testid="section-hsw-metrics"
          >
            {METRICS.map((m) => (
              <div key={m.label} className="bg-white p-5 sm:p-6" data-testid={`metric-${m.value}`}>
                <p
                  className="text-xl sm:text-2xl font-bold text-[#333286] tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {m.value}
                </p>
                <p className="mt-1 text-xs sm:text-[13px] text-slate-500 leading-snug">{m.label}</p>
              </div>
            ))}
          </section>

          {/* Process stages */}
          <section data-testid="section-hsw-stages">
            <div className="flex items-center gap-2.5 mb-7">
              <h2
                className="text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                The four stages
              </h2>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
              {STAGES.map((stage) => {
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.num}
                    className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-6 sm:p-8"
                    data-testid={`stage-${stage.num}`}
                  >
                    <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-3 shrink-0 sm:w-20">
                      <span
                        className="text-3xl font-bold text-slate-200 tabular-nums leading-none"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {stage.num}
                      </span>
                      <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-[#333286]" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-1.5">{stage.title}</h3>
                      <p className="text-[15px] text-slate-600 leading-relaxed">{stage.body}</p>
                      <p className="mt-3 inline-flex items-center text-[12px] font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1">
                        {stage.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Trust-score visual */}
          <section
            className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 sm:p-8"
            data-testid="section-hsw-trust"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5 text-[#333286]" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                How a trust score moves
              </h2>
            </div>
            <p className="text-[15px] text-slate-600 leading-relaxed mb-6 max-w-2xl">
              Every profile starts unverified at <span className="font-semibold text-slate-800">0</span> and can
              climb to <span className="font-semibold text-slate-800">100</span>. Only signals from already-verified
              accounts count — which is what makes the system resistant to manipulation.
            </p>
            <div className="space-y-5 max-w-2xl">
              <TrustSignal icon={Plus} tone="up" title="A verified account follows them" effect="Score rises" fill={82} />
              <TrustSignal icon={Minus} tone="down" title="A verified account mutes or reports them" effect="Score falls" fill={28} />
              <TrustSignal icon={Ban} tone="off" title="An unverified account (score 0) acts" effect="Ignored" fill={4} />
            </div>
            <div className="mt-7 rounded-xl bg-[#333286] px-5 py-4" data-testid="callout-spambots">
              <p className="text-[15px] text-white/95 leading-relaxed font-medium">
                So it doesn't matter how many spambots are spun up — a thousand, a million. Without social proof
                from verified accounts, every one of them carries zero weight.
              </p>
            </div>

            {/* Dig deeper */}
            <button
              type="button"
              onClick={() => setShowMechanics((v) => !v)}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#333286] hover:text-[#7c86ff] transition-colors"
              data-testid="button-dig-deeper"
              aria-expanded={showMechanics}
              aria-controls="hsw-mechanics-panel"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showMechanics ? "rotate-180" : ""}`} />
              {showMechanics ? "Hide the details" : "Dig deeper into the mechanics"}
            </button>
            {showMechanics && (
              <div id="hsw-mechanics-panel" className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-5 space-y-3" data-testid="panel-mechanics">
                <p className="text-[14px] text-slate-600 leading-relaxed">
                  Brainstorm harnesses organic signals from your community to distinguish "legitimate" nostr
                  accounts from spam, impersonators, bots, and other bad actors seeking to weasel their way onto
                  the screen in front of your eyes. Currently we rely upon follows, mutes, and reports, processed
                  using a method called{" "}
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
                  to come up with a verification score between 0 and 100.
                </p>
                <p className="text-[14px] text-slate-600 leading-relaxed">
                  When one profile (whose score is above 0) follows another, that profile's score gets a bump up,
                  leveling out at the max score of 100. Mutes and reports push a score down. But have no fear: if
                  an unverified account follows, mutes, or reports someone, that action is completely ignored by
                  virtue of having a verification score of 0.
                </p>
                <p className="text-[14px] text-slate-600 leading-relaxed">
                  Search itself is powered by{" "}
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
                  , a lightning-fast, open-source search engine providing instant, typo-tolerant full-text and
                  hybrid (semantic) search.
                </p>
              </div>
            )}
          </section>

          {/* Powered by */}
          <section data-testid="section-hsw-powered">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.2em] text-slate-400 uppercase">
                Powered by
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {POWERED_BY.map((tech) => (
                <a
                  key={tech.name}
                  href={tech.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 hover:border-[#7c86ff]/40 hover:shadow-sm transition-all"
                  data-testid={`powered-${tech.name.toLowerCase()}`}
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{tech.name}</p>
                    <p className="text-xs text-slate-500">{tech.note}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-300 group-hover:text-[#7c86ff] shrink-0 transition-colors" />
                </a>
              ))}
            </div>
          </section>

          {/* Cross-link */}
          <button
            onClick={() => navigate("/personalization")}
            className="group w-full text-left rounded-2xl border border-slate-200 bg-white hover:border-[#7c86ff]/40 hover:shadow-sm transition-all p-6 flex items-center justify-between gap-4"
            data-testid="link-to-personalization"
          >
            <div>
              <p className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase mb-1.5">
                Keep reading
              </p>
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
