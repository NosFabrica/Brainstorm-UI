/**
 * What became of each issue and patch on an Issues or PRs page, and how much conversation each has
 * (services/search fetchGitStatuses, fetchGitCommentCounts), asked as the page's items arrive.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchGitCommentCounts, fetchGitStatuses, type SearchHit, type SearchTab } from "@/services/search";
import { isGitItem } from "@/lib/gitStatus";
import { isGitItemTab } from "@/components/search/tabKinds";

/**
 * Issues and PRs tabs: what became of each issue and patch — one request per page,
 * keyed by item id (NIP-34 status events, newest wins; none means open) — and its comments.
 */
export function useGitItemAsks(
  hits: readonly SearchHit[],
  tab: SearchTab,
): { gitStatuses: Map<string, { kind: number; at: number }>; gitComments: Map<string, number> } {
  const [gitStatuses, setGitStatuses] = useState<Map<string, { kind: number; at: number }>>(new Map());
  const [gitComments, setGitComments] = useState<Map<string, number>>(new Map());
  const gitItemIds = useMemo(
    () => (isGitItemTab(tab) ? hits.filter((h) => isGitItem(h.event.kind)).map((h) => h.event.id) : []),
    [hits, tab],
  );
  const gitIdsKey = gitItemIds.join(",");
  // Read through a ref so the asks below stay keyed on the ids alone.
  const gitItems = useRef(new Map<string, NostrEvent>());
  gitItems.current = useMemo(
    () => new Map(hits.filter((h) => isGitItem(h.event.kind)).map((h) => [h.event.id, h.event])),
    [hits],
  );
  // Each streamed snapshot or "more" page asks only after the ids it adds —
  // not the whole growing list again. A generation drops answers that land
  // after the page emptied (a new tab), so they can't refill it.
  const gitFetched = useRef({ gen: 0, ids: new Set<string>() });
  useEffect(() => {
    const seen = gitFetched.current;
    if (!gitIdsKey) {
      seen.gen += 1;
      seen.ids = new Set();
      setGitStatuses(new Map());
      setGitComments(new Map());
      return;
    }
    const ids = gitIdsKey.split(",").filter((id) => !seen.ids.has(id));
    if (ids.length === 0) return;
    for (const id of ids) seen.ids.add(id);
    const gen = seen.gen;
    // The items themselves: whose status counts is their author's and their repo's (NIP-34).
    const items = ids.map((id) => gitItems.current.get(id) ?? id);
    void fetchGitStatuses(items).then((m) => {
      if (gitFetched.current.gen === gen && m.size) setGitStatuses((prev) => new Map([...prev, ...m]));
    });
    void fetchGitCommentCounts(ids).then((m) => {
      if (gitFetched.current.gen === gen && m.size) setGitComments((prev) => new Map([...prev, ...m]));
    });
  }, [gitIdsKey]);
  return { gitStatuses, gitComments };
}
