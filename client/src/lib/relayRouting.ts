/**
 * NIP-65 relay routing — the outbox model, in one place.
 *
 * The rule the whole app follows:
 *
 * - To READ somebody's events, ask the relays THEY write to (their kind-10002
 *   `r` tags with no marker or `write`). That is their outbox.
 * - To SEND an event that names somebody, add the relays THEY read from (`r`
 *   tags with no marker or `read`). That is their inbox, and it is the half
 *   that makes a reply, a report or a vouch actually arrive.
 * - Our own `PROFILE_RELAYS` are a floor under both, never the whole answer:
 *   a user whose kind-10002 we have not loaded must still get a working app.
 *
 * In `lib/` beside the pool, the store and the loaders because all three are
 * here and nothing in `lib/` may import up into `services/`.
 */
import type { NostrEvent } from "nostr-tools";
import {
  groupPubkeysByRelay,
  selectOptimalRelays,
  setFallbackRelays,
  type OutboxMap,
} from "applesauce-core/helpers/relay-selection";

import { eventStore } from "./eventStore";
import { whenHydrated } from "./eventCache";
import { loadReplaceable } from "./loaders";
import { PROFILE_RELAYS } from "./relays";
import {
  EMPTY_LIST,
  RELAY_LIST_KIND,
  dedupeRelays,
  parseRelayList,
  type RelayList,
} from "./relayList";

/**
 * Reading a relay list lives in `lib/relayList`, a LEAF module. This one
 * imports `eventCache`, and `eventCache` needs the parser to route its own
 * revalidation — reaching back the other way had to be a dynamic `import()`,
 * which on a warm graph can hand back a half-initialised namespace. Re-exported
 * so the rest of the app still asks the routing module for routing things.
 */
export { RELAY_LIST_KIND, dedupeRelays, parseRelayList } from "./relayList";
export type { RelayList } from "./relayList";

/**
 * One author's own relays are a routing hint, not a subscription list. A
 * kind-10002 naming thirty relays would otherwise turn one read into thirty
 * sockets; NIP-65 itself asks clients to keep the list short and asks readers
 * to honour only the top of it.
 */
export const MAX_RELAYS_PER_AUTHOR = 4;

/**
 * Sockets one multi-author read may open.
 *
 * The cap is the whole point of `selectOptimalRelays`: a two-hop network is
 * hundreds of authors across hundreds of relays, and the outbox model without a
 * budget is a denial-of-service against your own browser. The selection is a
 * set cover — it repeatedly takes the relay serving the most authors still
 * uncovered — so eight connections reach far more of the set than eight
 * arbitrary ones would.
 */
export const MAX_CONNECTIONS = 8;

/**
 * How many `p`-tagged recipients a single publish will look up inboxes for. A
 * kind-3 names hundreds of people and is addressed to none of them; without a
 * cap, "publish" would mean "resolve the relay list of everyone you follow".
 */
export const MAX_INBOX_RECIPIENTS = 8;

/**
 * How long a MISS is remembered. A hit lives in the event store instead.
 *
 * Two of them, because the two kinds of miss are not the same claim. A lookup
 * that came back empty well inside its deadline is evidence: this author has no
 * kind-10002, and re-asking every render is waste. A lookup that ran out of
 * time is not evidence of anything — the relays were slow, or down — and
 * remembering it for minutes would pin the whole session to the fallback set
 * on one bad moment, including the follow-list wipe guard's evidence read.
 */
const MISS_TTL_MS = 5 * 60_000;
const INCONCLUSIVE_TTL_MS = 20_000;

/** Test seam: the windows above are wall-clock, so a test must be able to shrink them. */
export const __ttls = { miss: MISS_TTL_MS, inconclusive: INCONCLUSIVE_TTL_MS };

/**
 * The deadline for a routing lookup, deliberately shorter than the content
 * reads it precedes. Routing is an optimisation over a fallback that already
 * works: blocking a page render for eight seconds to find out where an author
 * writes is a worse answer than asking the default relays now.
 */
const ROUTING_TIMEOUT_MS = 2500;

/** What the store already holds, or null if nobody has loaded it yet. */
export function relayListFromDb(pubkey: string): RelayList | null {
  const event = eventStore.getReplaceable(RELAY_LIST_KIND, pubkey) as NostrEvent | undefined;
  if (!event) return null;
  const list = parseRelayList(event);
  return list.write.length || list.read.length ? list : null;
}

const inFlight = new Map<string, Promise<RelayList | null>>();
const missedAt = new Map<string, number>();

/**
 * One author's relay list: from the store if it is there, else fetched from the
 * bootstrap set (`PROFILE_RELAYS` carries purplepag.es, which exists to index
 * exactly this kind).
 *
 * Misses are remembered for a few minutes. Without that, every read of an author
 * who has never published a kind-10002 — most of nostr — would re-ask the relays
 * for it on every render.
 */
export async function loadRelayList(
  pubkey: string,
  { timeoutMs = ROUTING_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<RelayList | null> {
  if (!/^[0-9a-f]{64}$/i.test(pubkey || "")) return null;

  // The cache is read asynchronously, so a lookup that fires first would miss a
  // relay list that is about to be in the store and go to the relays for
  // nothing — on the one read the whole session's routing depends on. Resolves
  // immediately when nothing is hydrating.
  await whenHydrated();

  const held = relayListFromDb(pubkey);
  if (held) return held;

  const missed = missedAt.get(pubkey);
  if (missed !== undefined && Date.now() < missed) return null;

  const pending = inFlight.get(pubkey);
  if (pending) return pending;

  const startedAt = Date.now();
  /** A lookup that used its whole deadline told us nothing; forget it sooner. */
  const rememberMiss = () => {
    const ranOut = Date.now() - startedAt >= timeoutMs;
    missedAt.set(pubkey, Date.now() + (ranOut ? __ttls.inconclusive : __ttls.miss));
  };

  const request = loadReplaceable(RELAY_LIST_KIND, pubkey, { relays: PROFILE_RELAYS, timeoutMs })
    .then((event) => {
      const list = event ? parseRelayList(event as NostrEvent) : null;
      if (list && (list.write.length || list.read.length)) return list;
      rememberMiss();
      return null;
    })
    .catch(() => {
      rememberMiss();
      return null;
    })
    .finally(() => {
      inFlight.delete(pubkey);
    });

  inFlight.set(pubkey, request);
  return request;
}

/** The same for several authors at once — they share the loader's buffer window. */
export function loadRelayLists(
  pubkeys: string[],
  opts: { timeoutMs?: number } = {},
): Promise<Map<string, RelayList>> {
  const unique = Array.from(new Set(pubkeys.filter(Boolean)));
  return Promise.all(
    unique.map(async (pubkey) => [pubkey, await loadRelayList(pubkey, opts)] as const),
  ).then((entries) => {
    const map = new Map<string, RelayList>();
    for (const [pubkey, list] of entries) if (list) map.set(pubkey, list);
    return map;
  });
}

/** Take the head of an author's list — see `MAX_RELAYS_PER_AUTHOR`. */
function capped(relays: string[]): string[] {
  return relays.slice(0, MAX_RELAYS_PER_AUTHOR);
}

/**
 * Where to READ these authors' events: their write relays over our floor.
 *
 * Synchronous, so it answers only from what the store already holds. Call sites
 * that can afford one round-trip should use `outboxRelays`, which loads first.
 */
export function outboxRelaysFromDb(
  pubkeys: string | string[],
  fallback: string[] = PROFILE_RELAYS,
): string[] {
  const authors = Array.isArray(pubkeys) ? pubkeys : [pubkeys];
  const out: string[] = [];
  for (const pubkey of authors) out.push(...capped(relayListFromDb(pubkey)?.write ?? []));
  return dedupeRelays([...out, ...fallback]);
}

/** Where to READ these authors' events, loading their relay lists first. */
export async function outboxRelays(
  pubkeys: string | string[],
  fallback: string[] = PROFILE_RELAYS,
  opts: { timeoutMs?: number } = {},
): Promise<string[]> {
  const authors = Array.isArray(pubkeys) ? pubkeys : [pubkeys];
  const lists = await loadRelayLists(authors, opts);
  const out: string[] = [];
  for (const pubkey of authors) out.push(...capped(lists.get(pubkey)?.write ?? []));
  return dedupeRelays([...out, ...fallback]);
}

/**
 * Where to SEND an event that names these people: their read relays.
 *
 * The fallback is deliberately empty by default — an inbox set is something a
 * publish ADDS to the author's own outbox, and defaulting it to our relays
 * would just restate the floor the caller already has.
 */
export async function inboxRelays(
  pubkeys: string[],
  fallback: string[] = [],
  opts: { timeoutMs?: number } = {},
): Promise<string[]> {
  const recipients = Array.from(new Set(pubkeys.filter(Boolean))).slice(0, MAX_INBOX_RECIPIENTS);
  const lists = await loadRelayLists(recipients, opts);
  const out: string[] = [];
  for (const pubkey of recipients) out.push(...capped(lists.get(pubkey)?.read ?? []));
  return dedupeRelays([...out, ...fallback]);
}

/**
 * Which relays to open for a MULTI-AUTHOR read, and which authors each one is
 * responsible for.
 *
 * `outboxRelays` answers the single-author question by flattening everything
 * into one list. Correct, and it degenerates badly at scale: asking six relays
 * for four hundred authors sends six copies of the same enormous filter, and
 * most of each one names authors that relay has never heard of. This returns
 * the shape the query actually wants — a relay, and the authors it serves.
 *
 * Keys are in `normalizeURL` form, which is how `RelayPool` keys its
 * connections — every relay URL in this module already is, because
 * `dedupeRelays` puts them there. A filter map whose keys don't match the
 * pool's is one that never hits: every relay would be asked for an empty author
 * list and the read would come back silently empty, with no error anywhere.
 */
export interface OutboxPlan {
  /** Relays to open, best coverage first. */
  relays: string[];
  /** Authors per relay, keyed as `RelayPool` keys its connections. */
  outboxes: OutboxMap;
}

export async function planOutboxReads(
  pubkeys: string[],
  fallback: string[] = PROFILE_RELAYS,
  {
    maxConnections = MAX_CONNECTIONS,
    maxRelaysPerUser = MAX_RELAYS_PER_AUTHOR,
    timeoutMs,
  }: { maxConnections?: number; maxRelaysPerUser?: number; timeoutMs?: number } = {},
): Promise<OutboxPlan> {
  const authors = Array.from(new Set(pubkeys.filter(Boolean)));
  if (!authors.length) return { relays: [], outboxes: {} };
  const floor = dedupeRelays(fallback);

  const lists = await loadRelayLists(authors, { timeoutMs });
  const pointers = authors.map((pubkey) => ({
    pubkey,
    relays: lists.get(pubkey)?.write ?? [],
  }));

  // Fallback BEFORE selection, so an author with no relay list still competes
  // for coverage rather than being dropped from the pool entirely.
  const selected = selectOptimalRelays(setFallbackRelays(pointers, floor), {
    maxConnections,
    maxRelaysPerUser,
  });

  const outboxes = groupPubkeysByRelay(selected);

  // A tight budget can leave an author with none of their own relays selected,
  // and `groupPubkeysByRelay` drops anyone whose list came back empty — which
  // would be an author we silently never asked about. Put them on the floor.
  //
  // ONE floor relay, not all of them: adding every uncovered author to every
  // fallback is the undirected fan-out this function exists to replace, and it
  // would push `relays` past `maxConnections` besides. A floor relay already in
  // the plan is free; otherwise the first one opens a single extra connection.
  const uncovered = selected.filter((user) => !user.relays?.length);
  if (uncovered.length && floor.length) {
    const fallback = floor.find((relay) => outboxes[relay]) ?? floor[0];
    const bucket = outboxes[fallback] ?? (outboxes[fallback] = []);
    for (const user of uncovered) {
      if (!bucket.some((u) => u.pubkey === user.pubkey)) {
        bucket.push({ ...user, relays: [fallback] });
      }
    }
  }

  return { relays: Object.keys(outboxes), outboxes };
}

/**
 * How many people one warm may ask about. A feed can name hundreds of authors;
 * the loader batches them into one REQ, but an `authors` array of four hundred
 * is a filter some relays quietly truncate.
 */
const MAX_WARM_AT_ONCE = 100;

/**
 * Pre-load these people's relay lists, in the background.
 *
 * This is what the durable cache is FOR. Routing is needed at the moment an
 * event is signed and published, and at that moment there is no time to go and
 * ask: a lookup then is dead air between the user's click and the signer
 * prompt, and a lookup that loses its race silently falls back to the default
 * relays — the publish still succeeds, and still misses the inbox of the person
 * it was for.
 *
 * So the rule this serves is: **anything that puts a person or a note on the
 * screen warms the people it names.** By the time a reader RSVPs to the event
 * they are looking at, vouches for the person whose profile they opened, or
 * replies to a note in a feed, the routing table for everyone involved is
 * already on the device.
 *
 * Fire-and-forget by design. Nothing waits on it, nothing fails because of it,
 * and everything it learns is deduped in flight, cached on disk, and negatively
 * cached when a person has no list at all.
 */
export function warmRelayLists(pubkeys: Iterable<string>): void {
  const wanted: string[] = [];
  for (const pubkey of pubkeys) {
    if (wanted.length >= MAX_WARM_AT_ONCE) break;
    // Already known, or known to be absent — `loadRelayList` would answer
    // from memory anyway, but skipping here keeps the batch small.
    if (!/^[0-9a-f]{64}$/i.test(pubkey || "") || relayListFromDb(pubkey)) continue;
    wanted.push(pubkey);
  }
  if (!wanted.length) return;
  void loadRelayLists(wanted).catch(() => undefined);
}

/**
 * The relays one person READS from.
 *
 * The same set `inboxRelays` collects, named for the case where the person is
 * the VIEWER rather than a recipient — "also look where I read" is a different
 * sentence from "deliver this to them", even though NIP-65 answers both with
 * the same tags.
 */
export function readRelaysFor(
  pubkey: string,
  fallback: string[] = [],
  opts: { timeoutMs?: number } = {},
): Promise<string[]> {
  return inboxRelays([pubkey], fallback, opts);
}

/**
 * One relay to name in an `e`/`p`/`a` tag so the next client can find what we
 * point at without a full lookup. Store-only and best-effort: a hint we cannot
 * produce is simply left off, never guessed.
 *
 * Deliberately NOT a loading variant. This is read while BUILDING an event, so
 * an awaited lookup here is dead time between the user's click and the signer
 * prompt — up to the routing deadline, for a field that is optional by design.
 * Anything that reads a profile warms the list first, and the publish that
 * follows loads it anyway, so the hint is there whenever it has mattered once.
 */
export function relayHintFor(pubkey: string): string | undefined {
  return relayListFromDb(pubkey)?.write[0];
}

/**
 * An `e`/`a`/`p` tag carrying a relay hint, or the bare tag when we have none.
 *
 * Hints are how the outbox model propagates: the next client to read this event
 * learns where the thing it points at lives without a lookup of its own. Every
 * tag this app published was bare, so we consumed hints and contributed none.
 * A hint we cannot produce is left off rather than guessed — a wrong hint sends
 * readers somewhere the event definitely is not.
 */
export function tagWithHint(name: string, value: string, hint?: string): string[] {
  return hint ? [name, value, hint] : [name, value];
}

/** Test seam — the miss cache would otherwise leak between cases. */
export function resetRelayRoutingCache(): void {
  inFlight.clear();
  missedAt.clear();
}
