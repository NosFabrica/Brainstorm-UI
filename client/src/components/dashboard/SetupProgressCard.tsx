import { useLocation } from "wouter";
import { Check, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CalculatingNotice } from "@/components/CalculatingNotice";
import { useSetupTasks, type SetupTaskKey } from "@/hooks/useSetupTasks";

/**
 * The dashboard's first-run card: what's left to set up, plus one line of calc
 * status.
 *
 * Replaces a ~430-line dark marketing hero (a rotating ONBOARDING_SLIDES carousel
 * over a two-phase CALCULATING/PUBLISHING stepper) that filled the fold while
 * saying nothing actionable. A new user's first few minutes are spent waiting
 * for scores, so this spends that time on the setup they still owe instead.
 *
 * Collapses as they go: finish the tasks and the card reduces to just the status
 * line, so the page visibly gets shorter — progress you can feel rather than a
 * progress bar. Renders nothing once scores land.
 */

/** Where each task is actually completed — all existing, purpose-built surfaces. */
const TASK_HREF: Record<SetupTaskKey, string> = {
  network: "/welcome",
  backup: "/settings?focus=backup",
  photo: "/settings?tab=profile",
};

export function SetupProgressCard({
  queueAhead,
  showStatus = true,
}: {
  queueAhead?: number | null;
  /** False when the calculation has FAILED — promising a time estimate would be a lie. */
  showStatus?: boolean;
}) {
  const [, navigate] = useLocation();
  const { tasks, remaining, doneCount, eligible } = useSetupTasks();

  // Returning users who signed in with their own key already own their profile and
  // backup — offering them a setup checklist would be both wrong and alarming.
  const noTasks = !eligible || remaining.length === 0;
  // Nothing to say: no tasks left AND the failure alert is carrying the status.
  if (noTasks && !showStatus) return null;
  if (noTasks) return <CalculatingNotice queueAhead={queueAhead} standalone />;

  return (
    <Card className="mb-6 rounded-xl border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid="card-setup-progress">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200" style={{ fontFamily: "var(--font-display)" }}>
          Finish setting up
        </span>
        <Chip tone="slate" size="sm" className="ml-auto tabular-nums">
          {doneCount} of {tasks.length} done
        </Chip>
      </div>

      <div className="space-y-1.5">
        {remaining.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => navigate(TASK_HREF[t.key])}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 text-left transition-colors hover:border-brand-accent/40 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:border-slate-800/80 dark:bg-slate-900/60 dark:hover:bg-slate-800/60"
            data-testid={`setup-task-${t.key}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-400 dark:border-slate-700 dark:text-slate-500">
              {remaining.indexOf(t) + 1}
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
        {tasks.filter((t) => t.done).map((t) => (
          <div key={t.key} className="flex items-center gap-3 px-3 py-1.5" data-testid={`setup-task-done-${t.key}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm text-slate-400 line-through dark:text-slate-500">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800/60">
        <CalculatingNotice queueAhead={queueAhead} />
      </div>
    </Card>
  );
}
