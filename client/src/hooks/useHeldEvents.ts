import { useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { readProfileRows } from "@/lib/eventCache";

/** A replaceable event's coordinate. `identifier` is the d-tag; none for kind 0. */
export interface Coordinate {
  kind: number;
  pubkey: string;
  identifier?: string;
}

/** `kind:pubkey:d`, the key `fetchAddressableEvents` hands its results back under. */
export const coordKey = (c: Coordinate) => `${c.kind}:${c.pubkey}:${c.identifier ?? ""}`;

const coordOf = (event: NostrEvent) => `${event.kind}:${event.pubkey}:${event.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;

/** NIP-01: newer wins, and on a tie the lexicographically lower id wins. */
export function newerEvent<E extends { id: string; created_at: number }>(a: E | undefined, b: E | undefined): E | undefined {
  if (!a || !b) return a ?? b;
  if (a.created_at !== b.created_at) return a.created_at > b.created_at ? a : b;
  return a.id < b.id ? a : b;
}

const NONE: Map<string, NostrEvent> = new Map();

/**
 * The newest copy this device holds of each coordinate, kept current.
 *
 * What renders first: the memory store's copy, then — for profiles — the
 * device's own, however old (lib/eventCache). After that, every version the
 * store receives: fetches add each relay's answer as it arrives, so the first
 * relay to reply is on screen before the slowest one finishes, and an edit
 * that lands later replaces what is shown. An older version never displaces a
 * newer one.
 *
 * This only listens; asking the relays stays with the caller, which knows the
 * relay hints. `insert$` rather than `eventStore.replaceable()`, because the
 * model falls back to the store's own loader on a miss — a second fetch racing
 * the caller's.
 */
export function useHeldReplaceables(coords: Coordinate[]): Map<string, NostrEvent> {
  const keys = useMemo(() => Array.from(new Set(coords.map(coordKey))).sort(), [coords]);
  const keysId = keys.join("\n");
  // Tagged with the keys it answers for. On the render where the keys change
  // (another profile, another article) the state still holds the old ones, so
  // that render reads the store directly instead: a held copy never flashes
  // "not found" for a frame before the effect catches up.
  const [state, setState] = useState(() => ({ id: keysId, held: readStore(keys) }));
  const fresh = useMemo(() => (state.id === keysId ? null : readStore(keys)), [state.id, keysId, keys]);
  const held = fresh ?? state.held;

  useEffect(() => {
    if (!keys.length) {
      setState({ id: keysId, held: NONE });
      return;
    }
    let alive = true;
    const wanted = new Set(keys);
    const kinds = new Set(keys.map((k) => Number(k.split(":")[0])));
    const authors = new Set(keys.map((k) => k.split(":")[1]));
    const take = (events: NostrEvent[]) => {
      // Filtered before any state update: the store inserts hundreds of events
      // a second while a feed loads, and every hook instance hears all of them.
      const mine = events.filter((e) => kinds.has(e.kind) && authors.has(e.pubkey) && wanted.has(coordOf(e)));
      if (!alive || !mine.length) return;
      setState((current) => {
        const base = current.id === keysId ? current.held : readStore(keys);
        let next: Map<string, NostrEvent> | null = null;
        for (const event of mine) {
          const key = coordOf(event);
          const had = (next ?? base).get(key);
          if (newerEvent(event, had) === had) continue;
          next ??= new Map(base);
          next.set(key, event);
        }
        return next ? { id: keysId, held: next } : current.id === keysId ? current : { id: keysId, held: base };
      });
    };

    setState((current) => (current.id === keysId ? current : { id: keysId, held: readStore(keys) }));
    const sub = eventStore.insert$.subscribe((event) => take([event]));

    // Profiles the memory store doesn't have may still be on the device; they
    // arrive through the store, like any other copy.
    loadFromDevice(keys.filter((k) => k.startsWith("0:")).map((k) => k.split(":")[1]));
    return () => {
      alive = false;
      sub.unsubscribe();
    };
    // keysId is `keys`, as a value: a new array with the same coordinates is not a new subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysId]);

  return held;
}

/** One coordinate's newest held copy, kept current — see `useHeldReplaceables`. */
export function useHeldReplaceable(kind: number, pubkey: string | undefined, identifier?: string): NostrEvent | undefined {
  const coords = useMemo(() => (pubkey ? [{ kind, pubkey, identifier }] : []), [kind, pubkey, identifier]);
  return useHeldReplaceables(coords).get(coordKey({ kind, pubkey: pubkey ?? "", identifier }));
}

/** Pubkeys whose device copy has been looked for this session. */
const deviceChecked = new Set<string>();

/**
 * Put the device's copy of these profiles into the memory store, however old.
 *
 * Into the STORE, not one hook's state: a page mounts dozens of these hooks
 * over the same people, and once a copy is in memory every one of them — and
 * every later mount — has it without another IndexedDB read. Each pubkey is
 * looked for once a session: a copy the device lacks now can only arrive
 * through the store, and the store is where the device's copies are written
 * from. The store verifies the signature on the way in, as the author queue's
 * copies are.
 */
function loadFromDevice(pubkeys: string[]): void {
  const todo = pubkeys.filter((pk) => !deviceChecked.has(pk) && !eventStore.getReplaceable(0, pk));
  if (!todo.length) return;
  todo.forEach((pk) => deviceChecked.add(pk));
  readProfileRows(todo)
    .then((rows) => {
      for (const row of rows.values()) {
        try {
          eventStore.add(row.event);
        } catch {
          /* a bad row is simply not shown */
        }
      }
    })
    .catch(() => {});
}

/** Test seam. */
export function __resetDeviceChecks(): void {
  deviceChecked.clear();
}

function readStore(keys: string[]): Map<string, NostrEvent> {
  const out = new Map<string, NostrEvent>();
  for (const key of keys) {
    const [kind, pubkey, ...rest] = key.split(":");
    const event = eventStore.getReplaceable(Number(kind), pubkey, rest.join(":") || undefined);
    if (event) out.set(key, event);
  }
  return out.size ? out : NONE;
}
