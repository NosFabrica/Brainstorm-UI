/**
 * Signing in to relays that ask (NIP-42), for a reader who has a signer.
 *
 * Any relay can answer a read with `auth-required`, or refuse a write the same
 * way — a private-message inbox relay commonly does both. The pool never waits
 * for any of this (lib/relayPool) — nothing on a screen is held by one relay's
 * login. This is the other half: once a relay has refused a read or a write,
 * answer its challenge with the account's signer, without asking, never for a
 * signed-out reader — so the next read gets that relay's events too, and the
 * next write goes through. The signer still has the last word: it may prompt,
 * and the reader may say no there.
 *
 * A login that doesn't happen is recorded per account and relay
 * (`relayAuthProblems$`), saying why: the signer said no ("Rejected - Ask
 * again" in Messages), the relay answered the login with a refusal (its reason,
 * and "Try again"), or it simply didn't go through — no signer, no answer in
 * time ("Try again", and tried again by itself when the reader next opens
 * Messages). While a record stands that relay is not asked again: not on its
 * next refusal, which would be a prompt per read, and not on a reconnect, whose
 * fresh challenge is still the same relay. `askRelayAuthAgain` clears it.
 *
 * It follows who may sign, not only new challenges: switching accounts answers
 * a challenge already waiting. A relay signed in as someone no longer active —
 * another account, signed out — is dropped from the pool: NIP-42 has no
 * sign-out, so a fresh, anonymous connection is the only way back, and the next
 * read opens one. Relays that challenge without refusing anything are left
 * alone: no prompt, and no pubkey handed to a relay that did not need it.
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
  pairwise,
  shareReplay,
  startWith,
  type Observable,
} from "rxjs";
import type { EventTemplate, NostrEvent } from "nostr-tools";
import type { Relay, RelayPool } from "applesauce-relay";
import type { IAccount } from "applesauce-accounts";
import { normalizeURL } from "applesauce-core/helpers/url";

type AuthPool = Pick<RelayPool, "relays" | "add$" | "remove$" | "remove">;
type ActiveAccount = Pick<IAccount, "pubkey" | "signEvent">;

const interactive$ = new BehaviorSubject(false);
/** The reader is in Messages: a login may ask them to unlock. */
export function setRelayAuthInteractive(on: boolean): void {
  if (interactive$.value !== on) interactive$.next(on);
}

/**
 * Why a relay's login didn't happen: the reader's signer said no, the relay
 * refused the login it was sent, or it didn't go through at all.
 */
export type RelayAuthProblem = { by: "signer" } | { by: "relay"; message?: string } | { by: "error"; message?: string };

// Per account, then per relay: a "no" is that account's, and still there when the reader switches back.
const records = new Map<string, Map<string, RelayAuthProblem>>();
let recordsFor: string | undefined;
const problems$ = new BehaviorSubject<ReadonlyMap<string, RelayAuthProblem>>(new Map());
const showRecords = () => problems$.next(new Map(recordsFor ? records.get(recordsFor) : undefined));

function problemOf(pubkey: string, url: string): RelayAuthProblem | undefined {
  return records.get(pubkey)?.get(url);
}
function setProblem(pubkey: string, url: string, problem: RelayAuthProblem | undefined) {
  const mine = records.get(pubkey);
  if (!problem && !mine?.has(url)) return;
  if (problem) {
    if (mine) mine.set(url, problem);
    else records.set(pubkey, new Map([[url, problem]]));
  } else mine!.delete(url);
  if (pubkey === recordsFor) showRecords();
}

/** The active account's relays whose login didn't happen, by normalized URL. */
export const relayAuthProblems$: Observable<ReadonlyMap<string, RelayAuthProblem>> = problems$.asObservable();
export function relayAuthProblems(): ReadonlyMap<string, RelayAuthProblem> {
  return problems$.value;
}
/** The record for `url`, in whatever spelling it comes. */
export function relayAuthProblemFor(
  problems: ReadonlyMap<string, RelayAuthProblem>,
  url: string,
): RelayAuthProblem | undefined {
  return problems.get(normalizeURL(url));
}

const askAgain$ = new Subject<string | undefined>();
/** The reader asked for another go at a login that didn't happen — on `url`, or on every relay that has one. */
export function askRelayAuthAgain(url?: string): void {
  const mine = recordsFor ? records.get(recordsFor) : undefined;
  const which = url === undefined ? undefined : normalizeURL(url);
  if (mine?.size) {
    if (which === undefined) mine.clear();
    else mine.delete(which);
    showRecords();
  }
  askAgain$.next(which);
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).trim() || undefined;

export function startRelayAuth<A extends ActiveAccount>({
  pool,
  active$,
  canSignQuietly = async () => true,
  sign = (account, draft) => account.signEvent(draft) as Promise<NostrEvent>,
  isRejection = () => true,
}: {
  pool: AuthPool;
  active$: Observable<A | undefined>;
  /** Whether signing now raises no modal of ours (accounts/signing canSignSilently). */
  canSignQuietly?: (account: A) => Promise<boolean>;
  /** Signs the login event as `account` (accounts/signing signAs). */
  sign?: (account: A, draft: EventTemplate) => Promise<NostrEvent>;
  /** Whether a signing error is the signer saying no (accounts/signing signerSaidNo). */
  isRejection?: (error: unknown) => boolean;
}): () => void {
  // Who answers a challenge right now: the active account, whoever it is.
  const signer$: Observable<A | undefined> = active$.pipe(
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  let current: A | undefined;
  const watched = new Map<Relay, Subscription>();

  const forget = (relay: Relay) => {
    watched.get(relay)?.unsubscribe();
    watched.delete(relay);
  };
  const drop = (relay: Relay) => {
    forget(relay);
    pool.remove(relay);
  };

  // Before any relay's watcher, so each sees the account and the records it is about to act on.
  const signerSub = signer$.subscribe((signer) => {
    current = signer;
    if (signer?.pubkey !== recordsFor) {
      recordsFor = signer?.pubkey;
      showRecords();
    }
  });
  // Opening Messages is another go at every login that merely didn't go through.
  const reopenSub = interactive$.pipe(startWith(false), pairwise()).subscribe(([was, now]) => {
    const mine = recordsFor ? records.get(recordsFor) : undefined;
    if (!now || was || !mine) return;
    let cleared = false;
    for (const [url, problem] of mine)
      if (problem.by === "error") {
        mine.delete(url);
        cleared = true;
      }
    if (cleared) showRecords();
  });

  const watch = (relay: Relay) => {
    if (watched.has(relay)) return;
    const sub = new Subscription();
    watched.set(relay, sub);
    const url = normalizeURL(relay.url);
    // Challenges answered, or being answered, on this connection — gone with it.
    const answered = new Set<string>();
    type Inputs = [string | null, boolean, boolean, A | undefined, boolean];
    let last: Inputs | undefined;

    const evaluate = ([challenge, read, publish, account, interactive]: Inputs) => {
      const signedInAs = relay.authenticatedAs;
      if (signedInAs && signedInAs !== account?.pubkey) return drop(relay);
      // Only a relay that refused something: no prompt, and no pubkey, for one that didn't need it.
      if (!challenge || !account || signedInAs || !(read || publish)) return;
      // Refused, or failed: waits for the reader (or for Messages to open), whatever the challenge.
      if (problemOf(account.pubkey, url)) return;
      const key = `${account.pubkey} ${challenge}`;
      if (answered.has(key)) return;
      answered.add(key);
      let saidNo = false;
      // The account, with the signer's "no" told apart from everything after it.
      const asking = {
        pubkey: account.pubkey,
        signEvent: async (draft: EventTemplate) => {
          try {
            return await sign(account, draft);
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
        // Another account became active while this one was signing in: that login is not theirs to keep.
        if (current?.pubkey !== account.pubkey) {
          if (relay.authenticatedAs === account.pubkey) drop(relay);
          return;
        }
        if (answer?.ok !== false) return setProblem(account.pubkey, url, undefined);
        answered.delete(key);
        const message = answer.message?.trim() || undefined;
        // The library's own wait running out comes back dressed as the relay's answer.
        setProblem(
          account.pubkey,
          url,
          message === "Timeout" ? { by: "error", message: "the relay didn't answer" } : { by: "relay", message },
        );
      })().catch((error: unknown) => {
        answered.delete(key);
        setProblem(account.pubkey, url, saidNo ? { by: "signer" } : { by: "error", message: reasonOf(error) });
      });
    };

    sub.add(
      combineLatest([
        relay.challenge$,
        // The library re-emits `true` on every refused REQ: only a change is news.
        relay.authRequiredForRead$.pipe(distinctUntilChanged()),
        relay.authRequiredForPublish$.pipe(distinctUntilChanged()),
        signer$,
        interactive$,
      ]).subscribe((inputs) => {
        last = inputs;
        evaluate(inputs);
      }),
    );
    // Records are cleared by askRelayAuthAgain itself; this is the new attempt.
    sub.add(
      askAgain$.subscribe((which) => {
        if ((which === undefined || which === url) && last) evaluate(last);
      }),
    );
  };

  for (const relay of pool.relays.values()) watch(relay);
  const addSub = pool.add$.subscribe(watch);
  const removeSub = pool.remove$.subscribe(forget);

  return () => {
    signerSub.unsubscribe();
    reopenSub.unsubscribe();
    addSub.unsubscribe();
    removeSub.unsubscribe();
    for (const relay of [...watched.keys()]) forget(relay);
    current = undefined;
    records.clear();
    recordsFor = undefined;
    showRecords();
  };
}
