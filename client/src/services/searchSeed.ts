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
import { isExpired } from "@/lib/nip40";

/**
 * Ids this device already handed to search, kept across sessions. Search can
 * accept an event and still never serve it (a moderated author, a deleted
 * note), and then every visit would push it again; once per device is enough.
 * Bounded: the oldest are forgotten first.
 */
const STORAGE_KEY = "brainstorm_search_seeded";
const REMEMBERED = 500;
let seeded: string[] | null = null;

function remembered(): string[] {
  if (seeded) return seeded;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    seeded = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    seeded = [];
  }
  return seeded;
}

function remember(id: string): void {
  const ids = remembered();
  ids.push(id);
  if (ids.length > REMEMBERED) ids.splice(0, ids.length - REMEMBERED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* private window, full storage: this session still remembers */
  }
}

/**
 * Events search has no use for: NIP-70 protected ones (`["-"]`, only their
 * author may publish them), ephemeral kinds (20000–29999, never stored), and
 * ones past their NIP-40 expiration.
 */
function unseedable(event: NostrEvent): boolean {
  return (
    event.tags.some((t) => t.length === 1 && t[0] === "-") ||
    (event.kind >= 20000 && event.kind < 30000) ||
    isExpired(event, Math.floor(Date.now() / 1000))
  );
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
  if (!found || !searchAnswered || unseedable(found)) return false;
  return !searchCopy || (searchCopy.id !== found.id && beats(found, searchCopy));
}

/**
 * Hand `event` to the search relay. Fire and forget: the reader already sees
 * the event, and a rejection (a kind search does not index, a relay that
 * changed its mind) changes nothing for them.
 */
export function seedSearchRelay(event: NostrEvent): void {
  if (remembered().includes(event.id)) return;
  let relay: ReturnType<typeof searchRelay>;
  try {
    relay = searchRelay();
  } catch {
    relay = null;
  }
  if (!relay) return;
  remember(event.id);
  // The wire fields alone: the store hangs its own caches on the objects it holds.
  const { id, pubkey, created_at, kind, tags, content, sig } = event;
  relay
    .publish({ id, pubkey, created_at, kind, tags, content, sig }, { timeout: 10_000, retries: false })
    .catch(() => {});
}
