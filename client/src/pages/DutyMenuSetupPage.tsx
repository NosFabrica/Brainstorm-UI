import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useAssistantDutyMenu } from "@/hooks/useAssistantDutyMenu";
import { categoryOf, type MenuRow, type MenuStatus } from "@/lib/dutyMenu";
import type { DutyMenuPublishResult } from "@/services/api";

/**
 * /setup/duty-menu — the checklist's "Publish your Assistant's Duty Menu" step
 * as a page, after Tapestry's /assistant/duty-menu: what the server offers for
 * the reader's Brainstorm Assistant beside the menu it has published, and one
 * button that has the server sign and publish it (hooks/useAssistantDutyMenu,
 * docs/assistant/DUTY-MENU-ASK.md). The server decides the rows; this only
 * shows and compares them.
 */

const STATUS_LINE: Record<MenuStatus, string> = {
  current: "Your Assistant's Duty Menu is up to date.",
  missing: "Your Assistant has not published a Duty Menu yet.",
  "out-of-date": "Your Assistant's Duty Menu is out of date: it differs from what your Assistant offers now.",
};

function Rows({ rows, testid }: { rows: MenuRow[]; testid: string }) {
  return (
    <ul className="space-y-1.5" data-testid={testid}>
      {rows.map((r) => (
        <li key={`${r.tag}|${r.key}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-slate-800 dark:text-slate-200">{categoryOf(r.key)}</span>{" "}
          <span className="text-slate-400">·</span>{" "}
          <code className="font-mono text-xs text-slate-700 dark:text-slate-300">{r.key}</code>{" "}
          <span className="text-slate-400">·</span>{" "}
          <span className="min-w-0 break-all font-mono text-xs text-slate-500 dark:text-slate-400">
            {r.tag === "duty" ? r.relay : "not offered"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Report({ result }: { result: DutyMenuPublishResult }) {
  return (
    <ul className="space-y-1 text-xs" data-testid="duty-menu-report">
      {result.relays.map((r) => (
        <li key={r.url} className="flex items-center gap-1.5">
          {r.ok ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Published" />
          ) : (
            <X className="h-3.5 w-3.5 text-red-600" aria-label="Failed" />
          )}
          <span className="break-all font-mono text-slate-600 dark:text-slate-300">{r.url}</span>
          {r.message && <span className="text-slate-500 dark:text-slate-400">— {r.message}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function DutyMenuSetupPage() {
  const [, navigate] = useLocation();
  const user = useActiveAccountDisplay();
  const menu = useAssistantDutyMenu(user?.pubkey);
  const [result, setResult] = useState<DutyMenuPublishResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (!user) return null;

  const publish = async () => {
    setFailure(null);
    try {
      setResult(await menu.publish());
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-page bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <AppHeader
        user={user}
        onLogout={() => {
          logout();
          navigate("/");
        }}
        search={false}
      />

      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
        <button
          type="button"
          onClick={() => navigate("/setup")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-link hover:underline"
          data-testid="duty-menu-back"
        >
          <ArrowLeft className="h-4 w-4" /> Back to setup checklist
        </button>
        <div>
          <SectionHeader kicker="Account setup" className="mb-3" />
          <h1
            className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Duty Menu
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Let other clients, apps and Assistants know which duties your Assistant can take on, and which relay each
            one is published to. Your Assistant&rsquo;s Duty Menu is one item on the shared list of Duty Menus.
          </p>
        </div>

        {menu.supported === false ? (
          <Card className="p-5 text-sm text-slate-600 dark:text-slate-300" data-testid="duty-menu-unavailable">
            Your Brainstorm server can&rsquo;t publish Duty Menus yet.
          </Card>
        ) : menu.error ? (
          <Alert variant="destructive" data-testid="duty-menu-error">
            <AlertDescription>Couldn&rsquo;t reach your Assistant right now. {menu.error.message}</AlertDescription>
          </Alert>
        ) : !menu.supported ? (
          <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Asking your Assistant what it offers…
          </p>
        ) : (
          <>
            <Card className="space-y-3 p-5">
              <div>
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">What your Assistant offers</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Duties this server offers for your Assistant, and the relay where each is published.
                </p>
              </div>
              <Rows rows={menu.offer} testid="duty-menu-offer" />
            </Card>

            <Card className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
                  Your Assistant&rsquo;s published Duty Menu
                </h2>
                {menu.status === "current" && (
                  <Chip tone="success" size="sm" className="uppercase tracking-wide">
                    Done
                  </Chip>
                )}
              </div>
              {menu.published ? (
                <Rows rows={menu.publishedRows} testid="duty-menu-published" />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="duty-menu-published-none">
                  {menu.status === null ? "Checking…" : "No Duty Menu was found for your Assistant."}
                </p>
              )}
              <Button
                size="sm"
                onClick={() => void publish()}
                disabled={menu.publishing || menu.status === null || menu.status === "current"}
                data-testid="duty-menu-publish"
              >
                {menu.publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Have your Assistant publish its Duty Menu
              </Button>
              {result && <Report result={result} />}
              {failure && (
                <Alert variant="destructive">
                  <AlertDescription>{failure}</AlertDescription>
                </Alert>
              )}
            </Card>

            {menu.status && (
              <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="duty-menu-status">
                {STATUS_LINE[menu.status]}
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your Assistant&rsquo;s Duty Menu is public. Anyone can find it, and list it among every Assistant&rsquo;s
              Duty Menu.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
