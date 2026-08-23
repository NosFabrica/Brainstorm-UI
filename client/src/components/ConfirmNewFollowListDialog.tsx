import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmNewFollowListDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

/**
 * The one question only the user can answer before a from-scratch kind-3 is
 * allowed: "have you ever followed anyone with this key?" Shown when
 * `followPubkeys` returns `needsBaseConfirmation` — we found no follow list on
 * their relays, which for an imported key is indistinguishable from a fetch
 * that failed. Publishing anyway would replace whatever list actually exists
 * (kind 3 is replaceable), so the destructive path requires this explicit
 * consent. Cancel is the default; nothing has been published either way.
 */
export function ConfirmNewFollowListDialog({ open, onCancel, onConfirm, busy = false }: ConfirmNewFollowListDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <AlertDialogContent data-testid="dialog-confirm-new-follow-list">
        <AlertDialogHeader>
          <AlertDialogTitle>We couldn't find an existing follow list</AlertDialogTitle>
          <AlertDialogDescription>
            We checked your relays and couldn't find a follow list for this key. If you've
            followed people before — here or in another app — publishing now could replace
            that list. Cancel and try again in a moment, or continue only if you've never
            followed anyone with this key.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={busy} data-testid="button-new-follow-list-cancel">
            Cancel — try again later
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-new-follow-list-confirm"
          >
            I've never followed anyone — continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
