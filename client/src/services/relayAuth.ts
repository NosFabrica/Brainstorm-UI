/**
 * Signing in to the reader's own relays when they ask (NIP-42).
 *
 * A relay in the reader's own relay list — their NIP-65 relays (kind 10002) or
 * their private-message inbox (kind 10050) — can answer reads with
 * `auth-required`, and an inbox relay can refuse a write the same way. The pool
 * never waits for any of this (lib/relayPool) — nothing on a screen is held by
 * one relay's login. This is the other half: once one of the reader's own
 * relays has refused a read or a write, answer its challenge with the account's
 * signer, without asking — they chose that relay, and it already knows them —
 * never for a signed-out reader, so the next read gets that relay's events too.
 * A declined or failed signature is nothing more than that.
 *
 * Anyone else's relay is never signed in to: a recipient's inbox relay that
 * takes wraps only from signed-in senders would learn who is writing to its
 * users, so a message there stays undelivered (services/dm/transport).
 *
 * It follows who may sign, not only new challenges. Switching accounts, or the
 * account publishing a list that names a relay already waiting, answers a
 * challenge already waiting. A relay signed in as someone who may no longer
 * sign — another account, signed out — is dropped from the pool: NIP-42 has no
 * sign-out, so a fresh, anonymous connection is the only way back, and the next
 * read opens one. Relays that challenge without refusing a read or a write are
 * left alone: no prompt for a login nothing needed.
 *
 * Nobody asked for this login, so it never raises our Unlock modal: a key that
 * can't sign silently waits until the reader is in Messages
 * (`setRelayAuthInteractive`), where opening their inbox is what they came for.
 */
import {
  BehaviorSubject,
  Subscription,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
  type Observable,
} from "rxjs";
import type { NostrEvent } from "nostr-tools";
import type { Relay, RelayPool } from "applesauce-relay";
import type { IAccount } from "applesauce-accounts";
import { normalizeURL } from "applesauce-core/helpers/url";
import { eventStore } from "@/lib/eventStore";
import { RELAY_LIST_KIND, parseRelayList } from "@/lib/relayList";
import { DM_RELAY_LIST_KIND, dmRelaysFromStore } from "@/lib/dm/inboxRelays";

type AuthPool = Pick<RelayPool, "relays" | "add$" | "remove$" | "remove">;
type ActiveAccount = Pick<IAccount, "pubkey" | "signEvent">;

const interactive$ = new BehaviorSubject(false);
/** The reader is in Messages: a login may ask them to unlock. */
export function setRelayAuthInteractive(on: boolean): void {
  if (interactive$.value !== on) interactive$.next(on);
}

const ownNow$ = new BehaviorSubject<ReadonlySet<string>>(new Set());
/** Whether `url` is one of the active account's own relays — the only kind we sign in to. */
export function isOwnRelay(url: string): boolean {
  return ownNow$.value.has(normalizeURL(url));
}

/** The relays `pubkey` lists as theirs, as the pool keys them: NIP-65 and the NIP-17 inbox. */
function ownRelaysFromStore(pubkey: string): ReadonlySet<string> {
  const nip65 = parseRelayList(eventStore.getReplaceable(RELAY_LIST_KIND, pubkey) as NostrEvent | undefined);
  return new Set([...nip65.read, ...nip65.write, ...(dmRelaysFromStore(pubkey) ?? [])].map((url) => normalizeURL(url)));
}

/** The same, kept current as the store learns a newer list. */
function ownRelaysLive(pubkey: string): Observable<ReadonlySet<string>> {
  return eventStore.insert$.pipe(
    filter((e) => e.pubkey === pubkey && (e.kind === RELAY_LIST_KIND || e.kind === DM_RELAY_LIST_KIND)),
    startWith(undefined),
    map(() => ownRelaysFromStore(pubkey)),
  );
}

export function startRelayAuth<A extends ActiveAccount>({
  pool,
  active$,
  canSignQuietly = async () => true,
  ownRelays = ownRelaysLive,
}: {
  pool: AuthPool;
  active$: Observable<A | undefined>;
  /** Whether signing now raises no modal of ours (accounts/signing canSignSilently). */
  canSignQuietly?: (account: A) => Promise<boolean>;
  /** The relays this account lists as its own, normalized. */
  ownRelays?: (pubkey: string) => Observable<ReadonlySet<string>>;
}): () => void {
  // Who may answer a challenge right now, and where: the active account, on its own relays.
  const signer$ = active$.pipe(
    distinctUntilChanged(),
    switchMap((account) =>
      account ? ownRelays(account.pubkey).pipe(map((own) => ({ account, own }))) : of(undefined),
    ),
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
    const url = normalizeURL(relay.url);
    sub.add(
      combineLatest([
        relay.challenge$,
        combineLatest([relay.authRequiredForRead$, relay.authRequiredForPublish$]).pipe(
          map(([read, publish]) => read || publish),
          distinctUntilChanged(),
        ),
        signer$,
        interactive$,
      ]).subscribe(([challenge, gated, signer, interactive]) => {
        const signedInAs = relay.authenticatedAs;
        if (signedInAs && signedInAs !== signer?.account.pubkey) {
          forget(relay);
          pool.remove(relay);
          return;
        }
        if (!challenge || !gated || !signer || signedInAs || !signer.own.has(url)) return;
        const account = signer.account;
        const key = `${url} ${account.pubkey} ${challenge}`;
        if (answered.has(key)) return;
        answered.add(key);
        void (async () => {
          if (!interactive && !(await canSignQuietly(account).catch(() => false))) {
            // Not now: answered when the reader opens Messages.
            answered.delete(key);
            return;
          }
          await relay.authenticate(account);
        })().catch(() => undefined);
      }),
    );
  };

  const ownSub = signer$.subscribe((signer) => ownNow$.next(signer?.own ?? new Set()));
  for (const relay of pool.relays.values()) watch(relay);
  const addSub = pool.add$.subscribe(watch);
  const removeSub = pool.remove$.subscribe(forget);

  return () => {
    ownSub.unsubscribe();
    addSub.unsubscribe();
    removeSub.unsubscribe();
    for (const relay of [...watched.keys()]) forget(relay);
    ownNow$.next(new Set());
  };
}
