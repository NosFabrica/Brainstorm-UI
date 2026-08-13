/**
 * Relay reads, over the pool's own machinery.
 *
 * Sixteen call sites in `services/nostr.ts` each hand-rolled the same three
 * things: a `setTimeout` racing the request, a `try { eventStore.add } catch {}`
 * per event, and a de-dupe Map. The pool does all three. Worse, the racing form
 * leaked — when the timer won, nothing unsubscribed the request observable, so
 * the REQ stayed open until EOSE.
 *
 * Three shapes, because the sites genuinely want three different things:
 * whichever answer arrives first, the newest answer across relays, or all of
 * them. They differ in how the deadline is spent, which is the whole reason this
 * isn't one function with flags.
 */
import { EMPTY, catchError, lastValueFrom, map, reduce, scan, take, takeUntil, takeWhile, timer } from "rxjs";
import type { NostrEvent } from "nostr-tools";

import { pool } from "./relayPool";
import { eventStore } from "./eventStore";

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
