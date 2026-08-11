import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useActiveAccount } from "applesauce-react/hooks";

import { getMetadata, updateMetadata, type BrainstormAccount } from "@/accounts/metadata";
import { BACKUP_MESSAGE, BackupPrompt } from "@/components/BackupPrompt";
import { useBackupNeed } from "@/hooks/useBackupNeed";
import { useSetupTasks } from "@/hooks/useSetupTasks";
import { usePostSignupDismissed } from "@/lib/postSignupDismissal";

// Re-surface roughly every couple of days until backed up — present, not naggy.
const SNOOZE_MS = 2.5 * 24 * 3600_000;

/**
 * The last surface in the backup chain, and the load-bearing one: the wizard's
 * backup step is its final step, so anyone who abandoned onboarding has only this
 * and the post-signup card standing between them and an unrecoverable account.
 *
 * What it asks is whatever the Account is missing next — a Recovery password for
 * a migrated key, the download for one that already has a Backup — and who it
 * asks is decided by that same state, so extension and remote-signer Accounts
 * (nothing to back up) and pasted keys (their owner holds them) never see it.
 *
 * It waits for the post-signup card, which offers the same thing, and dismissing
 * it **snoozes** rather than silences: losing the browser loses the account, so
 * unlike the rest of the checklist this can't be dismissed forever.
 */
export function BackupReminder() {
  const account = useActiveAccount() as BrainstormAccount | undefined;
  const need = useBackupNeed();
  const setup = useSetupTasks();
  const cardDismissed = usePostSignupDismissed(account?.pubkey);
  const [hidden, setHidden] = useState(false);
  const [delivered, setDelivered] = useState(false);

  // The post-signup card is already offering this — two nudges for one thing is
  // worse than none. Dismissing that card hands the strip straight over, which is
  // why its dismissal is a store and not state inside it.
  const cardOffering = setup.eligible && !setup.allDone && !cardDismissed;

  const remindedAt = account ? (getMetadata(account).backupRemindedAt ?? 0) : 0;
  const snoozed = remindedAt > 0 && Date.now() - remindedAt < SNOOZE_MS;

  if (hidden || cardOffering) return null;
  // `need` goes to null the moment the file is handed over, and the card stays
  // put anyway: a phone loses downloads, so the offer to take it again outlives
  // the reason the card appeared.
  if (!need && !delivered) return null;
  if (snoozed && !delivered) return null;

  const snooze = () => {
    if (account) updateMetadata(account, { backupRemindedAt: Date.now() });
    setHidden(true);
  };

  const message = need ? BACKUP_MESSAGE[need] : null;

  return (
    // One row on desktop, stacked on a phone. As a single row at 375px the icon,
    // the CTA and the dismiss ate everything, leaving the copy about 100px wide —
    // "Back up your account" broke across three lines and the sentence below it
    // ran as a narrow ribbon. Same fix the invite banner needed: stack under
    // `sm`, give the CTA the full width, and float the dismiss to the corner so
    // it doesn't take a column of its own.
    <div
      className="relative w-full max-w-3xl mx-auto mt-4 flex flex-col gap-2.5 rounded-2xl border border-brand-accent/25 bg-gradient-to-br from-brand-deep/[0.03] to-brand-accent/[0.06] shadow-[0_0_15px_rgb(var(--brand-accent)/0.07)] px-4 py-3.5 pr-10 sm:py-3"
      data-testid="backup-reminder"
    >
      {/* `items-start` + a nudge down on the icon: centring it against a two-line
          block left it floating between the title and the body. It should anchor
          the title, which is what the eye pairs it with. */}
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 h-9 w-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-deep shrink-0">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2.5">
          {message && (
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100" data-testid="backup-reminder-title">
                {message.title}
              </p>
              <p className="text-[13px] text-slate-600 dark:text-slate-300 leading-snug">{message.body}</p>
            </div>
          )}
          <BackupPrompt need={need} onDelivered={() => setDelivered(true)} />
        </div>
      </div>
      <button
        type="button"
        onClick={delivered ? () => setHidden(true) : snooze}
        aria-label={delivered ? "Close" : "Remind me later"}
        className="absolute right-2 top-2 shrink-0 rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-brand-accent/10 transition-colors"
        data-testid="backup-reminder-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
