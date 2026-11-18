/**
 * Filling gaps in the search relay from what a reader's own visit found.
 *
 * The search relay (`SEARCH_RELAY`) is the corpus search, cards and embeds read
 * from, but it only knows what reached it. An event a relay hint holds and
 * search does not — a note published to its author's own relay, an article's
 * edit that has not propagated — is one an event page can show yet search
 * cannot find. When a page has both answers in hand, the copy it found is
 * handed to search: it accepts any validly signed event from anyone, and
 * indexes it at once (probed 2026-11-18, anonymous EVENT → OK, then served).
 *
 * Only on a definite answer from search: a refusal or a timeout says nothing
 * about what it holds, and a push then would be a guess.
 */
import type { NostrEvent } from "nostr-tools";
import { beats } from "@/lib/relayRequest";
import { searchRelay } from "@/lib/searchRelay";

/** Ids handed to search this session, so a page re-rendered or reopened asks once. */
const seeded = new Set<string>();

/** NIP-70: a `["-"]` tag means only its author may publish it, so we never do. */
function isProtected(event: NostrEvent): boolean {
  return event.tags.some((t) => t.length === 1 && t[0] === "-");
}

/**
 * Whether search should be given `found`: it answered, and holds no copy of
 * it — for a replaceable or addressable event, none as new. `searchCopy` is
 * search's own copy of the same event or address, if any.
 */
export function searchLacks(
  found: NostrEvent | undefined,
  searchCopy: NostrEvent | undefined,
  searchAnswered: boolean,
): found is NostrEvent {
  if (!found || !searchAnswered || isProtected(found)) return false;
  return !searchCopy || (searchCopy.id !== found.id && beats(found, searchCopy));
}

/**
 * Hand `event` to the search relay. Fire and forget: the reader already sees
 * the event, and a rejection (a kind search does not index, a relay that
 * changed its mind) changes nothing for them.
 */
export function seedSearchRelay(event: NostrEvent): void {
  if (seeded.has(event.id)) return;
  let relay: ReturnType<typeof searchRelay>;
  try {
    relay = searchRelay();
  } catch {
    relay = null;
  }
  if (!relay) return;
  seeded.add(event.id);
  // The wire fields alone: the store hangs its own caches on the objects it holds.
  const { id, pubkey, created_at, kind, tags, content, sig } = event;
  relay
    .publish({ id, pubkey, created_at, kind, tags, content, sig }, { timeout: 10_000, retries: false })
    .catch(() => {});
}

/** For tests: forget what this session already handed over. */
export function resetSeededForTests(): void {
  seeded.clear();
}
