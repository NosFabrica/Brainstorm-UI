import type { BulkRetrigger } from "@/components/admin/users/useBulkRetrigger";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RefreshCw } from "lucide-react";

/** Confirms a bulk re-trigger the Users or Activity table asked for, naming who is already in flight. */
export function BulkConfirmDialog({ bulk, triggering }: { bulk: BulkRetrigger; triggering: ReadonlySet<string> }) {
  const bulkConfirm = bulk.pending;
  return (
    <Dialog
      open={bulkConfirm !== null}
      onOpenChange={(open) => {
        if (!open && !bulk.running) bulk.cancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-brand-deep" />
            Confirm Bulk Re-trigger
          </DialogTitle>
          <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
            Re-trigger GrapeRank calculation for multiple users at once.
          </DialogDescription>
        </DialogHeader>
        {bulkConfirm &&
          (() => {
            const inFlight = bulkConfirm.pubkeys.filter((pk) => triggering.has(pk));
            return (
              <div className="space-y-4 pt-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/25 dark:bg-amber-500/10">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    What happens when you confirm
                  </p>
                  <ul className="list-inside list-disc space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                    <li>
                      One GrapeRank calculation request is sent <span className="font-semibold">per unique pubkey</span>
                    </li>
                    <li>Requests fire in parallel batches (5 at a time) to avoid hammering the server</li>
                    <li>Already in-flight users will be skipped automatically</li>
                    <li>Progress will appear inline; failures can be retried individually</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Targets
                  </p>
                  <p className="text-xs text-slate-800 dark:text-slate-200" data-testid="text-bulk-confirm-count">
                    <span className="font-bold">{bulkConfirm.pubkeys.length}</span> unique pubkey
                    {bulkConfirm.pubkeys.length !== 1 ? "s" : ""}
                  </p>
                </div>
                {inFlight.length > 0 && (
                  <div
                    className="rounded-xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/25 dark:bg-orange-500/10"
                    data-testid="text-bulk-confirm-inflight"
                  >
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">
                      Heads up
                    </p>
                    <p className="text-xs text-orange-900 dark:text-orange-200">
                      {inFlight.length} of these user{inFlight.length !== 1 ? "s are" : " is"} already in flight and
                      will be skipped.
                    </p>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={bulk.cancel}
                    disabled={bulk.running}
                    className="no-default-hover-elevate no-default-active-elevate text-xs"
                    data-testid="button-cancel-bulk"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={bulk.confirm}
                    disabled={bulk.running || bulkConfirm.pubkeys.length === 0}
                    className="no-default-hover-elevate no-default-active-elevate gap-1.5 bg-brand-deep text-xs text-white hover:bg-brand-accent"
                    data-testid="button-confirm-bulk"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Re-trigger {bulkConfirm.pubkeys.length} user{bulkConfirm.pubkeys.length !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            );
          })()}
      </DialogContent>
    </Dialog>
  );
}
