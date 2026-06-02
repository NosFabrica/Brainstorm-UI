import { useState } from "react";
import { useLocation } from "wouter";
import {
  Plug,
  Terminal,
  Github,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";
import { InfoPageLayout } from "@/components/InfoPageLayout";
import { BrainLogo } from "@/components/BrainLogo";
import { useToast } from "@/hooks/use-toast";

const FavoriteChartIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M13 22.75H9C3.57 22.75 1.25 20.43 1.25 15V9C1.25 3.57 3.57 1.25 9 1.25H15C20.43 1.25 22.75 3.57 22.75 9V13C22.75 13.41 22.41 13.75 22 13.75C21.59 13.75 21.25 13.41 21.25 13V9C21.25 4.39 19.61 2.75 15 2.75H9C4.39 2.75 2.75 4.39 2.75 9V15C2.75 19.61 4.39 21.25 9 21.25H13C13.41 21.25 13.75 21.59 13.75 22C13.75 22.41 13.41 22.75 13 22.75Z" />
    <path d="M7.33009 15.24C7.17009 15.24 7.0101 15.19 6.8701 15.08C6.5401 14.83 6.48012 14.36 6.73012 14.03L9.11009 10.94C9.40009 10.57 9.81011 10.33 10.2801 10.27C10.7501 10.21 11.2101 10.34 11.5801 10.63L13.4101 12.07C13.4801 12.13 13.5501 12.12 13.6001 12.12C13.6401 12.12 13.7101 12.1 13.7701 12.02L16.0801 9.04C16.3301 8.71 16.8001 8.65001 17.1301 8.91001C17.4601 9.16001 17.5201 9.63001 17.2601 9.96001L14.9501 12.94C14.6601 13.31 14.2501 13.55 13.7801 13.6C13.3201 13.66 12.8501 13.53 12.4901 13.24L10.6601 11.8C10.5901 11.74 10.5101 11.74 10.4701 11.75C10.4301 11.75 10.3601 11.77 10.3001 11.85L7.92012 14.94C7.78012 15.14 7.56009 15.24 7.33009 15.24Z" />
    <path d="M20.26 22.7502C19.91 22.7502 19.46 22.6402 18.93 22.3202L18.68 22.1702C18.61 22.1302 18.3999 22.1302 18.3299 22.1702L18.0799 22.3202C16.9299 23.0102 16.2 22.7202 15.88 22.4802C15.55 22.2402 15.04 21.6402 15.34 20.3202L15.39 20.1102C15.41 20.0302 15.3499 19.8402 15.2999 19.7802L14.95 19.4302C14.36 18.8302 14.1299 18.1302 14.3299 17.5002C14.5299 16.8802 15.12 16.4402 15.95 16.3002L16.3299 16.2402C16.3999 16.2202 16.5399 16.1202 16.5799 16.0502L16.8599 15.4802C17.2499 14.6902 17.85 14.2402 18.51 14.2402C19.17 14.2402 19.77 14.6902 20.16 15.4802L20.44 16.0402C20.48 16.1102 20.62 16.2102 20.69 16.2302L21.07 16.2902C21.9 16.4302 22.49 16.8702 22.69 17.4902C22.89 18.1102 22.67 18.8102 22.07 19.4202L21.72 19.7702C21.67 19.8302 21.61 20.0202 21.63 20.1002L21.68 20.3102C21.98 21.6302 21.47 22.2302 21.14 22.4702C20.96 22.6102 20.67 22.7502 20.26 22.7502ZM18.49 15.7502C18.48 15.7602 18.34 15.8602 18.2 16.1502L17.92 16.7202C17.68 17.2102 17.1099 17.6302 16.5799 17.7202L16.2 17.7802C15.88 17.8302 15.77 17.9402 15.76 17.9602C15.76 17.9802 15.79 18.1402 16.02 18.3702L16.37 18.7202C16.78 19.1402 16.9899 19.8602 16.8599 20.4302L16.81 20.6402C16.72 21.0302 16.76 21.2002 16.78 21.2602C16.81 21.2402 16.98 21.2202 17.31 21.0202L17.56 20.8702C18.11 20.5402 18.9 20.5402 19.45 20.8702L19.7 21.0202C20.11 21.2702 20.28 21.2402 20.29 21.2402C20.25 21.2402 20.3 21.0402 20.21 20.6402L20.16 20.4302C20.03 19.8502 20.24 19.1402 20.65 18.7202L21 18.3702C21.23 18.1402 21.26 17.9802 21.26 17.9502C21.25 17.9302 21.14 17.8302 20.82 17.7702L20.44 17.7102C19.9 17.6202 19.34 17.2002 19.1 16.7102L18.82 16.1502C18.66 15.8502 18.52 15.7602 18.49 15.7502Z" />
  </svg>
);

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
    label: "NosFabrica",
    description: "Brainstorm website, relay & personalization service",
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
      className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      data-testid={testId}
    >
      <div className="p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="space-y-10 animate-fade-up">
          {/* Editorial hero */}
          <header className="max-w-3xl" data-testid="section-dev-header">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                For developers
              </span>
              <div className="h-px w-12 bg-[#7c86ff]/40" />
            </div>
            <h1
              className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight leading-[1.08]"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-dev-title"
            >
              Add Brainstorm Search to <span className="text-[#333286]">your nostr client</span>.
            </h1>
            <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-2xl" data-testid="text-dev-subtitle">
              This relay supports NIP-50 full-text profile search. Any nostr client can query it over a
              standard WebSocket connection.
            </p>
          </header>

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
            icon={<BrainLogo size={20} className="text-[#333286]" />}
            title="Personalized Results with WoT Extensions"
            testId="card-dev-personalized"
          >
            <p className="text-[15px] text-slate-600 leading-relaxed">
              Add custom extensions to the search string to get results personalized to a specific user
              (filtered and sorted by that user's community):
            </p>
            <CodeBlock code={PERSONALIZED_SNIPPET} testId="personalized" />

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse" data-testid="table-extensions">
                <thead>
                  <tr className="bg-slate-50">
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
                      className="border-t border-slate-100 align-top"
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
            icon={<FavoriteChartIcon className="h-5 w-5 text-[#333286]" />}
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
                  className="group flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 hover:border-[#7c86ff]/40 hover:shadow-sm transition-all px-4 py-3"
                  data-testid={`link-github-${repo.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center shrink-0">
                      <Github className="h-4.5 w-4.5 text-[#333286]" />
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
            className="group w-full text-left rounded-2xl border border-slate-200 bg-white hover:border-[#7c86ff]/40 hover:shadow-sm transition-all p-6 flex items-center justify-between gap-4"
            data-testid="link-to-how-search-works"
          >
            <div>
              <p className="text-[11px] font-mono font-semibold tracking-[0.2em] text-[#7c86ff] uppercase mb-1.5">Keep reading</p>
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
