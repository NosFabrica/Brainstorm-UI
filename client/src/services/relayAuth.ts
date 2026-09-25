/**
 * Signing in to relays that ask (NIP-42), for a reader who has a signer and
 * said yes.
 *
 * A relay in the reader's own relay list can answer reads with
 * `auth-required`. The pool never waits for that (lib/relayPool) — nothing on
 * a screen is held by one relay's login. This is the other half: when such a
 * relay sends its challenge, answer it with the account's signer, once per
 * challenge, only with consent (lib/relayAuthPref), never for a signed-out
 * reader — so the next read gets that relay's events too. A declined or
 * failed signature is nothing more than that.
 */
import type { Observable } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { relayAuthAllowed } from "@/lib/relayAuthPref";

type Signer = { pubkey: string; signEvent: (template: Record<string, unknown>) => Promise<NostrEvent> };
type AuthRelay = {
  url: string;
  challenge$: Observable<string | null>;
  authenticate: (signer: { signEvent: Signer["signEvent"] }) => Promise<unknown>;
};
type AuthPool = { add$: Observable<AuthRelay>; relays: Map<string, AuthRelay> };

export function startRelayAuth({ pool, active$ }: { pool: AuthPool; active$: Observable<Signer | undefined> }): () => void {
  let account: Signer | undefined;
  const accountSub = active$.subscribe((a) => { account = a; });
  const answered = new Map<string, string>();
  const relaySubs: { unsubscribe(): void }[] = [];

  const watch = (relay: AuthRelay) => {
    relaySubs.push(
      relay.challenge$.subscribe((challenge) => {
        if (!challenge || !account || !relayAuthAllowed(account.pubkey)) return;
        if (answered.get(relay.url) === challenge) return;
        answered.set(relay.url, challenge);
        const signer = account;
        void relay
          .authenticate({ signEvent: (template) => signer.signEvent({ created_at: Math.floor(Date.now() / 1000), ...template }) })
          .catch(() => undefined);
      }),
    );
  };

  for (const relay of pool.relays.values()) watch(relay);
  const addSub = pool.add$.subscribe(watch);

  return () => {
    accountSub.unsubscribe();
    addSub.unsubscribe();
    for (const s of relaySubs) s.unsubscribe();
  };
}
