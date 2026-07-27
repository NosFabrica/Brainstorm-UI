import { env } from "@/lib/runtimeEnv";
import { Compass, BarChart3, Search, Settings2, BookOpen } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { CodeBlock } from "@/components/CodeBlock";
import { SectionCard, OpenSourceSection, DevBackLink } from "@/components/developers/DevShared";

// Configurable Open Ranking (ORE) base — the HTTP origin that serves this
// instance's ranking endpoints. Driven by config so it points at OUR deployment.
// NOTE (confirm with the team): this documents live endpoints
// (/.well-known/open-ranking.json, /stats/pubkey, /search/pubkeys). If our
// instance doesn't serve ORE yet, this page is accurate-but-aspirational until it does.
const ORE_BASE = (env.VITE_API_URL || "https://your-brainstorm-instance").replace(/\/+$/, "");

const STATS_CURL = `curl -s -X POST ${ORE_BASE}/stats/pubkey \\
  -H 'Content-Type: application/json' \\
  -d '{"pubkey":"<64-hex-pubkey>"}'`;

const STATS_RESPONSE = `{
  "pubkey": "<64-hex-pubkey>",
  "rank": 93,
  "hops": 1,
  "followers": 19470,
  "muters": 72,
  "reporters": 6,
  "follows": 1669,
  "mutes": 0,
  "reporting": 23,
  "pagerank": 0.0114
}`;

const SEARCH_CURL = `curl -s -X POST ${ORE_BASE}/search/pubkeys \\
  -H 'Content-Type: application/json' \\
  -d '{"query":"jack","limit":20}'`;

const SEARCH_RESPONSE = `{
  "results": [
    { "pubkey": "<hex>", "rank": 100 },
    { "pubkey": "<hex>", "rank": 98 }
  ]
}`;

const STATS_FIELDS: { field: string; meaning: string }[] = [
  { field: "rank", meaning: "GrapeRank web-of-trust rank (GrapeRank influence ×100)." },
  { field: "hops", meaning: "Degrees of separation along the follow graph from the point of view (999 = unreachable)." },
  { field: "followers / muters / reporters", meaning: "Verified inbound counts — accounts following / muting / reporting this pubkey whose own web-of-trust rank clears the verification cutoff." },
  { field: "follows / mutes / reporting", meaning: "Exact outbound totals — accounts this pubkey follows / mutes / has reported." },
  { field: "pagerank", meaning: "Raw personalized-PageRank score under the active point of view." },
];

export default function DeveloperOpenRankingPage() {
  return (
    <InfoPageLayout testId="page-developers-open-ranking">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-10 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl">
            <div className="mb-5"><DevBackLink /></div>
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
                Open Ranking (ORE)
              </span>
              <div className="h-px w-12 bg-brand-accent/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              The web of trust over <span className="text-brand-link">plain HTTP</span>.
            </h1>
            <p className="mt-5 text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              This instance is an Open Ranking provider — a plain HTTP/JSON interface to its web of trust. Any
              HTTP client can discover its capabilities and query web-of-trust ranking, per-pubkey stats, and
              profile search without speaking the nostr relay protocol. It complements the NIP-50 relay over
              the same underlying data.
            </p>
          </header>

          {/* 1. Discover capabilities */}
          <SectionCard icon={<Compass className="h-5 w-5 text-brand-deep" />} title="1 · Discover capabilities" testId="card-ore-discover">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Fetch the capability document (<code className="font-mono text-[13px] text-indigo-600">GET</code>) to see which
              endpoints and algorithms this provider offers:
            </p>
            <CodeBlock code={`${ORE_BASE}/.well-known/open-ranking.json`} testId="ore-well-known" />
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              It returns a JSON object keyed by endpoint path; each value lists the available algorithms. The
              first algorithm in a list is that endpoint's default; an algorithm with{" "}
              <code className="font-mono text-[13px] text-indigo-600">"pov": true</code> requires a point-of-view pubkey in the request.
            </p>
          </SectionCard>

          {/* 2. Stats */}
          <SectionCard icon={<BarChart3 className="h-5 w-5 text-brand-deep" />} title="2 · Web-of-trust stats" testId="card-ore-stats">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              <code className="font-mono text-[13px] font-semibold text-indigo-600">POST /stats/pubkey</code> — returns this
              instance's web-of-trust metrics for one pubkey. Algorithms:{" "}
              <code className="font-mono text-[13px] text-slate-700 dark:text-slate-200">graperank</code> (global, the default) and{" "}
              <code className="font-mono text-[13px] text-slate-700 dark:text-slate-200">graperank-personalized</code> (requires a provisioned
              pov; an unprovisioned one returns 422).
            </p>
            <CodeBlock code={STATS_CURL} testId="ore-stats-curl" />
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">Response:</p>
            <CodeBlock code={STATS_RESPONSE} testId="ore-stats-response" />
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">Field</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {STATS_FIELDS.map((f) => (
                    <tr key={f.field} className="border-t border-slate-100 dark:border-slate-800/60 align-top">
                      <td className="px-4 py-3"><code className="font-mono text-[13px] font-semibold text-indigo-600 whitespace-nowrap">{f.field}</code></td>
                      <td className="px-4 py-3 text-[14px] text-slate-600 dark:text-slate-300 leading-relaxed min-w-[220px]">{f.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* 3. Search */}
          <SectionCard icon={<Search className="h-5 w-5 text-brand-deep" />} title="3 · Profile search" testId="card-ore-search">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              <code className="font-mono text-[13px] font-semibold text-indigo-600">POST /search/pubkeys</code> — free-text
              profile search, returning pubkeys ranked by this instance's global GrapeRank, highest first.
            </p>
            <CodeBlock code={SEARCH_CURL} testId="ore-search-curl" />
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">Response:</p>
            <CodeBlock code={SEARCH_RESPONSE} testId="ore-search-response" />
          </SectionCard>

          {/* Conventions */}
          <SectionCard icon={<Settings2 className="h-5 w-5 text-brand-deep" />} title="Conventions" testId="card-ore-conventions">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              All endpoints are JSON over HTTP with{" "}
              <code className="font-mono text-[13px] text-slate-700 dark:text-slate-200">Access-Control-Allow-Origin: *</code>. Pubkeys are
              64-character lowercase hex. Errors are signalled by HTTP status —{" "}
              <code className="font-mono text-[13px] text-slate-700 dark:text-slate-200">400</code> (malformed JSON),{" "}
              <code className="font-mono text-[13px] text-slate-700 dark:text-slate-200">422</code> (invalid input / unsupported algorithm /
              missing or unprovisioned pov) — with a human-readable{" "}
              <code className="font-mono text-[13px] text-slate-700 dark:text-slate-200">X-Reason</code> header.
            </p>
          </SectionCard>

          {/* Reference */}
          <SectionCard icon={<BookOpen className="h-5 w-5 text-brand-deep" />} title="Reference" testId="card-ore-reference">
            <ul className="space-y-2 text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed list-disc pl-5">
              <li>
                Open Ranking protocol spec — <span className="font-mono text-[13px]">ORE-01</span> (discovery),{" "}
                <span className="font-mono text-[13px]">ORE-02</span> (stats),{" "}
                <span className="font-mono text-[13px]">ORE-05</span> (search)
              </li>
              <li>Brainstorm Search repo — this provider's implementation</li>
            </ul>
          </SectionCard>

          <OpenSourceSection />
        </div>
      </div>
    </InfoPageLayout>
  );
}
