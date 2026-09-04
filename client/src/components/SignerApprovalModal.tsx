/**
 * "Approve in your signer" — the link that replaces a blocked popup.
 *
 * NIP-46 signers answer an un-permissioned request with an `auth_url`, and the
 * library's default is to `window.open` it from inside a relay callback. There
 * is no user gesture there, so browsers block it and the request hangs with
 * nothing on screen to explain why. Here the user clicks, so the window opens.
 */
import { use$ } from "applesauce-react/hooks";
import { ExternalLink } from "lucide-react";

import { signerApproval$ } from "@/accounts/signer-approval";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SignerApprovalModal() {
  const approval = use$(signerApproval$);
  if (!approval) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && approval.dismiss()}>
      <DialogContent data-testid="signer-approval-modal">
        <DialogHeader>
          <DialogTitle>Approve this in your signer</DialogTitle>
          <DialogDescription>
            Your signer wants to check with you before it answers. Open it, approve the request,
            and Brainstorm will carry on where it left off.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={approval.dismiss} data-testid="button-approval-dismiss">
            Not now
          </Button>
          {/* An anchor, not a handler: the click is the gesture that lets the
              window through, and a popup blocker never sees it. */}
          <Button asChild data-testid="link-approval-open">
            <a href={approval.url} target="_blank" rel="noopener" onClick={approval.opened}>
              <ExternalLink /> Open my signer
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
