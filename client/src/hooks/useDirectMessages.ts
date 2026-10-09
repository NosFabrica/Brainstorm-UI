/**
 * React's view of private messages: the Active Account's DmEngine
 * (services/dm), its rooms, and the reader's shelving of them.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { dmEngine, subscribeDmEngine } from "@/services/dm";
import type { DmEngine, DmEngineState } from "@/services/dm/engine";
import type { DmRoom } from "@/lib/dm/store";
import { readDmPrefs, subscribeDmPrefs, type DmPrefs } from "@/lib/dm/prefs";
import { shelve, type Shelves } from "@/lib/dm/inbox";
import { settledTrustSignals } from "@/services/trustSignals";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useMyFollows } from "@/hooks/useMyFollows";
import { fetchMuteList, getMutedPubkeys } from "@/services/socialActions";

export function useDmEngine(): DmEngine | null {
  return useSyncExternalStore(subscribeDmEngine, dmEngine, () => null);
}

const IDLE: DmEngineState = {
  status: "stopped",
  inboxRelays: [],
  live: {},
  liveSynced: false,
  liveSettled: false,
  sendAuth: [],
  floor: 0,
  queued: 0,
  failed: 0,
  setAside: 0,
  downloading: false,
  sync: { received: {}, opened: 0 },
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

/**
 * People on the reader's mute list — the same query (and optimistic updates)
 * as useSocialActions, so muting someone anywhere takes their chats away here.
 */
export function useMutedPeople(me: string): (pk: string) => boolean {
  const mutes = useStoreReplaceable(10000, me || null, () => fetchMuteList(me));
  const data = mutes.event;

  return useMemo(() => {
    const set = getMutedPubkeys(data ?? null);
    return (pk: string) => set.has(pk);
  }, [data]);
}

export type ShelvesView = Shelves & { scoreOf: (pk: string) => number | null | undefined };

function useComputedShelves(engine: DmEngine | null): ShelvesView {
  const rooms = useDmRooms(engine);
  const me = engine?.pubkey ?? "";
  const mutedOf = useMutedPeople(me);
  const prefs = useDmPrefs(me || undefined);
  const { follows } = useMyFollows();
  const people = useMemo(
    () => [...new Set(rooms.flatMap((r) => r.participants.filter((pk) => pk !== me)))],
    [rooms, me],
  );
  const scoreOf = useAuthorScores(people);
  // Loading, unrated and scored are three different answers: an unrated stranger
  // settling must move them (to Low, or Flagged), so the key tells them apart.
  const trustKey = people
    .map((pk) => {
      const s = scoreOf(pk);
      return `${s === undefined ? "?" : s === null ? "-" : s}${settledTrustSignals(pk)?.flagged ? "!" : ""}`;
    })
    .join(",");
  return useMemo(
    () => ({
      ...shelve(rooms, me, prefs, {
        follows,
        scoreOf,
        flaggedOf: (pk) => settledTrustSignals(pk)?.flagged ?? false,
        mutedOf,
      }),
      scoreOf,
    }),
    // scoreOf is a fresh function each render once scores land; trustKey says when its answers changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms, me, prefs, follows, mutedOf, trustKey],
  );
}

const ShelvesContext = createContext<ShelvesView | null>(null);

/**
 * Shelving once for the whole app: the header badge, the tab bar, notifications
 * and Messages itself all read the same answer instead of each recomputing it
 * (and each looking up every correspondent's trust) on every change.
 */
export function DmShelvesProvider({ children }: { children: ReactNode }) {
  const value = useComputedShelves(useDmEngine());
  return createElement(ShelvesContext.Provider, { value }, children);
}

/** Rooms sorted onto the shelves the inbox shows, with the trust that put them there. */
export function useShelves(engine: DmEngine | null): ShelvesView {
  const shared = useContext(ShelvesContext);
  // Outside the provider (tests, a stray mount) compute here; inside, this costs nothing.
  const local = useComputedShelves(shared ? null : engine);
  return shared ?? local;
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
