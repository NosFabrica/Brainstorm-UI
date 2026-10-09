/**
 * The events rows point at — a highlight's article, its note — asked for in
 * one batch per page, as components/search/AllResults asks for its rows'
 * references: everything asked within a short window goes out as one ask by
 * id and one by address, not a REQ per row. Answers land in the event store,
 * where each row's live read (useStoreEvents) picks its own up; each ask also
 * gets its own events back, for the copies the store did not keep.
 *
 * A tag's relay hint is asked beside the default relays, never instead of
 * them: a dead hint must not leave the row waiting on it alone.
 */
import type { NostrEvent } from "nostr-tools";
import { HEX64, type ResultRef } from "@/lib/resultReaders";
import { PROFILE_RELAYS } from "@/lib/relays";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";

type Coord = { kind: number; pubkey: string; identifier: string; relays?: string[] };

/** A ref's `kind:pubkey:d` address, read; null when it is not one. */
export function coordOfAddr(addr: string): Omit<Coord, "relays"> | null {
  const [kind, pubkey, ...rest] = addr.split(":");
  const k = Number(kind);
  return Number.isInteger(k) && HEX64.test(pubkey ?? "")
    ? { kind: k, pubkey: pubkey.toLowerCase(), identifier: rest.join(":") }
    : null;
}

const WINDOW_MS = 50;

let ids = new Map<string, string | undefined>();
let coords = new Map<string, Coord>();
type Answer = { byId: Map<string, NostrEvent>; byCoord: Map<string, NostrEvent> };
let waiting: ((answer: Answer) => void)[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

const isRelay = (r: string | undefined): r is string => !!r && /^wss?:\/\//i.test(r);

async function flush(): Promise<void> {
  const askIds = ids;
  const askCoords = coords;
  const done = waiting;
  ids = new Map();
  coords = new Map();
  waiting = [];
  timer = undefined;
  const hints = [...new Set([...askIds.values()].filter(isRelay))];
  const [byIds, byCoords] = await Promise.allSettled([
    askIds.size ? fetchEventsByIds([...askIds.keys()], [...hints, ...PROFILE_RELAYS]) : [],
    askCoords.size ? fetchAddressableEvents([...askCoords.values()]) : new Map<string, NostrEvent>(),
  ]);
  const answer: Answer = {
    byId: new Map(byIds.status === "fulfilled" ? byIds.value.map((e) => [e.id, e]) : []),
    byCoord: byCoords.status === "fulfilled" ? byCoords.value : new Map(),
  };
  done.forEach((resolve) => resolve(answer));
}

/** The event a ref names, asked in the page's batch: what that batch found for it, once it has answered. */
export function fetchRefBatched(ref: ResultRef): Promise<NostrEvent[]> {
  const coord = ref.addr ? coordOfAddr(ref.addr) : null;
  const id = !coord && ref.id && HEX64.test(ref.id) ? ref.id.toLowerCase() : null;
  const key = coord ? `${coord.kind}:${coord.pubkey}:${coord.identifier}` : null;
  if (coord && key) coords.set(key, { ...coord, relays: isRelay(ref.relay) ? [ref.relay] : coords.get(key)?.relays });
  else if (id) ids.set(id, isRelay(ref.relay) ? ref.relay : ids.get(id));
  else return Promise.resolve([]);
  const mine = new Promise<NostrEvent[]>((resolve) =>
    waiting.push((answer) => {
      const found = key ? answer.byCoord.get(key) : answer.byId.get(id!);
      resolve(found ? [found] : []);
    }),
  );
  if (!timer) timer = setTimeout(() => void flush(), WINDOW_MS);
  return mine;
}
