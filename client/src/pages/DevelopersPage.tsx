import { useState } from "react";
import { useLocation } from "wouter";
import {
  Plug,
  Terminal,
  Sparkles,
  Zap,
  Github,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { useToast } from "@/hooks/use-toast";

const RELAY_URL = "wss://brainstorm.world/relay";

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

const GITHUB_REPOS: { label: string; description: string; href: string }[] = [
  {
    label: "Brainstorm Search",
    description: "This website + relay",
    href: "https://github.com/NosFabrica",
  },
  {
    label: "NosFabrica",
    description: "Personalization service",
    href: "https://github.com/NosFabrica",
  },
];

function CodeBlock({ code, testId }: { code: string; testId: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="relative group/code rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onCopy}
        className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 shadow-sm transition-colors"
        data-testid={`button-copy-${testId}`}
        aria-label="Copy code"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="overflow-x-auto p-4 pr-20 text-[13px] leading-relaxed" data-testid={`code-${testId}`}>
        <code className="font-mono text-slate-800 whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  children,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden"
      data-testid={testId}
    >
      <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
      <div className="p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <h2
            className="text-xl font-bold text-slate-900 tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h2>
        </div>
        {children}
      </div>
    </section>
  );
}

export default function DevelopersPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const copyRelay = async () => {
    try {
      await navigator.clipboard.writeText(RELAY_URL);
      toast({ title: "Copied!", description: "Relay URL copied to clipboard" });
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <InfoPageLayout testId="page-developers">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="space-y-8 animate-fade-up">
          {/* Header */}
          <div className="space-y-3" data-testid="section-dev-header">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/70 border border-[#7c86ff]/12 shadow-sm backdrop-blur-sm w-fit">
              <div className="w-1 h-1 rounded-full bg-[#7c86ff] shadow-[0_0_4px_#7c86ff]" />
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#333286] uppercase">For developers</p>
            </div>
            <h1
              className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-dev-title"
            >
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#333286] via-[#7c86ff] to-[#333286] bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block pb-1">
                Add Brainstorm Search to Your Nostr Client
              </span>
            </h1>
            <p className="text-slate-600 font-medium max-w-2xl" data-testid="text-dev-subtitle">
              This relay supports NIP-50 full-text profile search. Any nostr client can query it over a
              standard WebSocket connection.
            </p>
          </div>

          {/* Relay URL */}
          <SectionCard
            icon={<Plug className="h-5 w-5 text-[#333286]" />}
            title="Relay URL"
            testId="card-dev-relay"
          >
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <code className="flex-1 font-mono text-[14px] text-indigo-700 break-all" data-testid="text-relay-url">
                {RELAY_URL}
              </code>
              <button
                type="button"
                onClick={copyRelay}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 shadow-sm transition-colors shrink-0"
                data-testid="button-copy-relay"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
          </SectionCard>

          {/* Quick Start */}
          <SectionCard
            icon={<Terminal className="h-5 w-5 text-[#333286]" />}
            title="Quick Start"
            testId="card-dev-quickstart"
          >
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Connect via WebSocket and send a standard NIP-50 search REQ:
            </p>
            <CodeBlock code={QUICK_START_SNIPPET} testId="quickstart" />
            <p className="text-[15px] text-slate-600 leading-relaxed">
              This returns kind 0 profile events filtered and sorted by the community of the relay's default
              nostr profile. All standard nostr traffic (non-search REQs, EVENT publishing) passes through to
              the underlying strfry relay transparently.
            </p>
          </SectionCard>

          {/* Personalized Results */}
          <SectionCard
            icon={<Sparkles className="h-5 w-5 text-[#333286]" />}
            title="Personalized Results with WoT Extensions"
            testId="card-dev-personalized"
          >
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Add custom extensions to the search string to get results personalized to a specific user
              (filtered and sorted by that user's community):
            </p>
            <CodeBlock code={PERSONALIZED_SNIPPET} testId="personalized" />

            <div className="overflow-x-auto rounded-xl border border-[#7c86ff]/20">
              <table className="w-full text-left border-collapse" data-testid="table-extensions">
                <thead>
                  <tr className="bg-[#7c86ff]/8">
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#333286]">
                      Extension
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#333286]">
                      Format
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#333286]">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {EXTENSIONS.map((ext) => (
                    <tr
                      key={ext.name}
                      className="border-t border-[#7c86ff]/12 align-top"
                      data-testid={`row-extension-${ext.name}`}
                    >
                      <td className="px-4 py-3">
                        <code className="font-mono text-[13px] font-semibold text-indigo-600">{ext.name}</code>
                      </td>
                      <td className="px-4 py-3">
                        <code className="font-mono text-[13px] text-slate-700 whitespace-nowrap">
                          {ext.format}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-[14px] text-slate-600 leading-relaxed min-w-[200px]">
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
            icon={<Zap className="h-5 w-5 text-[#333286]" />}
            title="Automatic Score Provisioning"
            testId="card-dev-provisioning"
          >
            <p className="text-[15px] text-slate-600 leading-relaxed">
              The first time you search with a new observer, the relay automatically loads that user's
              Brainstorm data in the background if it is available. In the meantime, the search returns
              results using the relay's default perspective. Once loaded, subsequent searches will return
              results that are fully personalized.
            </p>
          </SectionCard>

          {/* Open-source */}
          <SectionCard
            icon={<Github className="h-5 w-5 text-[#333286]" />}
            title="Open-source"
            testId="card-dev-opensource"
          >
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Brainstorm is built in the open. Explore the code, file issues, or contribute:
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {GITHUB_REPOS.map((repo) => (
                <a
                  key={repo.label}
                  href={repo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 rounded-xl bg-white/80 border border-[#7c86ff]/20 hover:border-[#7c86ff]/40 hover:shadow-[0_4px_20px_rgba(124,134,255,0.12)] transition-all px-4 py-3"
                  data-testid={`link-github-${repo.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-slate-950 flex items-center justify-center shrink-0">
                      <Github className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{repo.label}</p>
                      <p className="text-xs text-slate-500">{repo.description}</p>
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-[#7c86ff] shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </a>
              ))}
            </div>
          </SectionCard>

          {/* Cross-link */}
          <button
            onClick={() => navigate("/how-search-works")}
            className="group w-full text-left rounded-2xl bg-white/80 backdrop-blur-xl border border-[#7c86ff]/20 hover:border-[#7c86ff]/40 hover:shadow-[0_4px_20px_rgba(124,134,255,0.12)] transition-all p-5 sm:p-6 flex items-center justify-between gap-4"
            data-testid="link-to-how-search-works"
          >
            <div>
              <p className="text-xs font-bold tracking-wide text-[#7c86ff] uppercase mb-1">Keep reading</p>
              <p className="text-base font-semibold text-slate-900">
                Want the bigger picture on how trust ranking works?
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
