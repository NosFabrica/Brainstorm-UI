export function ActivityStatusBadge({ value, warning = false }: { value: string | null; warning?: boolean }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const lower = value.toLowerCase();
  const failed = lower === "failure" || lower === "failed" || lower === "error";
  if (failed && warning) value = "warning";
  const colors =
    lower === "success" || lower === "done" || lower === "published"
      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/25"
      : failed && warning
        ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25"
        : failed
          ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/25"
          : lower === "pending" || lower === "queued" || lower === "in_progress"
            ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25"
            : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${colors}`}
      data-testid="badge-activity-status"
    >
      {value}
    </span>
  );
}

// Origin of a run: why it was queued (manual = user asked, scheduled = tier
// auto-scheduler, admin = admin action, periodic = cron). Colored distinctly
// from the status badges so origin reads at a glance.
export function TriggerSourceBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const lower = value.toLowerCase();
  const colors =
    lower === "scheduled"
      ? "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/20 dark:border-brand-primary/25"
      : lower === "periodic"
        ? "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/25"
        : lower === "admin"
          ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25"
          : lower === "manual"
            ? "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800"
            : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize ${colors}`}
      data-testid="badge-trigger-source"
    >
      {value}
    </span>
  );
}
