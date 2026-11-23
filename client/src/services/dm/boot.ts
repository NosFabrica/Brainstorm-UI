/**
 * Private messages start with the first Active Account, and their code loads
 * then too.
 *
 * The engine — the live subscription, the history pager, gift-wrap opening,
 * the device cache, the outbox — is for someone signed in, and an anonymous
 * visitor searching the house perspective never needs a byte of it. So the
 * app shell imports only this and `services/dm/current` (which engine runs,
 * for the badge and notifications), and `services/dm` itself is fetched the
 * moment an Account is active: at boot for a returning reader, at sign-in for
 * a new one. From then on it follows the Active Account as it always did.
 */
import { accountManager } from "@/accounts";

/** A chunk that failed to load (offline, mid-deploy) is asked for again after this. */
const RETRY_MS = 30_000;

let subscribed = false;
let state: "waiting" | "loading" | "started" = "waiting";

export function startDirectMessagesWhenSignedIn(): void {
  if (subscribed) return;
  subscribed = true;
  const attempt = () => {
    if (state !== "waiting" || !accountManager.active) return;
    state = "loading";
    import("./index").then(
      ({ startDirectMessages }) => {
        state = "started";
        startDirectMessages();
      },
      () => {
        state = "waiting";
        setTimeout(attempt, RETRY_MS);
      },
    );
  };
  accountManager.active$.subscribe(attempt);
}
