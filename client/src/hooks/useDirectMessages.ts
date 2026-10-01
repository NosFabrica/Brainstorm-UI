/**
 * React's view of private messages: the Active Account's DmEngine
 * (services/dm), its rooms, and the reader's shelving of them.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { dmEngine, subscribeDmEngine } from "@/services/dm";
import type { DmEngine, DmEngineState } from "@/services/dm/engine";
import type { DmRoom } from "@/lib/dm/store";
import { readDmPrefs, subscribeDmPrefs, type DmPrefs } from "@/lib/dm/prefs";
import { shelve, type Shelves } from "@/lib/dm/inbox";
import { settledTrustSignals } from "@/services/trustSignals";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useMyFollows } from "@/hooks/useMyFollows";

export function useDmEngine(): DmEngine | null {
  return useSyncExternalStore(subscribeDmEngine, dmEngine, () => null);
}

const IDLE: DmEngineState = {
  status: "stopped",
  inboxRelays: [],
  live: {},
  liveSynced: false,
  floor: 0,
  queued: 0,
  failed: 0,
  history: { floor: 0, relays: [], loading: false, exhausted: true, complete: false },
};

export function useDmState(engine: DmEngine | null): DmEngineState {
  // Stable per engine: a new subscribe function each render makes React
  // resubscribe on every commit, and with a store that changes per message
  // that turns into a synchronous re-render loop.
  const subscribe = useCallback((l: () => void) => (engine ? engine.subscribe(l) : () => {}), [engine]);
  return useSyncExternalStore(
    subscribe,
    () => engine?.state() ?? IDLE,
    () => IDLE,
  );
}

const NO_ROOMS: DmRoom[] = [];

export function useDmRooms(engine: DmEngine | null): DmRoom[] {
  const subscribe = useCallback((l: () => void) => (engine ? engine.store.subscribe(l) : () => {}), [engine]);
  return useSyncExternalStore(
    subscribe,
    () => engine?.store.rooms() ?? NO_ROOMS,
    () => NO_ROOMS,
  );
}

export function useDmRoom(engine: DmEngine | null, key: string | null): DmRoom | undefined {
  const rooms = useDmRooms(engine);
  return useMemo(() => (key ? rooms.find((r) => r.key === key) : undefined), [rooms, key]);
}

const NO_PREFS_KEY = "";

export function useDmPrefs(pubkey: string | undefined): DmPrefs {
  return useSyncExternalStore(
    subscribeDmPrefs,
    () => readDmPrefs(pubkey ?? NO_PREFS_KEY),
    () => readDmPrefs(NO_PREFS_KEY),
  );
}

/** Rooms sorted onto the shelves the inbox shows, with the trust that put them there. */
export function useShelves(
  engine: DmEngine | null,
  mutedOf?: (pk: string) => boolean,
): Shelves & { scoreOf: (pk: string) => number | null | undefined } {
  const rooms = useDmRooms(engine);
  const me = engine?.pubkey ?? "";
  const prefs = useDmPrefs(me || undefined);
  const { follows } = useMyFollows();
  const people = useMemo(
    () => [...new Set(rooms.flatMap((r) => r.participants.filter((pk) => pk !== me)))],
    [rooms, me],
  );
  const scoreOf = useAuthorScores(people);
  const shelves = useMemo(
    () =>
      shelve(rooms, me, prefs, {
        follows,
        scoreOf,
        flaggedOf: (pk) => settledTrustSignals(pk)?.flagged ?? false,
        mutedOf,
      }),
    // scoreOf is a fresh function each render once scores land; rooms/prefs/follows drive the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms, me, prefs, follows, mutedOf, people.map((pk) => scoreOf(pk)).join(",")],
  );
  return { ...shelves, scoreOf };
}

/**
 * The header badge: unread in chats plus new requests. `sealed` counts wraps
 * that arrived but wait for the reader to open Messages (an external signer
 * opens nothing unasked), shown as a dot rather than a number we can't know.
 */
export function useDmBadge(): { count: number; sealed: boolean } {
  const engine = useDmEngine();
  const { badge } = useShelves(engine);
  const state = useDmState(engine);
  return { count: badge, sealed: state.paused === "waiting" && state.queued > 0 };
}
