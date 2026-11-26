import { Link } from "wouter";
import { X } from "lucide-react";

/** New-account safety + discovery nudge (in-app accounts, not backed up): save a backup, explore. */
export function EventSetupNudge({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5"
      data-testid="event-setup-nudge"
    >
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="font-semibold text-slate-900 dark:text-slate-100">You're in.</span>{" "}
        <Link href="/settings?tab=profile&focus=backup" className="font-semibold text-brand-link hover:underline">
          Save a backup
        </Link>
        <span className="text-slate-600 dark:text-slate-300"> so you never lose this account · </span>
        <Link href="/" className="font-semibold text-brand-link hover:underline">
          Explore Brainstorm →
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-amber-100 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
        data-testid="event-setup-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
