import { useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, ArrowRight, X } from "lucide-react";
import { getCurrentUser, hasPersistentKey } from "@/services/nostr";

// Re-surface roughly every couple of days until backed up — present, not naggy.
const SNOOZE_MS = 2.5 * 24 * 3600_000;

/**
 * A focused, recurring nudge to back up an in-app account that hasn't been backed
 * up yet. Losing the browser loses the account permanently, so unlike the rest of
 * the post-signup checklist this can't be a one-time, dismiss-forever item.
 *
 * It only takes over AFTER the post-signup card is dismissed (so it never doubles
 * up with the card, which already offers backup), and only for in-app accounts
 * (extension/nsec users hold their key elsewhere). Dismissing snoozes it for a
 * couple of days rather than hiding it forever.
 */
export function BackupReminder() {
  const [, navigate] = useLocation();
  const [hidden, setHidden] = useState(false);
  const user = getCurrentUser();
  const pubkey = user?.pubkey || "";

  if (!pubkey || !hasPersistentKey() || hidden) return null;

  let show = false;
  try {
    const backedUp = localStorage.getItem(`brainstorm_backup_done:${pubkey}`) === "true";
    const cardDismissed = localStorage.getItem(`brainstorm_postsignup_dismissed:${pubkey}`) === "true";
    const remindedAt = Number(localStorage.getItem(`brainstorm_backup_reminded_at:${pubkey}`) || 0);
    const snoozed = remindedAt > 0 && Date.now() - remindedAt < SNOOZE_MS;
    show = !backedUp && cardDismissed && !snoozed;
  } catch {
    show = false;
  }
  if (!show) return null;

  const snooze = () => {
    try { localStorage.setItem(`brainstorm_backup_reminded_at:${pubkey}`, String(Date.now())); } catch {}
    setHidden(true);
  };

  return (
    // One row on desktop, stacked on a phone. As a single row at 375px the icon,
    // the CTA and the dismiss ate everything, leaving the copy about 100px wide —
    // "Back up your account" broke across three lines and the sentence below it
    // ran as a narrow ribbon. Same fix the invite banner needed: stack under
    // `sm`, give the CTA the full width, and float the dismiss to the corner so
    // it doesn't take a column of its own.
    <div
      className="relative w-full max-w-3xl mx-auto mt-4 flex flex-col gap-3 rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.03] to-brand-accent/[0.06] shadow-[0_0_15px_rgb(var(--brand-accent)/0.07)] px-4 py-3 pr-10 sm:flex-row sm:items-center sm:pr-4"
      data-testid="backup-reminder"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="h-9 w-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-deep shrink-0">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Back up your account</p>
          <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-snug">It's the only way to recover it if you lose this browser — there's no reset.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate("/settings?tab=profile&focus=backup")}
        className="w-full shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold px-3.5 py-2 transition-colors sm:w-auto"
        data-testid="backup-reminder-cta"
      >
        Back up now <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={snooze}
        aria-label="Remind me later"
        className="absolute right-2 top-2 shrink-0 rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-brand-accent/10 transition-colors sm:static sm:right-auto sm:top-auto"
        data-testid="backup-reminder-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
