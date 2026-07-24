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
    <div
      className="w-full max-w-3xl mx-auto mt-4 flex items-center gap-3 rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.03] to-brand-accent/[0.06] shadow-[0_0_15px_rgb(var(--brand-accent)/0.07)] px-4 py-3"
      data-testid="backup-reminder"
    >
      <span className="h-9 w-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-deep shrink-0">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">Back up your account</p>
        <p className="text-[13px] text-slate-600 leading-snug">It's the only way to recover it if you lose this browser — there's no reset.</p>
      </div>
      <button
        type="button"
        onClick={() => navigate("/settings?tab=profile&focus=backup")}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold px-3.5 py-2 transition-colors"
        data-testid="backup-reminder-cta"
      >
        Back up now <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={snooze}
        aria-label="Remind me later"
        className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-brand-accent/10 transition-colors"
        data-testid="backup-reminder-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
