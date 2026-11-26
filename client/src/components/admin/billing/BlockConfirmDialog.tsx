import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type AdminBillingSubscription } from "@/services/api";
import { shortNpub } from "./rosterShared";

/**
 * Blocking is confirmed because of the part that surprises people: the money
 * keeps moving. Unblocking isn't — it only re-opens a door.
 */
export function BlockConfirmDialog({
  confirmBlock,
  setConfirmBlock,
  onBlock: handleSetBlock,
}: {
  confirmBlock: AdminBillingSubscription | null;
  setConfirmBlock: (sub: AdminBillingSubscription | null) => void;
  onBlock: (sub: AdminBillingSubscription, blocked: boolean) => Promise<void>;
}) {
  return (
    <Dialog open={!!confirmBlock} onOpenChange={(o) => !o && setConfirmBlock(null)}>
      <DialogContent data-testid="dialog-billing-block-confirm">
        <DialogHeader>
          <DialogTitle>Block billing for this subscriber?</DialogTitle>
          <DialogDescription>
            {confirmBlock
              ? `“${shortNpub(confirmBlock.pubkey).short}” will be withheld from paid entitlement no matter what they pay, and any tier billing granted them is taken back now. This does not cancel or refund anything — Flash keeps charging them until the subscription is cancelled.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmBlock(null)} data-testid="button-billing-block-cancel">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const sub = confirmBlock;
              setConfirmBlock(null);
              if (sub) void handleSetBlock(sub, true);
            }}
            data-testid="button-billing-block-confirm"
          >
            Block billing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
