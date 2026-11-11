/**
 * What a relay says about its own limits, from its NIP-11 information document.
 *
 * Only the two limits a publish has to respect are read: `max_message_length` (the
 * largest frame it accepts) and `max_event_tags`. A relay that serves no document, an
 * unreadable one, or none in time simply has no limits on record; callers then use their
 * defaults. Answers are cached per relay URL for the session, failures included, so a
 * dead relay costs one timeout, not one per publish.
 */

export interface RelayLimits {
  maxMessageLength: number | null;
  maxEventTags: number | null;
}

const NONE: RelayLimits = { maxMessageLength: null, maxEventTags: null };
const TIMEOUT_MS = 3000;
const cache = new Map<string, Promise<RelayLimits>>();

/** The NIP-11 URL for a relay: `wss://` read as `https://`, `ws://` as `http://`. */
export function relayInfoUrl(relay: string): string | null {
  try {
    const url = new URL(relay.trim());
    if (url.protocol === "wss:") url.protocol = "https:";
    else if (url.protocol === "ws:") url.protocol = "http:";
    else if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/** Reads the limits out of a parsed document; anything malformed reads as absent. */
export function parseRelayLimits(doc: unknown): RelayLimits {
  const limitation = (doc as { limitation?: unknown } | null)?.limitation;
  if (!limitation || typeof limitation !== "object") return NONE;
  const l = limitation as Record<string, unknown>;
  return { maxMessageLength: positive(l.max_message_length), maxEventTags: positive(l.max_event_tags) };
}

async function fetchLimits(relay: string, timeoutMs: number): Promise<RelayLimits> {
  const url = relayInfoUrl(relay);
  if (!url) return NONE;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/nostr+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return NONE;
    return parseRelayLimits(await response.json());
  } catch {
    return NONE;
  }
}

/** The limits each relay publishes, in the order given; never throws. */
export function relayLimits(relays: string[], timeoutMs = TIMEOUT_MS): Promise<RelayLimits[]> {
  return Promise.all(
    relays.map((relay) => {
      const key = relay.trim().replace(/\/+$/, "");
      let pending = cache.get(key);
      if (!pending) {
        pending = fetchLimits(relay, timeoutMs);
        cache.set(key, pending);
      }
      return pending;
    }),
  );
}

/** For tests. */
export function clearRelayLimitsCache(): void {
  cache.clear();
}
