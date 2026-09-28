import { copyToClipboard } from "@/lib/clipboard";
import { env } from "@/lib/runtimeEnv";
import { useLocation } from "wouter";
import { Terminal, Copy, ArrowRight } from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { CodeBlock } from "@/components/CodeBlock";
import { BrainLogo } from "@/components/BrainLogo";
import { useToast } from "@/hooks/use-toast";
import {
  SectionCard,
  ConnectionIcon,
  FavoriteChartIcon,
  OpenSourceSection,
  DevBackLink,
} from "@/components/developers/DevShared";

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
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="animate-fade-up space-y-10">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-dev-header">
            <div className="mb-5">
              <DevBackLink />
            </div>
            <div className="mb-5 flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-accent">
                NIP-50 relay search
              </span>
              <div className="h-px w-12 bg-brand-accent/40" />
            </div>
            <h1
              className="text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-dev-title"
            >
              Add Brainstorm Search to <span className="text-brand-link">your nostr client</span>.
            </h1>
            <p
              className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="text-dev-subtitle"
            >
              This relay supports NIP-50 full-text profile search. Any nostr client can query it over a standard
              WebSocket connection.
            </p>
          </header>

          {/* Relay URL */}
          <SectionCard
            icon={<ConnectionIcon className="h-5 w-5 text-brand-deep" />}
            title="Relay URL"
            testId="card-dev-relay"
          >
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <code className="flex-1 break-all font-mono text-[14px] text-brand-primary" data-testid="text-relay-url">
                {RELAY_URL}
              </code>
              <button
                type="button"
                onClick={copyRelay}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                data-testid="button-copy-relay"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </SectionCard>

          {/* Quick Start */}
          <SectionCard
            icon={<Terminal className="h-5 w-5 text-brand-deep" />}
            title="Quick Start"
            testId="card-dev-quickstart"
          >
            <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
              Connect via WebSocket and send a standard NIP-50 search REQ:
            </p>
            <CodeBlock code={QUICK_START_SNIPPET} testId="quickstart" />
            <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
              This returns kind 0 profile events filtered and sorted by the community of the relay's default nostr
              profile. All standard nostr traffic (non-search REQs, EVENT publishing) passes through to the underlying
              strfry relay transparently.
            </p>
          </SectionCard>

          {/* Personalized Results */}
          <SectionCard
            icon={<BrainLogo size={20} className="text-brand-deep" />}
            title="Personalized Results with WoT Extensions"
            testId="card-dev-personalized"
          >
            <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
              Add custom extensions to the search string to get results personalized to a specific user (filtered and
              sorted by that user's community):
            </p>
            <CodeBlock code={PERSONALIZED_SNIPPET} testId="personalized" />

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full border-collapse text-left" data-testid="table-extensions">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900">
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
                      Extension
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
                      Format
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {EXTENSIONS.map((ext) => (
                    <tr
                      key={ext.name}
                      className="border-t border-slate-100 align-top dark:border-slate-800/60"
                      data-testid={`row-extension-${ext.name}`}
                    >
                      <td className="px-4 py-3">
                        <code className="font-mono text-[13px] font-semibold text-brand-primary">{ext.name}</code>
                      </td>
                      <td className="px-4 py-3">
                        <code className="whitespace-nowrap font-mono text-[13px] text-slate-700 dark:text-slate-200">
                          {ext.format}
                        </code>
                      </td>
                      <td className="min-w-[200px] px-4 py-3 text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
                        {ext.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Automatic Score Provisioning */}
          <SectionCard
            icon={<FavoriteChartIcon className="h-5 w-5 text-brand-deep" />}
            title="Automatic Score Provisioning"
            testId="card-dev-provisioning"
          >
            <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
              The first time you search with a new observer, the relay automatically loads that user's Brainstorm data
              in the background if it is available. In the meantime, the search returns results using the relay's
              default perspective. Once loaded, subsequent searches will return results that are fully personalized.
            </p>
          </SectionCard>

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
                Want the bigger picture on how trust ranking works?
              </p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">See How Search Works</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-brand-accent transition-transform group-hover:translate-x-1" />
          </button>

          <OpenSourceSection />
        </div>
      </div>
    </InfoPageLayout>
  );
}
