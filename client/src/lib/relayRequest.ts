/**
 * Relay reads, over the pool's own machinery — its timeout, its de-duplication,
 * its teardown.
 *
 * Three shapes rather than one with flags: callers want the first answer, the
 * newest across relays, or all of them, and those differ in how the deadline is
 * spent.
 */
import { EMPTY, catchError, lastValueFrom, map, reduce, scan, take, takeUntil, takeWhile, tap, timer } from "rxjs";
import type { Observable } from "rxjs";
import type { NostrEvent } from "nostr-tools";

import { pool } from "./relayPool";
import { eventStore } from "./eventStore";
import { uniqueRelays } from "./relays";

/** What `pool.req` emits, per relay: the frames `pool.request` hides. */
type RelayMessage = { type?: string; from?: string; event?: unknown };

type Filter = Parameters<typeof pool.request>[1];

/**
 * `timeout` is `{ first: … }` inside the pool, not a total deadline — it fires
 * only if *nothing* arrives, which is exactly the dead-relay case every one of
 * these wants to give up on. Capping the overall collection window is a separate
 * job, and the collectors below do it with `takeUntil` so that what they already
 * gathered survives the deadline instead of being thrown away with an error.
 */
const options = (timeoutMs: number) => ({ timeout: timeoutMs, eventStore });

/** NIP-01: newer wins, and on a tie the lexicographically lower id wins. */
function beats(candidate: NostrEvent, incumbent: NostrEvent | undefined): boolean {
  if (!incumbent) return true;
  if (candidate.created_at !== incumbent.created_at) return candidate.created_at > incumbent.created_at;
  return candidate.id < incumbent.id;
}

/**
 * Whichever relay answers first, or undefined if none does in time.
 *
 * For a replaceable kind this can be a stale version — the store settles that,
 * since `add` returns the winning copy it already holds rather than the incoming
 * one. Where a call site cares enough to wait out the window for the true
 * newest, it wants `requestNewest` instead.
 */
export function requestOne(
  relays: string[],
  filter: Filter,
  timeoutMs: number,
): Promise<NostrEvent | undefined> {
  return lastValueFrom(
    pool.request(relays, filter, options(timeoutMs)).pipe(
      catchError(() => EMPTY),
      take(1),
    ),
    { defaultValue: undefined },
  );
}

/**
 * The newest event across every relay that answers inside the window.
 *
 * Addressable and replaceable kinds are the reason: different relays hold
 * different versions, and taking whichever answered first hydrates from an
 * arbitrary one. `reduce` emits once, on completion, so a source that fails or
 * finds nothing still yields the seed rather than throwing.
 */
export function requestNewest(
  relays: string[],
  filter: Filter,
  timeoutMs: number,
): Promise<NostrEvent | undefined> {
  return lastValueFrom(
    pool.request(relays, filter, options(timeoutMs)).pipe(
      catchError(() => EMPTY),
      takeUntil(timer(timeoutMs)),
      reduce<NostrEvent, NostrEvent | undefined>((best, event) => (beats(event, best) ? event : best), undefined),
    ),
  );
}

/**
 * The newest event from an UNTRUSTED relay — one the user typed, not one we
 * ship. Differs from `requestNewest` in exactly the two ways trust demands:
 *
 * - No `eventStore`. The store has no `verifyEvent` hook, so ingesting here
 *   would let a hostile relay plant forged replaceables (a fake kind-10002
 *   would even steer where we publish). The caller verifies, then `add`s.
 * - No `catchError`. A multi-relay fan-out shrugs off one dead relay; here the
 *   relay IS the query, and "couldn't connect" must reach the caller as a
 *   rejection, distinct from "connected, found nothing" (undefined).
 *
 * The collection cap sits at twice the first-event deadline on purpose: were
 * the two equal, a relay that never answers would race the pool's error against
 * the cap's graceful completion, and "dead" could read as "empty". The pool's
 * timeout always loses to the cap, so no-answer is reliably a rejection; the
 * cap only exists for a relay that keeps dribbling events without EOSE.
 */
export function requestNewestRaw(
  relays: string[],
  filter: Filter,
  timeoutMs: number,
): Promise<NostrEvent | undefined> {
  return lastValueFrom(
    pool.request(relays, filter, { timeout: timeoutMs }).pipe(
      takeUntil(timer(timeoutMs * 2)),
      reduce<NostrEvent, NostrEvent | undefined>((best, event) => (beats(event, best) ? event : best), undefined),
    ),
  );
}

/** Which relays a read asked, and which of them proved they answered. */
export interface RelayReach {
  asked: string[];
  /** Relays that reached EOSE. A relay that errored, or never spoke, is absent. */
  answered: string[];
}

/**
 * The newest event, plus who actually answered.
 *
 * The other shapes here cannot tell "no relay answered" from "the relays
 * answered and nobody has it", because `pool.request` turns a failed relay into
 * an ERROR message and then filters it away — even `requestNewestRaw`, whose
 * doc claims otherwise, resolves undefined against a dead host (verified
 * against a real relay, 2026-09-21). For most reads that is the right shrug.
 * For "does this key have a follow list yet?" the difference is the whole
 * answer: absence of evidence is not evidence of absence (issue #72).
 *
 * `pool.req` is the only API that surfaces the per-relay EOSE/ERROR frames, so
 * this shape listens to them directly. It therefore also has to feed the store
 * itself — `req` has no `eventStore` option to do it on the way past.
 */
export function requestNewestWithReach(
  relays: string[],
  filter: Filter,
  timeoutMs: number,
): Promise<{ newest: NostrEvent | undefined; reach: RelayReach }> {
  const asked = uniqueRelays(relays);
  const answered = new Set<string>();
  const settled = new Set<string>();
  let newest: NostrEvent | undefined;
  // The pool spells a relay its own way (a trailing slash it added, the host
  // lower-cased), so match on the same normalized form we asked with.
  const normalize = (url: unknown) => uniqueRelays([String(url ?? "")])[0] ?? "";

  return lastValueFrom(
    // `req` takes no deadline of its own — the `takeUntil` below is the only
    // thing that ends a relay that opens and then never speaks.
    (pool.req(relays, filter) as unknown as Observable<RelayMessage>).pipe(
      tap((message) => {
        const from = normalize(message?.from);
        if (message?.type === "EVENT" && message.event) {
          const stored = (eventStore.add(message.event as NostrEvent) ?? message.event) as NostrEvent;
          if (beats(stored, newest)) newest = stored;
        } else if (message?.type === "EOSE") {
          answered.add(from);
          settled.add(from);
        } else if (message?.type === "ERROR" || message?.type === "CLOSED") {
          settled.add(from);
        }
      }),
      // Every relay accounted for ends the read early; the deadline is the
      // backstop for the ones that simply never speak.
      takeWhile(() => asked.some((url) => !settled.has(url)), true),
      takeUntil(timer(timeoutMs)),
      catchError(() => EMPTY),
      reduce(() => undefined, undefined),
      map(() => undefined),
    ),
    { defaultValue: undefined },
  ).then(() => ({ newest, reach: { asked, answered: asked.filter((url) => answered.has(url)) } }));
}

/**
 * Every matching event, de-duped by id, until the relays are done or the window
 * closes — whichever comes first.
 *
 * `enough` is the early exit some callers have: asking for six events by id and
 * getting all six means there is nothing left to wait for. It sees the map as it
 * fills, and returning true completes the request there.
 */
export function requestAll(
  relays: string[],
  filter: Filter,
  timeoutMs: number,
  { enough }: { enough?: (collected: Map<string, NostrEvent>) => boolean } = {},
): Promise<NostrEvent[]> {
  return lastValueFrom(
    pool.request(relays, filter, options(timeoutMs)).pipe(
      catchError(() => EMPTY),
      takeUntil(timer(timeoutMs)),
      scan((collected, event) => collected.set(event.id, event), new Map<string, NostrEvent>()),
      // inclusive, so the event that satisfied `enough` is itself kept
      takeWhile((collected) => !enough?.(collected), true),
      map((collected) => Array.from(collected.values())),
    ),
    { defaultValue: [] as NostrEvent[] },
  );
}
