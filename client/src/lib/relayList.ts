/**
 * Reading a NIP-65 relay list, and nothing else.
 *
 * Split out of `lib/relayRouting` so it can be a LEAF: it imports no other
 * module of ours, so anything may import it statically. `lib/eventCache` needs
 * exactly this much to route its own revalidation, and `relayRouting` imports
 * `eventCache` — reaching back the other way had to be a dynamic `import()`,
 * which under a warm module graph can hand back a half-initialised namespace
 * (`parseRelayList is not a function`). A leaf has no such moment.
 *
 * `relayRouting` re-exports all of this, so the rest of the app can keep asking
 * the routing module for it.
 */
import type { NostrEvent } from "nostr-tools";
import { mergeRelaySets } from "applesauce-core/helpers/relays";

/** NIP-65 relay list. */
export const RELAY_LIST_KIND = 10002;

export interface RelayList {
  /** Where this author publishes — where to READ their events. */
  write: string[];
  /** Where this author listens — where to SEND events that name them. */
  read: string[];
}

export const EMPTY_LIST: RelayList = { write: [], read: [] };

/**
 * A relay address is a WebSocket address: something that parses as a URL on
 * `ws://` or `wss://`. Nothing else is a relay address.
 *
 * Deliberately NOT applesauce's `isSafeRelayURL`, which additionally requires
 * the host's last label to be at most six characters. That rejects
 * `wss://relay.community`, `wss://nostr.technology` and `wss://relay.foundation`
 * — real relays on real TLDs. Dropping a relay a user actually listed is the
 * exact failure this module exists to prevent, so the length rule stays out.
 */
function looksLikeRelayUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "wss:" || protocol === "ws:";
  } catch {
    return false;
  }
}

/**
 * De-dupe a set of relays by identity, in the form the pool keys connections by.
 *
 * `mergeRelaySets` normalizes as it merges, so `wss://Nos.lol` and
 * `wss://nos.lol/` collapse to one entry instead of opening two sockets to one
 * host — and its output is `normalizeURL` form, exactly how `RelayPool` keys
 * its connections. That single URL identity is what lets `planOutboxReads`
 * build a filter map the pool can actually match.
 *
 * The scheme check in front of it is not redundant: `mergeRelaySets` runs
 * `ensureWebSocketURL`, which rewrites ANY scheme to `wss:`, so an `https://`
 * string would be accepted as a relay. Some of what reaches here is relay hints
 * off untrusted events, and a hint that is not a relay address should be
 * dropped rather than coerced into one.
 */
export function dedupeRelays(urls: Iterable<string>): string[] {
  const relays: string[] = [];
  for (const url of urls) {
    const trimmed = (url || "").trim();
    if (looksLikeRelayUrl(trimmed)) relays.push(trimmed);
  }
  return mergeRelaySets(relays);
}

/** Parsed lists, keyed by the event they came from — `relayListFromDb` is hot. */
const parsed = new WeakMap<NostrEvent, RelayList>();

/**
 * NIP-65: `["r", <url>]` is both, `["r", <url>, "read"|"write"]` is one. An
 * unrecognised marker is treated as no marker — a typo should not silently
 * remove a relay the user meant to list.
 *
 * Hand-rolled rather than applesauce's `getInboxes`/`getOutboxes` for one
 * reason, in `looksLikeRelayUrl` above: those gate on `isSafeRelayURL`, whose
 * host rule silently drops relays on TLDs longer than six characters. The
 * marker reading here is also the forgiving one, for the same instinct.
 */
export function parseRelayList(event: NostrEvent | undefined | null): RelayList {
  if (!event || event.kind !== RELAY_LIST_KIND) return EMPTY_LIST;
  const memo = parsed.get(event);
  if (memo) return memo;

  const write: string[] = [];
  const read: string[] = [];
  for (const tag of event.tags || []) {
    if (tag[0] !== "r" || typeof tag[1] !== "string") continue;
    const marker = typeof tag[2] === "string" ? tag[2].trim().toLowerCase() : "";
    if (marker !== "read") write.push(tag[1]);
    if (marker !== "write") read.push(tag[1]);
  }
  const list = { write: dedupeRelays(write), read: dedupeRelays(read) };
  parsed.set(event, list);
  return list;
}
