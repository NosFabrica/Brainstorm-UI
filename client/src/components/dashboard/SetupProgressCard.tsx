import { useLocation } from "wouter";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CalculatingNotice } from "@/components/CalculatingNotice";
import { useFinishSetup } from "@/hooks/useFinishSetup";

/**
 * The dashboard's first-run card: what's left to set up, plus one line of calc
 * status.
 *
 * Runs on the same three-step model as the header banner and the /setup
 * checklist (useFinishSetup: account → follow list → activate), so no two
 * surfaces can disagree about what's left. Pending rows only appear once
 * relays have CONFIRMED the gap — a signer user whose follow list hasn't
 * loaded yet is never nagged. Profile photo and backup left the critical path
 * with the old wizard; they live on in Settings and the backup reminder.
 *
 * Collapses as they go: finish the tasks and the card reduces to just the
 * status line, so the page visibly gets shorter — progress you can feel rather
 * than a progress bar. Renders nothing once scores land.
 */

export function SetupProgressCard({
  queueAhead,
  showStatus = true,
}: {
  queueAhead?: number | null;
  /** False when the calculation has FAILED — promising a time estimate would be a lie. */
  showStatus?: boolean;
}) {
  const [, navigate] = useLocation();
  const { signedIn, followDone, followPending, activateDone, activatePending, doneCount } =
    useFinishSetup();

  const pending: { key: string; label: string; detail: string; href: string }[] = [];
  if (followPending)
    pending.push({
      key: "follow",
      label: "Create your follow list",
      detail: "Your trust scores are built from who you follow.",
      href: "/welcome?next=/setup",
    });
  if (activatePending)
    pending.push({
      key: "activate",
      label: "Activate your Brainstorm account",
      detail: "One signature makes your scores visible to other apps.",
      href: "/setup/activate",
    });

  const noTasks = !signedIn || pending.length === 0;
  // Nothing to say: no tasks left AND the failure alert is carrying the status.
  if (noTasks && !showStatus) return null;
  if (noTasks) return <CalculatingNotice queueAhead={queueAhead} standalone />;

  const done: { key: string; label: string }[] = [{ key: "account", label: "Create your account" }];
  if (followDone) done.push({ key: "follow", label: "Create your follow list" });
  if (activateDone) done.push({ key: "activate", label: "Activate your Brainstorm account" });

  return (
    <Card className="mb-6 rounded-xl border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid="card-setup-progress">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200" style={{ fontFamily: "var(--font-display)" }}>
          Finish setting up
        </span>
        <Chip tone="slate" size="sm" className="ml-auto tabular-nums">
          {doneCount} of 3 done
        </Chip>
      </div>

      <div className="space-y-1.5">
        {pending.map((t, i) => (
          <button
            key={t.key}
            type="button"
            onClick={() => navigate(t.href)}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 text-left transition-colors hover:border-brand-accent/40 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:border-slate-800/80 dark:bg-slate-900/60 dark:hover:bg-slate-800/60"
            data-testid={`setup-task-${t.key}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-400 dark:border-slate-700 dark:text-slate-500">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{t.label}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{t.detail}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        ))}
        {/* Completed tasks stay visible but quiet — seeing what you've already done
            is the reassurance a bare "1 of 3" can't give. */}
        {done.map((t) => (
          <div key={t.key} className="flex items-center gap-3 px-3 py-1.5" data-testid={`setup-task-done-${t.key}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm text-slate-400 line-through dark:text-slate-500">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800/60">
        {followDone ? (
          <CalculatingNotice queueAhead={queueAhead} />
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-setup-no-follows">
            Scores can't be calculated until you follow at least one account.
          </span>
        )}
        <button
          type="button"
          onClick={() => navigate("/setup")}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-link hover:underline"
          data-testid="link-finish-setup"
        >
          Finish Setting Up Your Account
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}
