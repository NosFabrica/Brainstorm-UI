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

import { eventStore } from "./eventStore";
import { loadReplaceable } from "./loaders";
import { PROFILE_RELAYS } from "./relays";

/** NIP-65 relay list. */
export const RELAY_LIST_KIND = 10002;

export interface RelayList {
  /** Where this author publishes — where to READ their events. */
  write: string[];
  /** Where this author listens — where to SEND events that name them. */
  read: string[];
}

const EMPTY_LIST: RelayList = { write: [], read: [] };

/**
 * One author's own relays are a routing hint, not a subscription list. A
 * kind-10002 naming thirty relays would otherwise turn one read into thirty
 * sockets; NIP-65 itself asks clients to keep the list short and asks readers
 * to honour only the top of it.
 */
export const MAX_RELAYS_PER_AUTHOR = 4;

/**
 * How many `p`-tagged recipients a single publish will look up inboxes for. A
 * kind-3 names hundreds of people and is addressed to none of them; without a
 * cap, "publish" would mean "resolve the relay list of everyone you follow".
 */
export const MAX_INBOX_RECIPIENTS = 8;

/** How long a MISS is remembered. A hit lives in the event store instead. */
const MISS_TTL_MS = 5 * 60_000;

/**
 * The deadline for a routing lookup, deliberately shorter than the content
 * reads it precedes. Routing is an optimisation over a fallback that already
 * works: blocking a page render for eight seconds to find out where an author
 * writes is a worse answer than asking the default relays now.
 */
const ROUTING_TIMEOUT_MS = 2500;

/**
 * `wss://Nos.lol/` and `wss://nos.lol` address one relay. Our own constants
 * carry a trailing slash and kind-10002 tags usually do not, so a raw set union
 * of the two keeps both forms and opens two sockets to one host.
 *
 * Only the host is lower-cased: a path can be case-significant.
 */
export function normalizeRelayUrl(url: string): string | null {
  const raw = (url || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") return null;
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return null;
  }
}

/**
 * Drop what isn't a relay and de-dupe by normalized identity — but emit the
 * FIRST form seen, not the normalized one.
 *
 * Rewriting every URL would churn the strings a caller passed in (our own
 * constants carry a trailing slash) for no gain: the pool normalizes before it
 * opens a socket anyway. What actually matters is that two spellings of one
 * host collapse to one entry, and that is what this does.
 */
export function dedupeRelays(urls: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const key = normalizeRelayUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(url.trim());
  }
  return out;
}

/**
 * NIP-65: `["r", <url>]` is both, `["r", <url>, "read"|"write"]` is one. An
 * unrecognised marker is treated as no marker — a typo should not silently
 * remove a relay the user meant to list.
 */
export function parseRelayList(event: NostrEvent | undefined | null): RelayList {
  if (!event || event.kind !== RELAY_LIST_KIND) return EMPTY_LIST;
  const write: string[] = [];
  const read: string[] = [];
  for (const tag of event.tags || []) {
    if (tag[0] !== "r" || typeof tag[1] !== "string") continue;
    const url = normalizeRelayUrl(tag[1]);
    if (!url) continue;
    const marker = typeof tag[2] === "string" ? tag[2].trim().toLowerCase() : "";
    if (marker !== "read") write.push(url);
    if (marker !== "write") read.push(url);
  }
  return { write: dedupeRelays(write), read: dedupeRelays(read) };
}

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
export function loadRelayList(
  pubkey: string,
  { timeoutMs = ROUTING_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<RelayList | null> {
  if (!/^[0-9a-f]{64}$/i.test(pubkey || "")) return Promise.resolve(null);
  const held = relayListFromDb(pubkey);
  if (held) return Promise.resolve(held);

  const missed = missedAt.get(pubkey);
  if (missed !== undefined && Date.now() - missed < MISS_TTL_MS) return Promise.resolve(null);

  const pending = inFlight.get(pubkey);
  if (pending) return pending;

  const request = loadReplaceable(RELAY_LIST_KIND, pubkey, { relays: PROFILE_RELAYS, timeoutMs })
    .then((event) => {
      const list = event ? parseRelayList(event as NostrEvent) : null;
      if (list && (list.write.length || list.read.length)) return list;
      missedAt.set(pubkey, Date.now());
      return null;
    })
    .catch(() => {
      missedAt.set(pubkey, Date.now());
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
 */
export function relayHintFor(pubkey: string): string | undefined {
  return relayListFromDb(pubkey)?.write[0];
}

/** The same, loading the relay list first — for a publish that is about to sign. */
export async function loadRelayHint(pubkey: string): Promise<string | undefined> {
  const list = await loadRelayList(pubkey, { timeoutMs: 3000 }).catch(() => null);
  return list?.write[0];
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
