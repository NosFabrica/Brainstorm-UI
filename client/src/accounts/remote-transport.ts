/**
 * How a remote signer is reached, and whether it can be reached at all.
 *
 * Two separate jobs, both about the relays rather than the signer:
 *
 * 1. **Installing the transport, before anything is restored.** The signer takes
 *    its subscribe and publish methods from class statics at *construction*, and
 *    throws without them. Bootstrap deserialises accounts synchronously at module
 *    load, so a remembered remote Account restored before this ran doesn't start
 *    mute — it fails to construct, lands in quarantine, and never recovers for the
 *    life of the browser.
 *
 * 2. **Saying whether the relays are up.** NIP-46 has no delivery signal:
 *    `makeRequest` awaits the *completion* of the publish, not an OK from any
 *    relay, so with every relay down a request is dropped and we wait exactly as
 *    we would while a user reads their phone. Watching the pool is the only way
 *    to tell "can't reach the relays" from "not approved yet", and telling those
 *    apart is most of what a connect screen is for.
 */
import { NostrConnectSigner, type NostrPool } from "applesauce-signers";
import { distinctUntilChanged, map, startWith, type Observable } from "rxjs";

import { pool } from "@/lib/relayPool";

/** Point every remote signer, restored or new, at a pool. */
export function installRemoteTransport(source: NostrPool = pool): void {
  NostrConnectSigner.pool = source;
}

/** Relay URLs vary by a trailing slash between what we ask for and what the pool reports. */
function sameRelay(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

/**
 * Whether at least one of these relays is connected right now. One is enough:
 * a signer answers on whichever it can see us on.
 */
export function relaysReachable$(relays: string[], source = pool): Observable<boolean> {
  return source.status$.pipe(
    map((statuses) =>
      Object.values(statuses).some(
        (status) => status.connected && relays.some((relay) => sameRelay(relay, status.url)),
      ),
    ),
    startWith(false),
    distinctUntilChanged(),
  );
}
