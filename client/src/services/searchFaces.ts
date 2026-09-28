/**
 * The faces the search box's pills draw: a name and a picture for every key in the query,
 * whether it arrived as `from:`, `to:` or `observer:`.
 *
 * Two sources, asked at once rather than one after the other, because they fail in different
 * ways and a pill that waits on the slower of them is a pill that is blank when it matters:
 *
 *  - **the search relay**, under `include:spam`. It is where these people came from — it ranks
 *    them, so it holds their kind-0 — and the waiver is not optional: a read that names no lens
 *    is refused outright, and an `observer:` is by definition somebody the reader's own web of
 *    trust may rank at nothing.
 *  - **their own write relays**, from their kind-10002. That is the outbox rule, and it is the
 *    one that gets a CURRENT profile: the search relay's copy is whatever it indexed, their own
 *    relays' copy is whatever they last published.
 *
 * Whichever is newer wins, by `created_at`. The store answers for anybody already in it before
 * either question is asked.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { searchRelay } from "@/lib/searchRelay";
import { loadReplaceable } from "@/lib/loaders";
import { PROFILE_RELAYS } from "@/lib/relays";
import { outboxRelays } from "@/lib/relayRouting";
import { kind0ToSearchResult } from "@/services/search";
import type { SearchResult } from "@/lib/profileSearch";

const TIMEOUT_MS = 5000;

/** Every kind-0 the search relay holds for these keys. Never rejects: a blank pill beats a crash. */
function fromSearchRelay(pubkeys: string[], timeoutMs: number): Promise<NostrEvent[]> {
  const relay = searchRelay();
  if (!relay || !pubkeys.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    const found: NostrEvent[] = [];
    let done = false;
    // Declared before the subscribe: a relay that answers or fails synchronously calls
    // `finish` while these are still being assigned.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sub: { unsubscribe: () => void } | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub?.unsubscribe();
      resolve(found);
    };
    sub = relay
      .req({ kinds: [0], authors: pubkeys, search: "include:spam", limit: pubkeys.length })
      .subscribe({
        error: finish,
        next: (msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event?.kind === 0) found.push(msg.event);
          else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
        },
      });
    timer = setTimeout(finish, timeoutMs);
    if (done) clearTimeout(timer);
  });
}

/**
 * Their kind-0 from their own write relays. `outboxRelays` loads their kind-10002 if the store
 * has not got it and unions its write relays with the defaults, so this is the outbox read
 * where they say where they publish and the ordinary one where they do not.
 */
async function fromTheirRelays(pubkey: string, timeoutMs: number): Promise<NostrEvent | undefined> {
  try {
    return await loadReplaceable(0, pubkey, {
      relays: await outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs }),
      timeoutMs,
      // Past the store: the store is consulted by the caller before either question is asked,
      // and answering from it here would make this the same question twice.
      fromRelays: true,
    });
  } catch {
    return undefined;
  }
}

/**
 * The profiles for a set of keys, best available. Resolves with whatever arrived — a key nobody
 * has a kind-0 for is simply absent from the map.
 */
export async function fetchPillProfiles(
  pubkeys: string[],
  timeoutMs = TIMEOUT_MS,
): Promise<Map<string, SearchResult>> {
  const want = [...new Set(pubkeys.filter((pk) => /^[0-9a-f]{64}$/i.test(pk)))];
  const out = new Map<string, SearchResult>();
  if (!want.length) return out;

  const newest = new Map<string, NostrEvent>();
  const take = (event: NostrEvent | undefined) => {
    if (!event || event.kind !== 0) return;
    const held = newest.get(event.pubkey);
    if (!held || held.created_at < event.created_at) newest.set(event.pubkey, event);
  };

  // Whatever the store already holds is the starting point — it costs nothing and it is what
  // makes a pill that has been drawn before draw instantly the next time.
  for (const pk of want) take(eventStore.getReplaceable(0, pk) as NostrEvent | undefined);

  // A face for everybody already: nothing to ask, and nothing to wait for. Without this a
  // pill whose profile is already in hand still sat on its skeleton until the slower of two
  // network reads gave up, which for somebody with no kind-0 on their own relays is the whole
  // timeout.
  if (newest.size < want.length) {
    const asked = [
      fromSearchRelay(want, timeoutMs).then((events) => events.forEach(take)),
      ...want.map((pk) => fromTheirRelays(pk, timeoutMs).then(take)),
    ];
    // Whichever source answers first wins the race when it completes the set; the rest are
    // left running, and what they bring lands in the store for the next pill to find.
    await Promise.race([
      Promise.all(asked),
      new Promise<void>((resolve) => {
        for (const one of asked) void one.then(() => { if (newest.size >= want.length) resolve(); });
      }),
    ]);
  }

  for (const [pubkey, event] of newest) {
    // Into the store, so the next pill drawing this person needs no round trip at all.
    try { eventStore.add(event); } catch { /* a malformed event is not a face */ }
    try { out.set(pubkey, kind0ToSearchResult(event)); } catch { /* nor is an unparseable one */ }
  }
  return out;
}
