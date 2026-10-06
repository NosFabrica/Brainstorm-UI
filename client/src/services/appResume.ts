/**
 * What the app does when it comes back to the foreground (lib/appResume) —
 * the installed phone app's stand-in for the reload button it doesn't have.
 *
 *   - Relays: a socket dropped while away reconnects now, not after the
 *     backoff it built up while suspended (lib/relayPool).
 *   - The deploy: a newer build is looked for (lib/serviceWorker).
 *   - The API's answers: kept forever while the app runs (`staleTime:
 *     Infinity`, lib/queryClient), so after a long absence they are refetched —
 *     the screen on view at once, the rest when next opened — as when the API
 *     recovers from an outage.
 *
 * The private-message outbox retries on its own return (services/dm/engine).
 */
import { onAppResume } from "@/lib/appResume";
import { queryClient } from "@/lib/queryClient";
import { wakeRelays } from "@/lib/relayPool";
import { checkForUpdate } from "@/lib/serviceWorker";

/** Away this long, and what the screens show is worth asking for again. */
export const REFRESH_AFTER_MS = 10 * 60_000;

export function startAppResume(): () => void {
  return onAppResume((awayMs) => {
    wakeRelays();
    checkForUpdate();
    if (awayMs >= REFRESH_AFTER_MS) void queryClient.invalidateQueries();
  });
}
