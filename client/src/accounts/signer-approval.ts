/**
 * The seam between a signer that wants approving and the modal that says so.
 *
 * applesauce answers NIP-46's `auth_url` with `window.open` from inside an async
 * relay handler — no user gesture, so blockers eat it and the request hangs with
 * nothing on screen. We render a link the user clicks instead. Not an edge case:
 * nsec.app sends `auth_url` for every un-permissioned request, and pre-requesting
 * permissions at connect doesn't help — grants get revoked and re-pairs reset them.
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
