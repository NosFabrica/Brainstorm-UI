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
  const [held, setHeld] = useState<Map<string, NostrEvent>>(() => readStore(keys));

  useEffect(() => {
    if (!keys.length) {
      setHeld(NONE);
      return;
    }
    let alive = true;
    const wanted = new Set(keys);
    const take = (events: NostrEvent[]) => {
      if (!alive) return;
      setHeld((current) => {
        let next: Map<string, NostrEvent> | null = null;
        for (const event of events) {
          const key = coordOf(event);
          if (!wanted.has(key)) continue;
          const had = (next ?? current).get(key);
          if (newerEvent(event, had) === had) continue;
          next ??= new Map(current);
          next.set(key, event);
        }
        return next ?? current;
      });
    };

    setHeld(readStore(keys));
    const sub = eventStore.insert$.subscribe((event) => take([event]));

    // Profiles the memory store doesn't have may still be on the device.
    const profiles = keys.filter((k) => k.startsWith("0:") && !eventStore.getReplaceable(0, k.split(":")[1]));
    if (profiles.length) {
      readProfileRows(profiles.map((k) => k.split(":")[1]))
        .then((rows) => take([...rows.values()].map((row) => row.event)))
        .catch(() => {});
    }
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

function readStore(keys: string[]): Map<string, NostrEvent> {
  const out = new Map<string, NostrEvent>();
  for (const key of keys) {
    const [kind, pubkey, ...rest] = key.split(":");
    const event = eventStore.getReplaceable(Number(kind), pubkey, rest.join(":") || undefined);
    if (event) out.set(key, event);
  }
  return out.size ? out : NONE;
}
