/**
 * Signing in to relays that ask (NIP-42), for a reader who has a signer and
 * said yes.
 *
 * A relay in the reader's own relay list can answer reads with
 * `auth-required`. The pool never waits for that (lib/relayPool) — nothing on
 * a screen is held by one relay's login. This is the other half: once such a
 * relay has refused a read, answer its challenge with the account's signer,
 * only with consent (lib/relayAuthPref), never for a signed-out reader — so
 * the next read gets that relay's events too. A declined or failed signature
 * is nothing more than that.
 *
 * It follows who may sign, not only new challenges. Turning the switch on, or
 * switching to an account that allowed it, answers a challenge already
 * waiting. A relay signed in as someone who may no longer sign — the switch
 * turned off, another account, signed out — is dropped from the pool: NIP-42
 * has no sign-out, so a fresh, anonymous connection is the only way back, and
 * the next read opens one. Relays that challenge without refusing a read are
 * left alone: no prompt, and no pubkey handed to a relay that did not need it.
 */
import { Subscription, combineLatest, distinctUntilChanged, map, shareReplay, startWith, type Observable } from "rxjs";
import type { Relay, RelayPool } from "applesauce-relay";
import type { IAccount } from "applesauce-accounts";
import { relayAuthAllowed, relayAuthChanged$ } from "@/lib/relayAuthPref";

type AuthPool = Pick<RelayPool, "relays" | "add$" | "remove$" | "remove">;
type ActiveAccount = Pick<IAccount, "pubkey" | "signEvent">;

export function startRelayAuth({ pool, active$ }: { pool: AuthPool; active$: Observable<ActiveAccount | undefined> }): () => void {
  // Who may answer a challenge right now: the active account, if it said yes on this device.
  const signer$ = combineLatest([active$, relayAuthChanged$.pipe(startWith(undefined))]).pipe(
    map(([account]) => (account && relayAuthAllowed(account.pubkey) ? account : undefined)),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  const watched = new Map<Relay, Subscription>();
  const answered = new Set<string>();

  const forget = (relay: Relay) => {
    watched.get(relay)?.unsubscribe();
    watched.delete(relay);
  };

  const watch = (relay: Relay) => {
    if (watched.has(relay)) return;
    const sub = new Subscription();
    watched.set(relay, sub);
    sub.add(
      combineLatest([relay.challenge$, relay.authRequiredForRead$, signer$]).subscribe(([challenge, gated, signer]) => {
        const signedInAs = relay.authenticatedAs;
        if (signedInAs && signedInAs !== signer?.pubkey) {
          forget(relay);
          pool.remove(relay);
          return;
        }
        if (!challenge || !gated || !signer || signedInAs) return;
        const key = `${relay.url} ${signer.pubkey} ${challenge}`;
        if (answered.has(key)) return;
        answered.add(key);
        void relay.authenticate(signer).catch(() => undefined);
      }),
    );
  };

  for (const relay of pool.relays.values()) watch(relay);
  const addSub = pool.add$.subscribe(watch);
  const removeSub = pool.remove$.subscribe(forget);

  return () => {
    addSub.unsubscribe();
    removeSub.unsubscribe();
    for (const relay of [...watched.keys()]) forget(relay);
  };
}
