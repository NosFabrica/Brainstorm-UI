/**
 * Addressable events by address (`kind:pubkey:d`), live from the store (ADR
 * 0005): a listing's shipping options, a collection's products, a review's
 * product. One ask for all of them, store-first; a held copy draws at once
 * and a newer one replaces it. `settled` says the ask is back, so a page can
 * tell "still looking" from "not found" — and an ask keyed on what these
 * events name waits for it (CODING_STANDARDS: settled before dependents).
 *
 * Asks made within a short window go out together (`fetchAddressableBatched`):
 * a grid of cards that each name one address — the Reviews tab's product
 * reviews, each naming its product — is one request, not one per card.
 */
import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchAddressableEvents } from "@/services/nostr";
import { useHeldReplaceables } from "@/hooks/useHeldEvents";
import { capHints, mergeNewest } from "@/hooks/useNoteRefs";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { PROFILE_RELAYS } from "@/lib/relays";
import { addrCoord, parseATag, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";

const byCoord = (events: MinimalEvent[]) =>
  new Map(events.map((e) => [`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, e]));

// ——— The batching window (as services/trustSignals does for scores) ———

const BATCH_WINDOW_MS = 30;
/** `fetchAddressableEvents` asks a cross-product of kinds, authors and d-tags: keep it a size relays accept. */
const MAX_BATCH = 100;

/**
 * How many chunks are asked at once. Each chunk is a request to every profile
 * relay and up to 100 authors' outboxes: a big collection's 50 chunks at once
 * would sit far past the subscriptions a relay allows one connection, and the
 * refused ones would come back quietly empty.
 */
const CHUNK_LANES = 2;

/** `work` over `items`, at most `lanes` at a time; results in input order. */
async function inLanes<T, R>(items: T[], lanes: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, lane));
  return out;
}

interface Waiter {
  coords: string[];
  resolve: (events: NostrEvent[]) => void;
  reject: (error: unknown) => void;
}

let queued = new Map<string, AddressRef>();
let waiters: Waiter[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function flush(): void {
  flushTimer = undefined;
  const batch = [...queued.values()];
  const waiting = waiters;
  queued = new Map();
  waiters = [];
  const chunks: AddressRef[][] = [];
  for (let i = 0; i < batch.length; i += MAX_BATCH) chunks.push(batch.slice(i, i + MAX_BATCH));
  inLanes(chunks, CHUNK_LANES, (chunk) => fetchAddressableEvents(capHints(chunk), PROFILE_RELAYS)).then(
    (answers) => {
      const found = new Map<string, NostrEvent>();
      for (const answer of answers) for (const [key, event] of answer) found.set(key, event);
      for (const w of waiting)
        w.resolve(w.coords.map((c) => found.get(c)).filter((e): e is NostrEvent => e !== undefined));
    },
    (error) => waiting.forEach((w) => w.reject(error)),
  );
}

/**
 * The newest event found at each of `addrs`, asked in one request with every
 * other lookup made within the window. Nothing is kept once a batch lands: the
 * store holds the events and askOnce decides when a key is asked again.
 */
export function fetchAddressableBatched(addrs: readonly AddressRef[]): Promise<NostrEvent[]> {
  if (!addrs.length) return Promise.resolve([]);
  const coords: string[] = [];
  for (const a of addrs) {
    const key = addrCoord(a);
    coords.push(key);
    const held = queued.get(key);
    // Lookups of one coordinate share its slot, and every relay hint either named.
    if (!held) queued.set(key, a);
    else if (a.relays?.length)
      queued.set(key, { ...held, relays: [...new Set([...(held.relays ?? []), ...a.relays])] });
  }
  const answer = new Promise<NostrEvent[]>((resolve, reject) => waiters.push({ coords, resolve, reject }));
  flushTimer ??= setTimeout(flush, BATCH_WINDOW_MS);
  return answer;
}

/** Test seam. */
export function __resetAddressedBatch(): void {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  queued = new Map();
  waiters = [];
}

// ——— The hook ———

/**
 * `ask: false` reads the store alone and asks no relay — for a card drawn
 * inside a quote, where a request per card is what the note around it avoids.
 * Without an ask there is nothing to wait for: `settled` is true.
 */
export function useAddressedEvents(
  addresses: readonly string[],
  { ask = true }: { ask?: boolean } = {},
): {
  get: (address: string) => NostrEvent | undefined;
  settled: boolean;
} {
  // Keyed on the values: an address's `d` may hold any character.
  const key = JSON.stringify([...new Set(addresses)].sort());
  const addrs = useMemo(
    () => (JSON.parse(key) as string[]).map((a) => parseATag(a)).filter((a): a is AddressRef => a !== null),
    [key],
  );
  const held = useHeldReplaceables(addrs);
  const asked = useStoreEvents(ask && addrs.length ? `addressed:${key}` : null, null, () =>
    fetchAddressableBatched(addrs),
  );
  const found = useMemo(
    () => mergeNewest(addrs, held, byCoord(asked.events as MinimalEvent[])),
    [addrs, held, asked.events],
  );
  const settled = !ask || !addrs.length || asked.settled;
  return useMemo(
    () => ({
      get: (address: string) => {
        const a = parseATag(address);
        return a ? (found.get(addrCoord(a)) as NostrEvent | undefined) : undefined;
      },
      settled,
    }),
    [found, settled],
  );
}
