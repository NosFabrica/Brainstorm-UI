import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Play } from "lucide-react";

/** Confirms one person's GrapeRank run, from the Users row's menu, saying what it sets off. */
export function TriggerConfirmDialog({
  pubkey: triggerConfirmPubkey,
  setPubkey: setTriggerConfirmPubkey,
  onConfirm: triggerGraperank,
}: {
  pubkey: string | null;
  setPubkey: (pubkey: string | null) => void;
  onConfirm: (pubkey: string) => Promise<void>;
}) {
  return (
    <Dialog
      open={triggerConfirmPubkey !== null}
      onOpenChange={(open) => {
        if (!open) setTriggerConfirmPubkey(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Confirm GrapeRank Trigger
          </DialogTitle>
          <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
            You are about to manually trigger a GrapeRank calculation. Please review the details below before
            confirming.
          </DialogDescription>
        </DialogHeader>
        {triggerConfirmPubkey && (
          <div className="space-y-4 pt-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                What happens when you confirm
              </p>
              <ul className="list-inside list-disc space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                <li>A GrapeRank calculation request is sent to the Brainstorm server for this user's pubkey</li>
                <li>
                  The server crawls the user's Nostr social graph — follows, mutes, and interactions — to compute
                  personalized scores
                </li>
                <li>
                  This is <span className="font-semibold">resource-intensive</span> and may take several minutes
                  depending on graph size
                </li>
                <li>
                  Progress and results will appear in the <span className="font-semibold">Activity tab</span> once
                  processing begins
                </li>
                <li>If a calculation is already running for this user, a duplicate request may be queued</li>
              </ul>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 dark:border-blue-500/25 dark:bg-blue-500/10">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Good to know
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-300">
                GrapeRank scores are calculated relative to the user's own social graph. Each user's network is unique.
                Triggering this does not affect other users' scores.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Target Pubkey
              </p>
              <p
                className="break-all font-mono text-xs text-slate-800 dark:text-slate-200"
                data-testid="text-trigger-confirm-pubkey"
              >
                {triggerConfirmPubkey}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTriggerConfirmPubkey(null)}
                className="no-default-hover-elevate no-default-active-elevate text-xs"
                data-testid="button-cancel-trigger"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const pk = triggerConfirmPubkey;
                  setTriggerConfirmPubkey(null);
                  triggerGraperank(pk);
                }}
                className="no-default-hover-elevate no-default-active-elevate gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                data-testid="button-confirm-trigger"
              >
                <Play className="h-3.5 w-3.5" />
                Confirm Trigger
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
