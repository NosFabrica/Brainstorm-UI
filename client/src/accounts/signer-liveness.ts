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
import { distinctUntilChanged, merge, of, startWith, Subject, switchMap, type Observable } from "rxjs";

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
          return merge(of(void 0), recheck$).pipe(
            switchMap(probe),
            startWith(null as BrainstormAccount | null),
          );
        }),
      );
    }),
    distinctUntilChanged(),
  );
}
