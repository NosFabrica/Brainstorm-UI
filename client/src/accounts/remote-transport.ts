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
import type { NostrEvent } from "applesauce-core/helpers/event";
import { distinctUntilChanged, map, startWith, type Observable } from "rxjs";

import { pool } from "@/lib/relayPool";

/**
 * How long a request waits for its own publish before getting on with it. Long
 * enough that a healthy relay reports back first, short enough to be invisible.
 */
export const PUBLISH_GRACE_MS = 2_000;

/** Point every remote signer, restored or new, at a pool. */
export function installRemoteTransport(source: NostrPool = pool): void {
  NostrConnectSigner.pool = source;

  /**
   * The library's `makeRequest` will not return the signer's response until the
   * publish has settled on *every* relay in the set:
   *
   *     const result = this.publishMethod?.(this.relays, event);
   *     if (result instanceof Promise) await result;
   *     return p;                        // p resolved long ago
   *
   * So one unreachable relay costs its full 30s `publishTimeout` on every single
   * request, and our own 30s deadline then fires and calls a signer that answered
   * in 329ms unresponsive. Measured against Amethyst, 2026-08-11.
   *
   * We hand the request back after a grace period instead. The publish itself is
   * untouched and keeps going — a slow relay still gets the event, it just stops
   * holding the conversation up.
   */
  NostrConnectSigner.publishMethod = (relays: string[], event: NostrEvent) => {
    // Per relay, so one accepting is enough — a whole-set publish would only tell
    // us once the slowest had finished, which is the problem itself. A relay that
    // fails never resolves: it must not win the race and cut the others short.
    const accepted = relays.map(
      (relay) =>
        new Promise<void>((resolve) => {
          Promise.resolve(source.publish([relay], event)).then(
            () => resolve(),
            () => {},
          );
        }),
    );
    return Promise.race([
      ...accepted,
      new Promise<void>((resolve) => setTimeout(resolve, PUBLISH_GRACE_MS)),
    ]);
  };
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
