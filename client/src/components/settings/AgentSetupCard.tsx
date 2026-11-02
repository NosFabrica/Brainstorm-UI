/**
 * Set up an agent to run your own Brainstorm, or to add its scores to your
 * client: two prompts a reader copies into an AI agent. Developer material,
 * so it lives on /developers (it was Settings › About until 2026-11-02).
 */
import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, Copy } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { publicOrigin } from "@/lib/publicOrigin";

// Agent prompts. Every step names something that exists today: the README's
// Develop and Configuration sections, the brainstorm_server repo, the protocols
// spec, and this deployment's /developers pages.
const SELFHOST_PROMPT = `You're helping me run my own copy of Brainstorm, an open-source
web-of-trust search engine for Nostr. The UI is one part of a stack:
it needs a running brainstorm_server API and Nostr relays behind it.

1. Clone the UI: https://github.com/NosFabrica/Brainstorm-UI
2. Follow the README's "Develop" section (nvm use, npm ci, npm run dev).
3. Read the README's "Configuration" section: six VITE_* variables name
   the API and relays the UI talks to. Set VITE_API_URL to a
   brainstorm_server you run: https://github.com/NosFabrica/brainstorm_server
4. Open the app, let me sign in, and confirm search returns results.

Explain each step as you go and tell me what to fix if a step fails.
Keep it simple.`;

const integratePrompt = (origin: string) => `You're helping me add Brainstorm's web-of-trust scores to my own
Nostr client so my users see personalized trust.

1. Read the developer pages:
   ${origin}/developers/nip-50
   ${origin}/developers/open-ranking
   ${origin}/developers/trusted-assertions
2. Read the wire spec for kind 30382 "Trusted Assertions" (NIP-85) and
   the kind 10040 pointer that names a user's trust provider:
   https://github.com/NosFabrica/protocols/blob/main/specs/trusted-assertions.md
3. Fetch personalized scores over NIP-50 search or the Open Ranking API.
4. Resolve each user's provider from their kind 10040 before reading
   their kind 30382 assertions.
5. Verify a sample user's Brainstorm Verification Score renders in my client.

Explain each step, note anything I need to configure, and keep it simple.`;

export function AgentSetupCard() {
  const { toast } = useToast();
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const [agentPath, setAgentPath] = useState<"selfhost" | "integrate">("selfhost");
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="section-agent-setup"
    >
      {" "}
      <button
        type="button"
        onClick={() => setAgentSetupOpen((v) => !v)}
        aria-expanded={agentSetupOpen}
        className={`flex w-full items-center justify-between gap-3 bg-slate-50 px-5 py-4 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:bg-slate-900 dark:hover:bg-slate-800 ${agentSetupOpen ? "border-b border-slate-200 dark:border-slate-800" : ""}`}
        data-testid="button-agent-setup-toggle"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-brand-deep" aria-hidden="true">
              <path
                d="M13.16 12.88V17.42"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.3 17.42L8.09 12.88L5.88 17.42"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.43 16.38H9.76"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22.14 9.96999V15.04C22.14 20.11 20.11 22.14 15.04 22.14H8.96C3.89 22.14 1.86 20.11 1.86 15.04V8.95999C1.86 3.88999 3.89 1.85999 8.96 1.85999H14.03"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22.14 9.96999H18.08C15.04 9.96999 14.02 8.95999 14.02 5.90999V1.85999L22.13 9.96999H22.14Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-agent-setup-title"
              >
                Set up with your AI agent
              </h2>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-brand-accent/20 bg-brand-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-deep"
                data-testid="badge-agent-preview"
              >
                <span className="h-1 w-1 rounded-full bg-brand-accent" /> Preview · coming soon
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-agent-setup-subtitle">
              Let an AI agent run Brainstorm for you — or wire it into your own client
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${agentSetupOpen ? "rotate-180" : ""}`}
        />
      </button>
      {agentSetupOpen && (
        <div className="space-y-4 p-5">
          {/* Path toggle */}
          <div
            className="border-brand-accent/12 inline-flex rounded-full border bg-white/70 p-1 shadow-sm backdrop-blur-sm dark:bg-slate-900/70"
            data-testid="agent-path-toggle"
          >
            {[
              { key: "selfhost" as const, label: "Self-host" },
              { key: "integrate" as const, label: "Integrate into your client" },
            ].map((opt) => {
              const active = agentPath === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setAgentPath(opt.key)}
                  aria-current={active ? "true" : undefined}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 sm:text-sm ${
                    active
                      ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/[0.3]"
                      : "text-slate-500 hover:text-brand-deep dark:text-slate-400"
                  }`}
                  data-testid={`agent-path-${opt.key}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300" data-testid="text-agent-setup-desc">
            {agentPath === "selfhost"
              ? "Brainstorm is open-source. Instead of following technical steps yourself, hand them to your AI agent — copy the prompt below, or point your agent at our guide."
              : "Already run a Nostr client? Have your AI agent connect Brainstorm's web-of-trust scores and Trusted Assertions (NIP-85) so your users see personalized trust."}
          </p>

          {/* The prompt to paste into the agent */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Copy this prompt into your agent
            </p>
            <CodeBlock
              code={agentPath === "selfhost" ? SELFHOST_PROMPT : integratePrompt(publicOrigin())}
              testId={`agent-prompt-${agentPath}`}
            />
          </div>

          {/* Point the agent at the guide */}
          <div className="flex flex-col gap-2 rounded-xl border border-brand-accent/15 bg-white/70 px-3.5 py-3 dark:bg-slate-900/70 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Or point your agent here
              </p>
              <p className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">{`${publicOrigin()}/developers`}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const url = `${publicOrigin()}/developers`;
                  copyToClipboard(url);
                  toast({ title: "Copied!", description: "Guide link copied to clipboard" });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                data-testid="button-agent-copy-guide"
              >
                <Copy className="h-3.5 w-3.5" /> Copy link
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-agent-footer">
            Works with Claude, ChatGPT, or any capable agent. Want early access or to help shape this?{" "}
            <a
              href={`mailto:support@nosfabrica.com?subject=${agentPath === "integrate" ? "NIP-85%20Client%20Integration" : "Brainstorm%20Agent%20Setup"}`}
              className="font-semibold text-brand-deep transition-colors hover:text-brand-accent"
              data-testid="link-agent-contact"
            >
              Get in touch
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
