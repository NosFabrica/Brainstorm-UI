/**
 * A NIP-34 repo's side questions, asked once per repo per window and shared by
 * every surface that shows it (lib/askOnce through useStoreEvents, docs/adr/0005):
 * its issue and patch counts, its recent items with what became of each and
 * how much talk each drew, and its forks.
 *
 * Event lists render from the store's copies of the ask's answer (a deletion
 * takes one off); a tally or a status map is the ask's own answer.
 */
import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import {
  fetchGitCommentCounts,
  fetchGitStatuses,
  fetchRepoActivity,
  fetchRepoCounts,
  fetchRepoForks,
  type RepoCounts,
} from "@/services/search";

const NO_STATUSES = new Map<string, { kind: number; at: number }>();
const NO_COMMENTS = new Map<string, number>();

/** Issues, patches, contributors and last activity; null until answered. `enabled` false asks nothing. */
export function useRepoCounts(address: string | null, enabled = true): RepoCounts | null {
  const read = useStoreEvents(address && enabled ? `repo-counts:${address}` : null, null, () =>
    address ? fetchRepoCounts(address) : Promise.resolve(null),
  );
  return (read.answer as RepoCounts | null | undefined) ?? null;
}

/**
 * The repo's recent issues and patches, newest first, and, once they are in
 * (CODING_STANDARDS, "settled before dependents"), each one's status and comment count.
 */
export function useRepoActivity(address: string | null): {
  items: NostrEvent[];
  statuses: Map<string, { kind: number; at: number }>;
  comments: Map<string, number>;
} {
  const activity = useStoreEvents(address ? `repo-activity:${address}` : null, null, () =>
    address ? fetchRepoActivity(address) : Promise.resolve([]),
  );
  const items = activity.events;
  const idsKey = activity.settled ? items.map((i) => i.id).join(",") : "";
  const statuses = useStoreEvents(idsKey ? `repo-activity-statuses:${idsKey}` : null, null, () =>
    fetchGitStatuses(items),
  );
  const comments = useStoreEvents(idsKey ? `repo-activity-comments:${idsKey}` : null, null, () =>
    fetchGitCommentCounts(idsKey.split(",")),
  );
  return useMemo(
    () => ({
      items,
      statuses: (statuses.answer as Map<string, { kind: number; at: number }> | undefined) ?? NO_STATUSES,
      comments: (comments.answer as Map<string, number> | undefined) ?? NO_COMMENTS,
    }),
    [items, statuses.answer, comments.answer],
  );
}

/** Other announcements of the same codebase (by its earliest unique commit), one per maintainer. */
export function useRepoForks(lineage: string | null, address: string | null): NostrEvent[] {
  return useStoreEvents(lineage && address ? `repo-forks:${lineage}:${address}` : null, null, () =>
    lineage && address ? fetchRepoForks(lineage, address) : Promise.resolve([]),
  ).events;
}
