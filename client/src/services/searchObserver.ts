import { lastValueFrom, toArray } from "rxjs";
import type { NostrEvent } from "nostr-tools";
import { beats } from "@/lib/relayRequest";
import { searchRelay } from "@/lib/searchRelay";

const TIMEOUT_MS = 5000;

/**
 * Not `observer:`: the relay trust-gates an observer's plain reads, and the user and their own
 * assistant sit below the floor.
 */
const SEARCH = "include:spam";

/**
 * Whether the search relay can rank through `pubkey`: it holds the user's newest 10040 naming
 * `taPubkey` for `30382:rank`, and a 30382 that assistant signed. One REQ, two `limit: 1` reads.
 * Checks stored cards, not projected ones. Error or timeout is "not available".
 */
export async function isSearchObserverOnRelay(pubkey: string, taPubkey: string): Promise<boolean> {
  const relay = searchRelay();
  if (!relay) return false;
  try {
    const events = await lastValueFrom(
      relay
        .request(
          [
            { kinds: [10040], authors: [pubkey], limit: 1, search: SEARCH },
            { kinds: [30382], authors: [taPubkey], limit: 1, search: SEARCH },
          ],
          { timeout: TIMEOUT_MS },
        )
        .pipe(toArray()),
    );
    const list = events
      .filter((e) => e.kind === 10040 && e.pubkey === pubkey)
      .reduce<NostrEvent | undefined>((best, e) => (beats(e, best) ? e : best), undefined);
    const namesAssistant = !!list?.tags.some((t) => t[0] === "30382:rank" && t[1] === taPubkey);
    return namesAssistant && events.some((e) => e.kind === 30382 && e.pubkey === taPubkey);
  } catch {
    return false;
  }
}
