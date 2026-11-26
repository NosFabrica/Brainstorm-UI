/**
 * What each NIP-75 zap goal on a Fundraisers page has raised (services/search fetchGoalProgress),
 * asked as the page's goals arrive.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchGoalProgress, type GoalProgress, type SearchHit, type SearchTab } from "@/services/search";

/** A goal a complete answer found no receipt for: one object, so a memoised card sees no change. */
const NO_RAISED: GoalProgress = { sats: 0, zappers: [] };

/** A goal's progress by its event, once known; undefined for anything else or not yet known. */
export function useGoalProgress(
  hits: readonly SearchHit[],
  tab: SearchTab,
): (e: NostrEvent) => GoalProgress | undefined {
  // Fundraisers tab: what each zap goal has raised. Like the git counts
  // (hooks/useGitItemAsks), each streamed snapshot or "more" page asks only after the goals
  // it adds, and a generation drops answers that land after the page emptied.
  // `settled` holds the goals a complete answer covered: only there does no
  // receipt mean "raised nothing" rather than "not known".
  const [goalProgress, setGoalProgress] = useState<{ byGoal: Map<string, GoalProgress>; settled: Set<string> }>({
    byGoal: new Map(),
    settled: new Set(),
  });
  const goalIdsKey = useMemo(
    () => (tab === "fundraisers" ? hits.filter((h) => h.event.kind === 9041).map((h) => h.event.id) : []).join(","),
    [hits, tab],
  );
  // Each shown goal's closed_at: receipts after it don't count (NIP-75). Read
  // through a ref so the fetch below stays keyed on the ids alone.
  const goalCloses = useRef(new Map<string, number>());
  goalCloses.current = useMemo(() => {
    const m = new Map<string, number>();
    if (tab !== "fundraisers") return m;
    for (const h of hits) {
      if (h.event.kind !== 9041) continue;
      const closes = Number(h.event.tags.find((t) => t[0] === "closed_at")?.[1]);
      if (Number.isFinite(closes) && closes > 0) m.set(h.event.id, closes);
    }
    return m;
  }, [hits, tab]);
  const goalFetched = useRef({ gen: 0, ids: new Set<string>() });
  useEffect(() => {
    const seen = goalFetched.current;
    if (!goalIdsKey) {
      seen.gen += 1;
      seen.ids = new Set();
      setGoalProgress({ byGoal: new Map(), settled: new Set() });
      return;
    }
    const ids = goalIdsKey.split(",").filter((id) => !seen.ids.has(id));
    if (ids.length === 0) return;
    for (const id of ids) seen.ids.add(id);
    const gen = seen.gen;
    void fetchGoalProgress(ids, undefined, goalCloses.current).then(({ byGoal, complete }) => {
      if (goalFetched.current.gen !== gen) return;
      setGoalProgress((prev) => ({
        byGoal: new Map([...prev.byGoal, ...byGoal]),
        settled: complete ? new Set([...prev.settled, ...ids]) : prev.settled,
      }));
    });
  }, [goalIdsKey]);
  return (e: NostrEvent): GoalProgress | undefined =>
    tab !== "fundraisers" || e.kind !== 9041
      ? undefined
      : (goalProgress.byGoal.get(e.id) ?? (goalProgress.settled.has(e.id) ? NO_RAISED : undefined));
}
