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
 * `ws://` or `wss://`. Nothing else is a relay address. One on the reader's
 * own device or LAN is not one we can use either (`isLocalNetworkHost`).
 *
 * Deliberately NOT applesauce's `isSafeRelayURL`, which additionally requires
 * the host's last label to be at most six characters. That rejects
 * `wss://relay.community`, `wss://nostr.technology` and `wss://relay.foundation`
 * — real relays on real TLDs. Dropping a relay a user actually listed is the
 * exact failure this module exists to prevent, so the length rule stays out.
 */
function looksLikeRelayUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "wss:" && protocol !== "ws:") return false;
    return PAGE_IS_LOCAL || !isLocalNetworkHost(hostname);
  } catch {
    return false;
  }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * A host on the reader's own device or LAN: loopback, private, link-local and
 * CGNAT ranges, `localhost` and mDNS `.local` names.
 *
 * Relay lists are public, and people list the relay on their own phone
 * (Citrine's `ws://localhost:4869`) or home server (`ws://umbrel.local:4848`).
 * To them that is their relay; to every OTHER reader it names that reader's
 * own machine. Connecting to it is useless at best, and Chrome answers it with
 * a "wants to access other apps and services on this device" prompt that reads
 * like Brainstorm is asking for something. A name that merely RESOLVES to a
 * private address can't be seen from here; the literal forms are what lists
 * actually carry.
 *
 * `hostname` as `URL` gives it: lower-cased, IPv4 in dotted form whatever way
 * it was written, IPv6 in brackets.
 */
export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;

  const v4 = IPV4.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || // "this network", 0.0.0.0 reaches the local machine
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT, often a LAN or tailnet
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (host.startsWith("[") && host.endsWith("]")) {
    const v6 = host.slice(1, -1);
    if (v6 === "::" || v6 === "::1") return true;
    // IPv4-mapped (`::ffff:7f00:1` once URL has canonicalized it).
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
    if (mapped) {
      const hi = parseInt(mapped[1], 16);
      const lo = parseInt(mapped[2], 16);
      return isLocalNetworkHost(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // fc00::/7 unique-local, fe80::/10 link-local.
    return /^f[cd][0-9a-f]{0,2}:/.test(v6) || /^fe[89ab][0-9a-f]?:/.test(v6);
  }
  return false;
}

/**
 * Served from the reader's own machine or LAN (a dev server, a self-hosted
 * build)? Then a local relay may well be the point, and nothing is filtered.
 */
const PAGE_IS_LOCAL = isLocalNetworkHost(globalThis.location?.hostname ?? "");

/**
 * A relay this page must not connect to: one on the reader's own device or
 * network, unless the page itself is served from there. See
 * `isLocalNetworkHost`. Something that isn't a URL at all is not this
 * function's call — `dedupeRelays` drops it anyway.
 */
export function isUnreachableLocalRelay(url: string): boolean {
  if (PAGE_IS_LOCAL) return false;
  try {
    return isLocalNetworkHost(new URL(url).hostname);
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
