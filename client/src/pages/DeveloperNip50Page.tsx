import { copyToClipboard } from "@/lib/clipboard";
import { env } from "@/lib/runtimeEnv";
import { useLocation } from "wouter";
import { Terminal, Copy, ArrowRight } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { CodeBlock } from "@/components/CodeBlock";
import { BrainLogo } from "@/components/BrainLogo";
import { useToast } from "@/hooks/use-toast";
import { SectionCard, ConnectionIcon, FavoriteChartIcon, OpenSourceSection, DevBackLink } from "@/components/developers/DevShared";

// Per-env public search relay; no in-source fallback (see runtimeEnv).
const RELAY_URL = env.VITE_WOT_SEARCH_RELAY;

const QUICK_START_SNIPPET = `["REQ", "search-1", {
  "kinds": [0],
  "search": "jack"
}]`;

const PERSONALIZED_SNIPPET = `["REQ", "search-1", {
  "kinds": [0],
  "limit": 20,
  "search": "jack observer:<your-pubkey> sort:followers:desc filter:rank:gte:2"
}]`;

const EXTENSIONS: { name: string; format: string; description: string }[] = [
  {
    name: "observer",
    format: "observer:<hex-pubkey>",
    description:
      "The user's pubkey. Results are processed by that user's community. Omit to use the relay's default point of view.",
  },
  {
    name: "sort",
    format: "sort:<metric>:<asc|desc>",
    description: "Sort by a trust metric. Common metrics: followers, rank",
  },
  {
    name: "filter",
    format: "filter:<metric>:<op>:<value>",
    description: "Filter by a trust metric threshold. Operators: gte, lte, gt, lt, eq",
  },
];

export default function DeveloperNip50Page() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const copyRelay = async () => {
    try {
      await copyToClipboard(RELAY_URL);
      toast({ title: "Copied!", description: "Relay URL copied to clipboard" });
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <InfoPageLayout testId="page-developers-nip50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-10 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-dev-header">
            <div className="mb-5"><DevBackLink /></div>
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
                NIP-50 relay search
              </span>
              <div className="h-px w-12 bg-brand-accent/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-dev-title"
            >
              Add Brainstorm Search to <span className="text-brand-deep">your nostr client</span>.
            </h1>
            <p className="mt-5 text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl" data-testid="text-dev-subtitle">
              This relay supports NIP-50 full-text profile search. Any nostr client can query it over a
              standard WebSocket connection.
            </p>
          </header>

          {/* Relay URL */}
          <SectionCard icon={<ConnectionIcon className="h-5 w-5 text-brand-deep" />} title="Relay URL" testId="card-dev-relay">
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3">
              <code className="flex-1 font-mono text-[14px] text-indigo-700 break-all" data-testid="text-relay-url">
                {RELAY_URL}
              </code>
              <button
                type="button"
                onClick={copyRelay}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors shrink-0"
                data-testid="button-copy-relay"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </SectionCard>

          {/* Quick Start */}
          <SectionCard icon={<Terminal className="h-5 w-5 text-brand-deep" />} title="Quick Start" testId="card-dev-quickstart">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Connect via WebSocket and send a standard NIP-50 search REQ:
            </p>
            <CodeBlock code={QUICK_START_SNIPPET} testId="quickstart" />
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              This returns kind 0 profile events filtered and sorted by the community of the relay's default
              nostr profile. All standard nostr traffic (non-search REQs, EVENT publishing) passes through to
              the underlying strfry relay transparently.
            </p>
          </SectionCard>

          {/* Personalized Results */}
          <SectionCard icon={<BrainLogo size={20} className="text-brand-deep" />} title="Personalized Results with WoT Extensions" testId="card-dev-personalized">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Add custom extensions to the search string to get results personalized to a specific user
              (filtered and sorted by that user's community):
            </p>
            <CodeBlock code={PERSONALIZED_SNIPPET} testId="personalized" />

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left border-collapse" data-testid="table-extensions">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">Extension</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">Format</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {EXTENSIONS.map((ext) => (
                    <tr key={ext.name} className="border-t border-slate-100 dark:border-slate-800/60 align-top" data-testid={`row-extension-${ext.name}`}>
                      <td className="px-4 py-3"><code className="font-mono text-[13px] font-semibold text-indigo-600">{ext.name}</code></td>
                      <td className="px-4 py-3"><code className="font-mono text-[13px] text-slate-700 dark:text-slate-200 whitespace-nowrap">{ext.format}</code></td>
                      <td className="px-4 py-3 text-[14px] text-slate-600 dark:text-slate-300 leading-relaxed min-w-[200px]">{ext.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Automatic Score Provisioning */}
          <SectionCard icon={<FavoriteChartIcon className="h-5 w-5 text-brand-deep" />} title="Automatic Score Provisioning" testId="card-dev-provisioning">
            <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
              The first time you search with a new observer, the relay automatically loads that user's
              Brainstorm data in the background if it is available. In the meantime, the search returns
              results using the relay's default perspective. Once loaded, subsequent searches will return
              results that are fully personalized.
            </p>
          </SectionCard>

          {/* Cross-link */}
          <button
            onClick={() => navigate("/how-search-works")}
            className="group w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-accent/40 hover:shadow-sm transition-all p-6 flex items-center justify-between gap-4"
            data-testid="link-to-how-search-works"
          >
            <div>
              <p className="text-[11px] font-mono font-semibold tracking-[0.2em] text-brand-accent uppercase mb-1.5">Keep reading</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Want the bigger picture on how trust ranking works?</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">See How Search Works</p>
            </div>
            <ArrowRight className="h-5 w-5 text-brand-accent shrink-0 group-hover:translate-x-1 transition-transform" />
          </button>

          <OpenSourceSection />
        </div>
      </div>
    </InfoPageLayout>
  );
}
