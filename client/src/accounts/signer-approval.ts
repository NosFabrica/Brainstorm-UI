/**
 * The seam between a signer that wants approving and the modal that says so.
 *
 * NIP-46's `auth_url` tells the client to send its user somewhere to approve a
 * request. applesauce's default answer is `window.open(url, "auth", …)` fired
 * from inside an async relay-event handler — no user gesture, so blockers eat it
 * silently and the request hangs with nothing on screen to explain why. nsec.app
 * sends `auth_url` for *every* un-permissioned request, so that is not an edge.
 *
 * The fix is to put a link in front of the user and let *them* click it, which
 * restores the gesture. This module carries the request up to the modal, the way
 * `unlock-request` carries a Locked key's password prompt.
 *
 * Pre-requesting every permission at connect doesn't retire this: grants get
 * revoked, forgotten, or reset by an interactive re-pair.
 */
import { BehaviorSubject } from "rxjs";

export type SignerApproval = {
  /** Where the signer wants the user to go. Rendered as a link, never opened for them. */
  url: string;
  /** They've been sent — stop waiting on the click and go back to waiting on the signer. */
  opened(): void;
  /** They'd rather not. The request that triggered this is left to time out. */
  dismiss(): void;
};

/** The approval on screen, or null. A `BehaviorSubject` so a late mount still sees it. */
export const signerApproval$ = new BehaviorSubject<SignerApproval | null>(null);

/**
 * Ask the user to approve in their signer.
 *
 * Resolves once they've followed the link or dismissed it — the *request* is
 * still outstanding either way, since approving happens in the signer's own app
 * and reaches us over the relay. Never rejects: applesauce rejects the pending
 * request if `onAuth` throws, which would abandon a request the user is at that
 * moment approving.
 */
export function requestSignerApproval(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    signerApproval$.next({
      url,
      opened: () => resolve(),
      dismiss: () => resolve(),
    });
  }).finally(() => signerApproval$.next(null));
}
