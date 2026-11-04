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
/**
 * At most this many references go in one ask: a `#d` or `ids` list a relay
 * takes, answered under its result cap. A book's contents drawn together can
 * gather a thousand in one window.
 */
const ASK_SIZE = 100;
/**
 * At most this many distinct relay hints are dialled per flush. A hint is
 * whoever published the reference's to write; a page of them, each naming
 * its own relay, would open a socket per reference — each one learning who
 * is reading.
 */
const MAX_HINTS = 8;

const inAsks = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / ASK_SIZE) }, (_, i) => items.slice(i * ASK_SIZE, (i + 1) * ASK_SIZE));

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
  const allowed = new Set<string>();
  for (const hint of [...askIds.values(), ...[...askCoords.values()].flatMap((c) => c.relays ?? [])])
    if (isRelay(hint) && allowed.size < MAX_HINTS) allowed.add(hint);
  // Each ask is sent to its own references' hints, among those allowed.
  const hints = [...new Set([...askIds.values()].filter((r): r is string => !!r && allowed.has(r)))];
  const capped = [...askCoords.values()].map((c) => ({ ...c, relays: c.relays?.filter((r) => allowed.has(r)) }));
  const [byIds, byCoords] = await Promise.all([
    Promise.allSettled(inAsks([...askIds.keys()]).map((part) => fetchEventsByIds(part, [...hints, ...PROFILE_RELAYS]))),
    Promise.allSettled(inAsks(capped).map((part) => fetchAddressableEvents(part))),
  ]);
  const answer: Answer = {
    byId: new Map(byIds.flatMap((r) => (r.status === "fulfilled" ? r.value.map((e) => [e.id, e] as const) : []))),
    byCoord: new Map(byCoords.flatMap((r) => (r.status === "fulfilled" ? [...r.value] : []))),
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
