/**
 * Whether the Active Account's remote signer is still there.
 *
 * NIP-46 has **no revocation signal**. Amber's "Reset Bunker" mints a new
 * per-connection key, and "Delete application" drops the pairing outright — in
 * both cases our stored `remote` becomes a pubkey nobody is listening on, and
 * nothing on the wire ever mentions it. The account keeps looking healthy right
 * up until the user tries to publish something and that fails instead.
 *
 * `ping` is the only probe there is, and it is a good one: Amber grants it as
 * ALWAYS at connect time, so it needs no approval and an answer comes back in
 * seconds (research §"There is no revocation signal").
 *
 * **Why this is not the picker's rule.** Ticket 12 fixed signer health as
 * checked-on-click, never at render, because the picker draws N rows and a probe
 * each would be N round trips that can hang. That reasoning is about the picker.
 * Here there is exactly one signer, the user is already signed in, and the cost
 * is one message — so this is the signed-in state's own question, answered its
 * own way, and `signerPresence` is deliberately left alone.
 */
import type { AccountManager } from "applesauce-accounts";
import {
  distinctUntilChanged,
  EMPTY,
  filter,
  fromEvent,
  merge,
  of,
  startWith,
  Subject,
  exhaustMap,
  switchMap,
  throttleTime,
  type Observable,
} from "rxjs";

import type { AccountMetadata, BrainstormAccount } from "./metadata";
import { relaysReachable$ } from "./remote-transport";
import { isRemoteSignerTimeout } from "./remote-signer";

/** A signer we hold a NIP-46 connection to, as far as this module needs to know. */
type PingableAccount = BrainstormAccount & {
  signer: { ping(): Promise<unknown>; relays: string[] };
};

/** Ask again — the reconnect affordance, and anything else that wants a recheck. */
const recheck$ = new Subject<void>();

export function recheckSigner(): void {
  recheck$.next();
}

/**
 * No more often than this on tab focus — flicking between tabs is not news.
 *
 * Comfortably longer than `REQUEST_TIMEOUT_MS`, which is what a ping waits before
 * giving up. Equal would mean a revisit landing just as a probe was about to time
 * out, and with `exhaustMap` below that revisit is dropped rather than restarting
 * it — but leaving no daylight between the two is asking for the interleaving to
 * matter.
 */
export const REVISIT_THROTTLE_MS = 90_000;

/**
 * The tab coming back to the foreground.
 *
 * The gap this closes: a signer that dies *during* a session — Amber's "Reset
 * Bunker", or the app being killed — changes no Account and moves no relay, so
 * none of the other triggers fire and the card never appears. The user finds out
 * when a publish fails, which is the thing this module exists to prevent.
 *
 * A revisit is the cheapest honest signal. No timer runs while the tab is idle,
 * and it fires exactly when someone is back and able to act on the answer. It
 * does not cover a signer that dies while they sit watching the tab; a poll
 * would, at the cost of a round trip per interval per user, forever.
 */
function tabRevisited$(): Observable<unknown> {
  if (typeof document === "undefined") return EMPTY;
  return fromEvent(document, "visibilitychange").pipe(
    filter(() => document.visibilityState === "visible"),
  );
}

function isRemote(account: BrainstormAccount | undefined): account is PingableAccount {
  return (
    !!account &&
    account.type === "nostr-connect" &&
    typeof (account as PingableAccount).signer?.ping === "function"
  );
}

/**
 * The Active Account while its remote signer is not answering, else null.
 *
 * Silent about everything else on purpose. An extension or a local key has no
 * signer to lose, and **while the relays are down we say nothing at all**: that
 * is the transport indicator's job and it already has its own words for it.
 * Reporting both would tell the user their signer is broken when the truth is
 * that their wifi is, and send them to the wrong app to fix it.
 */
export function signerUnreachable$(
  manager: AccountManager<AccountMetadata>,
  reachable: (relays: string[]) => Observable<boolean> = relaysReachable$,
  revisited: Observable<unknown> = tabRevisited$(),
): Observable<BrainstormAccount | null> {
  return manager.active$.pipe(
    switchMap((active) => {
      const account = active as unknown as BrainstormAccount | undefined;
      if (!isRemote(account)) return of(null);

      const probe = async (): Promise<BrainstormAccount | null> => {
        try {
          await account.signer.ping();
          return null;
        } catch (error) {
          // Only silence means gone. A signer that simply doesn't implement
          // `ping` answers with an error, and calling that one dead would
          // condemn it permanently — a recheck reproduces it exactly.
          return isRemoteSignerTimeout(error) ? account : null;
        }
      };

      // Throttled out here, not inside the reachability switch: in there the
      // window belongs to the inner subscription, so every relay flap would
      // resubscribe and reset it. Only this arm is throttled — "Check again" is a
      // person asking, and making them wait out a window would look broken.
      //
      // `trailing` as well as `leading`, so a revisit that lands inside the window
      // still probes when it closes. Dropping it outright is how a signer that
      // died while the user was away goes unnoticed after they come back.
      const throttledRevisits = revisited.pipe(
        throttleTime(REVISIT_THROTTLE_MS, undefined, { leading: true, trailing: true }),
      );

      // This Account's own relays, not the app's. A `bunker://` pairing listens
      // on whatever its URI named and nothing else, so asking about ours would
      // answer a different question: a healthy app relay would let us probe into
      // a dead bunker relay and blame the signer, and a dead app relay would
      // suppress the card this whole module exists to raise.
      return reachable(account.signer.relays).pipe(
        distinctUntilChanged(),
        switchMap((up): Observable<BrainstormAccount | null> => {
          // Not "unreachable" — unknown. Saying nothing is the honest answer, and
          // it also stops us probing into a socket that isn't there.
          if (!up) return of(null);
          // `exhaustMap`, not `switchMap`: a probe already in flight is the
          // answer we are waiting for, and restarting it postpones the verdict.
          // With a 30s ping deadline, a user flipping tabs could have kept
          // cancelling the ping just before it expired and never been told their
          // signer was dead — the one thing this module is for.
          return merge(of(void 0), recheck$, throttledRevisits).pipe(
            exhaustMap(probe),
            startWith(null as BrainstormAccount | null),
          );
        }),
      );
    }),
    distinctUntilChanged(),
  );
}
