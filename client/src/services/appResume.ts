/**
 * What the app does when it comes back to the foreground (lib/appResume) —
 * the installed phone app's stand-in for the reload button it doesn't have.
 *
 *   - Relays: a socket dropped while away reconnects now, not after the
 *     backoff it built up while suspended (lib/relayPool) — after a real
 *     absence, not a glance at another tab.
 *   - The deploy: a newer build is looked for (lib/serviceWorker), at most
 *     every few minutes.
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

/**
 * A glance at another tab or app is not an absence: a socket doesn't drop in
 * that time, and a relay that is down stays in its backoff. Returning after
 * this long (or the connection coming back) wakes the relays.
 */
export const WAKE_AFTER_MS = 5000;

/** Looking for a deploy costs a fetch of /sw.js; once in this long is plenty. */
export const UPDATE_CHECK_EVERY_MS = 5 * 60_000;

export function startAppResume(now: () => number = Date.now): () => void {
  let checkedAt = -Infinity;
  return onAppResume((awayMs, how) => {
    if (how !== "visible" || awayMs >= WAKE_AFTER_MS) wakeRelays();
    if (now() - checkedAt >= UPDATE_CHECK_EVERY_MS) {
      checkedAt = now();
      checkForUpdate();
    }
    if (awayMs >= REFRESH_AFTER_MS)
      void queryClient.invalidateQueries({ predicate: (query) => !keepsItsOwnTime(query) });
  });
}

/**
 * The tag reads (hooks/useTags) that come back on their own clock. They are
 * relay reads still kept in react-query (docs/adr/0005, "Tags (deferred)"),
 * each with a `staleTime` of its own — 2 to 30 minutes — so they are
 * refetched when they go stale, absence or no absence. The catalogue among
 * them walks the whole assertion history: re-asking it on every return to the
 * app cost the slowest read in the app for an answer its own window already
 * covers. Listed by key root; `appResume.test` holds the list to useTags' keys.
 */
export const TAG_QUERY_ROOTS: ReadonlySet<string> = new Set([
  "profile-tags",
  "tag-index",
  "tag-picker-options",
  "tag-comments",
  "tag-detail",
  "event-tags",
  "event-tags-batch",
  "my-assertions",
  "pinned-tags",
  "tag-notes",
]);

function keepsItsOwnTime(query: { queryKey: readonly unknown[] }): boolean {
  const root = query.queryKey[0];
  return typeof root === "string" && TAG_QUERY_ROOTS.has(root);
}
