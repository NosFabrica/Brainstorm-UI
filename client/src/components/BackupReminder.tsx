import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useActiveAccount } from "applesauce-react/hooks";

import { getMetadata, updateMetadata, type BrainstormAccount } from "@/accounts/metadata";
import { BACKUP_MESSAGE, BackupPrompt } from "@/components/BackupPrompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBackupNeed } from "@/hooks/useBackupNeed";

// Re-surface roughly every couple of days until backed up — present, not naggy.
const SNOOZE_MS = 2.5 * 24 * 3600_000;

/**
 * The one surface in the backup chain: backup left the setup critical path with
 * the old wizard and post-signup card, so this reminder is all that stands
 * between an in-app account and being unrecoverable.
 *
 * What it asks is whatever the Account is missing next — a Recovery password for
 * a migrated key, the download for one that already has a Backup — and who it
 * asks is decided by that same state, so extension and remote-signer Accounts
 * (nothing to back up) and pasted keys (their owner holds them) never see it.
 *
 * Dismissing it **snoozes** rather than silences: losing the browser loses the
 * account, so unlike a setup checklist this can't be dismissed forever.
 */
export function BackupReminder() {
  const account = useActiveAccount() as BrainstormAccount | undefined;
  const need = useBackupNeed();
  const [hidden, setHidden] = useState(false);
  const [delivered, setDelivered] = useState(false);

  const remindedAt = account ? (getMetadata(account).backupRemindedAt ?? 0) : 0;
  const snoozed = remindedAt > 0 && Date.now() - remindedAt < SNOOZE_MS;

  if (hidden) return null;
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
    // Stacked, not one row: at 375px the icon, CTA and dismiss ate everything and
    // left the copy about 100px wide. The dismiss floats to the corner so it
    // doesn't take a column of its own.
    <Card
      accent
      className="relative w-full max-w-3xl mx-auto mt-4 flex flex-col gap-2.5 px-4 py-3.5 pr-10 sm:py-3"
      data-testid="backup-reminder"
    >
      {/* `items-start`: centring the icon against a two-line block left it
          floating. It should anchor the title, which is what the eye pairs it with. */}
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 h-9 w-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-deep shrink-0">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2.5">
          {message && (
            <div>
              <p className="text-sm font-semibold text-foreground" data-testid="backup-reminder-title">
                {message.title}
              </p>
              <p className="text-[13px] text-muted-foreground leading-snug">{message.body}</p>
            </div>
          )}
          <BackupPrompt need={need} onDelivered={() => setDelivered(true)} />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={delivered ? () => setHidden(true) : snooze}
        aria-label={delivered ? "Close" : "Remind me later"}
        className="absolute right-1.5 top-1.5 h-8 w-8 shrink-0 text-muted-foreground"
        data-testid="backup-reminder-dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </Card>
  );
}
