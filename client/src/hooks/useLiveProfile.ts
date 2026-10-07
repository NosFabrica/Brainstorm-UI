import { useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { fetchProfileMap, refreshProfileEvent } from "@/services/nostr";
import { profileContentOf } from "@/lib/profileContent";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks, claim, inFlightFor, isDue, track } from "@/lib/askOnce";
import { newerEvent, useHeldReplaceable, useHeldReplaceables } from "@/hooks/useHeldEvents";

/**
 * How long one ask for a person's profile covers every hook that shows them:
 * 10–15 minutes, picked per ask so a page of hundreds asked together doesn't
 * come due together.
 */
const ASK_WINDOW = { minMs: 10 * 60_000, spreadMs: 5 * 60_000 };
const askKey = (pubkey: string) => `profile:${pubkey}`;

/**
 * The people here due an ask, claimed. Only an ask that FOUND something covers
 * the next mount: someone still not in the store is asked again.
 */
function claimDue(pubkeys: string[]): string[] {
  const due = pubkeys.filter(
    (pk) => !inFlightFor(askKey(pk)) && (isDue(askKey(pk)) || !eventStore.getReplaceable(0, pk)),
  );
  due.forEach((pk) => claim(askKey(pk), ASK_WINDOW));
  return due;
}

const trackProfiles = <T>(pubkeys: string[], ask: Promise<T>) => track(pubkeys.map(askKey), ask);

/** Test seam. */
export function __resetAskedProfiles(): void {
  __resetAsks();
  if (batch) {
    clearTimeout(batch.quiet);
    clearTimeout(batch.max);
  }
  queued = new Set();
  batch = null;
}

/** Start the ask a profile page would make on mount, ahead of it — e.g. on a search click. */
export function warmProfile(pubkey: string, relayHints: string[] = []): void {
  askOnce(pubkey, relayHints);
}

function askOnce(pubkey: string, relayHints: string[]): Promise<unknown> | undefined {
  return claimDue([pubkey]).length
    ? trackProfiles(
        [pubkey],
        refreshProfileEvent(pubkey, { relayHints }).catch(() => null),
      )
    : inFlightFor(askKey(pubkey));
}

/**
 * Someone's profile, live: whatever copy the device holds, at once and however
 * old, while the relays — the `nprofile`'s hints among them — are asked for a
 * newer one, which replaces it as it lands.
 *
 * `loading` is true only while nothing is held AND the first ask is out. Once
 * it settles empty, `profile` is undefined and `loading` false: "no profile".
 */
export function useLiveProfile(
  pubkey: string | undefined,
  relayHints: string[] = [],
): { event: NostrEvent | undefined; profile: ProfileContent | undefined; loading: boolean } {
  const held = useHeldReplaceable(0, pubkey || undefined);
  const hintsKey = relayHints.join(",");
  // The ask's own answer, for a copy the store refused.
  const [answer, setAnswer] = useState<{ pubkey: string; event?: NostrEvent }>();

  useEffect(() => {
    if (!pubkey) return;
    let alive = true;
    // A joined list ask answers with a map, not an event; its copies are in the store.
    const done = (found?: unknown) => {
      const event = (found as NostrEvent | null)?.pubkey === pubkey ? (found as NostrEvent) : undefined;
      if (alive) setAnswer({ pubkey, event });
    };
    const pending = askOnce(pubkey, relayHints);
    if (pending) pending.then(done, () => done());
    else done();
    return () => {
      alive = false;
    };
    // hintsKey is `relayHints`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, hintsKey]);

  const settled = answer?.pubkey === pubkey ? answer : undefined;
  const event = newerEvent(settled?.event, held);
  const profile = useMemo(() => profileContentOf(event), [event]);
  return { event, profile, loading: !!pubkey && !event && !settled };
}

const NO_PROFILES: Map<string, ProfileContent> = new Map();

/**
 * Lists of people are asked for together. Names arriving over a second or so —
 * a thread's replies streaming in — would otherwise leave as one small batch
 * each, and every batch costs a search ask plus relay-list warm-ups. Each
 * request waits for a short quiet spell, capped, then everyone queued goes out
 * as one `fetchProfileMap`.
 */
const LIST_QUIET_MS = 250;
const LIST_MAX_WAIT_MS = 1000;
let queued = new Set<string>();
let batch: {
  promise: Promise<unknown>;
  resolve: (m: unknown) => void;
  quiet?: ReturnType<typeof setTimeout>;
  max: ReturnType<typeof setTimeout>;
} | null = null;

function flushProfiles(): void {
  if (!batch) return;
  const { resolve, quiet, max } = batch;
  clearTimeout(quiet);
  clearTimeout(max);
  const due = claimDue([...queued]);
  queued = new Set();
  batch = null;
  if (!due.length) return resolve(new Map());
  trackProfiles(due, fetchProfileMap(due, undefined, { warm: false })).then(resolve, () => resolve(new Map()));
}

function queueProfiles(pubkeys: string[]): Promise<unknown> {
  if (!pubkeys.length) return Promise.resolve(new Map());
  pubkeys.forEach((pk) => queued.add(pk));
  if (!batch) {
    let resolve!: (m: unknown) => void;
    const promise = new Promise((r) => (resolve = r));
    batch = { promise, resolve, max: setTimeout(flushProfiles, LIST_MAX_WAIT_MS) };
  }
  clearTimeout(batch.quiet);
  batch.quiet = setTimeout(flushProfiles, LIST_QUIET_MS);
  return batch.promise;
}

/**
 * Names and avatars for a list of people — the ones a note mentions, a
 * thread's repliers, a face pile. Every held copy renders at once, however
 * old; the rest are asked for in one batch (fetchProfileMap), and any newer
 * copy that reaches the store later — the author queue re-asking after a copy
 * over an hour old, a search result, the person's own edit — replaces the
 * name on screen rather than waiting for the next visit.
 *
 * The queue decides who is re-asked: a copy learned within the hour was just
 * fetched, and a page of notes is too many people to re-ask on every render.
 * Each person is asked about once per 10–15 minutes however many lists show
 * them (claimDue).
 */
export function useLiveProfiles(pubkeys: string[]): Map<string, ProfileContent> {
  const unique = useMemo(
    () => Array.from(new Set(pubkeys.filter((pk) => /^[0-9a-f]{64}$/i.test(pk)))).sort(),
    [pubkeys],
  );
  const key = unique.join(",");
  const coords = useMemo(() => unique.map((pubkey) => ({ kind: 0, pubkey })), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = useHeldReplaceables(coords);

  // Only a copy the store refused ever needs this map; it accumulates rather
  // than resetting, so a growing list never blanks a name it already had.
  const [fetched, setFetched] = useState<Map<string, ProfileContent>>(NO_PROFILES);
  useEffect(() => {
    if (!key) return;
    const pubkeys = key.split(",");
    const joined = new Set(pubkeys.map((pk) => inFlightFor(askKey(pk))).filter((ask) => !!ask));
    let alive = true;
    const take = (found: unknown) => {
      if (!alive || !(found instanceof Map) || !found.size) return;
      setFetched((current) => new Map([...current, ...(found as Map<string, ProfileContent>)]));
    };
    // Asks already out for some of these people answer this list too.
    joined.forEach((ask) => ask.then(take, () => {}));
    queueProfiles(pubkeys.filter((pk) => !inFlightFor(askKey(pk)))).then(take, () => {});
    return () => {
      alive = false;
    };
  }, [key]);

  return useMemo(() => {
    if (!key) return NO_PROFILES;
    const out = new Map<string, ProfileContent>();
    for (const pubkey of unique) {
      // The store's copy is the newest seen (every fetch lands there); the
      // fetched map only covers a copy the store refused.
      const content = profileContentOf(held.get(`0:${pubkey}:`)) ?? fetched.get(pubkey);
      if (content) out.set(pubkey, content);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, held, fetched]);
}
