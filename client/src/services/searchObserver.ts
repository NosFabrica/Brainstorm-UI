import { lastValueFrom, timeout, toArray } from "rxjs";
import { searchRelay } from "@/lib/searchRelay";

const TIMEOUT_MS = 5000;

/**
 * Whether the search relay ranks through `pubkey` yet: any profile comes back through its
 * `observer:` lens. The gate fails closed, so a hit means a projected rank — though while the
 * relay is still projecting the assistant's cards, ranks may be partial. No hit, error or
 * timeout is "not available".
 */
export async function isSearchObserverOnRelay(pubkey: string): Promise<boolean> {
  try {
    const relay = searchRelay();
    if (!relay) return false;
    const events = await lastValueFrom(
      relay.request([{ kinds: [0], limit: 1, search: `observer:${pubkey}` }]).pipe(toArray(), timeout(TIMEOUT_MS)),
    );
    return events.some((e) => e.kind === 0);
  } catch {
    return false;
  }
}
