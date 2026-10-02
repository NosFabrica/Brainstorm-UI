/**
 * Signing in to relays that ask (NIP-42), for a reader who has a signer.
 *
 * A relay can answer reads with `auth-required`, and a private-message inbox
 * relay can refuse a write the same way. The pool never waits for any of this
 * (lib/relayPool) — nothing on a screen is held by one relay's login. This is
 * the other half: once such a relay has refused, answer its challenge with the
 * account's signer, never for a signed-out reader — so the next read gets that
 * relay's events too. Which relays:
 *
 * - **The reader's own** — named in their NIP-65 list (kind 10002) or their
 *   private-message inbox list (kind 10050): always, once one refuses a read or
 *   a write. They chose that relay, and an inbox they can't open is no inbox.
 * - **Anyone else's** — only with consent (lib/relayAuthPref). Reads as above;
 *   writes only where a private message was refused (`allowWriteAuth`, from
 *   services/dm/transport): another relay turning down a note is no reason to
 *   tell it who we are.
 *
 * A refused login is recorded per relay (`relayAuthProblems$`), saying who
 * refused: the reader's signer saying no ("Rejected - Ask again" in Messages),
 * or the relay answering the login with a refusal of its own (its reason, and
 * "Try again"). Either stands until the reader asks again
 * (`askRelayAuthAgain`). Any other failure — a signer that doesn't answer in
 * time, a dropped socket — is tried again when the reader next opens Messages.
 * None is retried on the relay's next refusal, which would be a prompt per read.
 *
 * It follows who may sign, not only new challenges. Turning the switch on,
 * switching to an account that allowed it, or the account's list coming to
 * name a relay answers a challenge already waiting. A relay signed in as
 * someone who may no longer sign there — the switch turned off, another
 * account, signed out — is dropped from the pool: NIP-42 has no sign-out, so a
 * fresh, anonymous connection is the only way back, and the next read opens
 * one. Relays that challenge without refusing anything are left alone: no
 * prompt, and no pubkey handed to a relay that did not need it.
 *
 * Nobody asked for this login, so it never raises our Unlock modal: a key that
 * can't sign silently waits until the reader is in Messages
 * (`setRelayAuthInteractive`), where opening their inbox is what they came for.
 */
import {
  BehaviorSubject,
  Subject,
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
import { relayAuthAllowed, relayAuthChanged$ } from "@/lib/relayAuthPref";

type AuthPool = Pick<RelayPool, "relays" | "add$" | "remove$" | "remove">;
type ActiveAccount = Pick<IAccount, "pubkey" | "signEvent">;

const writeAuth$ = new BehaviorSubject<ReadonlySet<string>>(new Set());
/** A private message to `url` was refused until the sender signs in: that relay may be answered. */
export function allowWriteAuth(url: string): void {
  if (!writeAuth$.value.has(url)) writeAuth$.next(new Set([...writeAuth$.value, url]));
}

const interactive$ = new BehaviorSubject(false);
/** The reader is in Messages: a login may ask them to unlock. */
export function setRelayAuthInteractive(on: boolean): void {
  if (interactive$.value !== on) interactive$.next(on);
}

const ownNow$ = new BehaviorSubject<ReadonlySet<string>>(new Set());
/** Whether `url` is one of the active account's own relays — signed in to without asking. */
export function isOwnRelay(url: string): boolean {
  return ownNow$.value.has(normalizeURL(url));
}

/** Why a relay's login didn't happen: the reader's signer said no, or the relay refused the login it was sent. */
export type RelayAuthProblem = { by: "signer" } | { by: "relay"; message?: string };

const problems$ = new BehaviorSubject<ReadonlyMap<string, RelayAuthProblem>>(new Map());
/** Relays whose login was refused, by normalized URL — each waits for the reader to ask again. */
export const relayAuthProblems$: Observable<ReadonlyMap<string, RelayAuthProblem>> = problems$.asObservable();
export function relayAuthProblems(): ReadonlyMap<string, RelayAuthProblem> {
  return problems$.value;
}
function setProblem(url: string, problem: RelayAuthProblem | undefined) {
  if (!problem && !problems$.value.has(url)) return;
  const next = new Map(problems$.value);
  if (problem) next.set(url, problem);
  else next.delete(url);
  problems$.next(next);
}

/** The refusal on record for `url`, in whatever spelling it comes. */
export function relayAuthProblemFor(
  problems: ReadonlyMap<string, RelayAuthProblem>,
  url: string,
): RelayAuthProblem | undefined {
  return problems.get(normalizeURL(url));
}

const askAgain$ = new Subject<string | undefined>();
/** The reader asked for another try at a refused login — on `url`, or on every relay that has one. */
export function askRelayAuthAgain(url?: string): void {
  askAgain$.next(url === undefined ? undefined : normalizeURL(url));
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

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
    // A list arriving again from another relay, or one that moved nothing, changes nothing here.
    distinctUntilChanged(sameSet),
  );
}

export function startRelayAuth<A extends ActiveAccount>({
  pool,
  active$,
  canSignQuietly = async () => true,
  isRejection = () => true,
  ownRelays = ownRelaysLive,
}: {
  pool: AuthPool;
  active$: Observable<A | undefined>;
  /** Whether signing now raises no modal of ours (accounts/signing canSignSilently). */
  canSignQuietly?: (account: A) => Promise<boolean>;
  /** Whether the signer's error is it saying no, rather than failing to answer (a timeout, say). */
  isRejection?: (error: unknown) => boolean;
  /** The relays this account lists as its own, normalized. */
  ownRelays?: (pubkey: string) => Observable<ReadonlySet<string>>;
}): () => void {
  type Signer = { account: A; own: ReadonlySet<string>; allowed: boolean };
  // Who may answer a challenge right now: the active account — on its own
  // relays always, elsewhere if it said yes on this device.
  const signer$: Observable<Signer | undefined> = active$.pipe(
    distinctUntilChanged(),
    switchMap((account) =>
      account
        ? combineLatest([
            ownRelays(account.pubkey),
            relayAuthChanged$.pipe(
              startWith(undefined),
              map(() => relayAuthAllowed(account.pubkey)),
              distinctUntilChanged(),
            ),
          ]).pipe(map(([own, allowed]) => ({ account, own, allowed })))
        : of(undefined),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  const watched = new Map<Relay, Subscription>();

  const forget = (relay: Relay) => {
    watched.get(relay)?.unsubscribe();
    watched.delete(relay);
  };

  const watch = (relay: Relay) => {
    if (watched.has(relay)) return;
    const sub = new Subscription();
    watched.set(relay, sub);
    const url = normalizeURL(relay.url);
    // Challenges being answered, or answered, on this connection — gone with it.
    const answered = new Set<string>();
    // Of those, the ones that failed: refused by the signer or the relay (until
    // the reader asks again), or something else (until they open Messages).
    const refused = new Set<string>();
    const failed = new Set<string>();
    let wasInteractive = interactive$.value;
    type Inputs = [string | null, boolean, boolean, boolean, Signer | undefined, boolean];
    let last: Inputs | undefined;

    const evaluate = ([challenge, read, publish, writeRefused, signer, interactive]: Inputs) => {
      if (interactive && !wasInteractive) {
        for (const key of failed) answered.delete(key);
        failed.clear();
      }
      wasInteractive = interactive;
      const own = !!signer?.own.has(url);
      const mayHere = !!signer && (own || signer.allowed);
      const signedInAs = relay.authenticatedAs;
      if (signedInAs && (signedInAs !== signer?.account.pubkey || !mayHere)) {
        forget(relay);
        pool.remove(relay);
        return;
      }
      if (!challenge || !signer || !mayHere || signedInAs) return;
      const gated = own ? read || publish : read || (publish && writeRefused);
      if (!gated) return;
      const account = signer.account;
      const key = `${account.pubkey} ${challenge}`;
      if (answered.has(key)) return;
      answered.add(key);
      let saidNo = false;
      // The account, with its "no" told apart from the relay's.
      const asking = {
        pubkey: account.pubkey,
        signEvent: async (draft: Parameters<A["signEvent"]>[0]) => {
          try {
            return await account.signEvent(draft);
          } catch (error) {
            saidNo = isRejection(error);
            throw error;
          }
        },
      };
      void (async () => {
        if (!interactive && !(await canSignQuietly(account).catch(() => false))) {
          // Not now: answered when the reader opens Messages.
          answered.delete(key);
          return;
        }
        const answer = (await relay.authenticate(asking as unknown as A)) as { ok?: boolean; message?: string };
        if (answer?.ok === false) {
          refused.add(key);
          setProblem(url, { by: "relay", message: answer.message?.trim() || undefined });
        } else setProblem(url, undefined);
      })().catch(() => {
        if (saidNo) {
          refused.add(key);
          setProblem(url, { by: "signer" });
        } else failed.add(key);
      });
    };

    sub.add(
      combineLatest([
        relay.challenge$,
        // The library re-emits `true` on every refused REQ: only a change is news.
        relay.authRequiredForRead$.pipe(distinctUntilChanged()),
        relay.authRequiredForPublish$.pipe(distinctUntilChanged()),
        writeAuth$.pipe(
          map((writes) => writes.has(relay.url)),
          distinctUntilChanged(),
        ),
        signer$,
        interactive$,
      ]).subscribe((inputs) => {
        last = inputs;
        evaluate(inputs);
      }),
    );
    sub.add(
      askAgain$.subscribe((which) => {
        if (which !== undefined && which !== url) return;
        if (!refused.size && !failed.size) return;
        for (const key of [...refused, ...failed]) answered.delete(key);
        refused.clear();
        failed.clear();
        setProblem(url, undefined);
        if (last) evaluate(last);
      }),
    );
  };

  let problemsFor: string | undefined;
  const ownSub = signer$.subscribe((signer) => {
    ownNow$.next(signer?.own ?? new Set());
    // A refusal is the account's: another account starts with none.
    if (signer?.account.pubkey !== problemsFor) {
      problemsFor = signer?.account.pubkey;
      if (problems$.value.size) problems$.next(new Map());
    }
  });
  for (const relay of pool.relays.values()) watch(relay);
  const addSub = pool.add$.subscribe(watch);
  const removeSub = pool.remove$.subscribe(forget);

  return () => {
    ownSub.unsubscribe();
    ownNow$.next(new Set());
    problems$.next(new Map());
    addSub.unsubscribe();
    removeSub.unsubscribe();
    for (const relay of [...watched.keys()]) forget(relay);
  };
}
