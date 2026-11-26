/** Repos, Issues and PRs: each item's state and labels as facets, and forks folded behind their codebase. */
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { foldForks, gitLabelsOf, gitStateOf, isGitItem, peopleBeforeAgents, type GitState } from "@/lib/gitStatus";
import { capPerAuthor } from "@/lib/searchCollapse";
import type { DisplayRow, Facet } from "./types";

/** What became of each issue and patch, by item id (NIP-34 status events, newest wins; none means open). */
export type GitStatuses = ReadonlyMap<string, { kind: number; at: number }>;

/** An issue's or a patch's state, from its statuses; null for anything else. */
export function gitItemState(e: NostrEvent, statuses: GitStatuses): GitState | null {
  return isGitItem(e.kind) ? gitStateOf(statuses.get(e.id)?.kind, e.kind) : null;
}

/**
 * The labels maintainers share, most common first. A label is a triage
 * convention when more than one author reaches for it; one author's private
 * vocabulary — probed 2026-09-05, a test harness's "qa", "conflict-pair",
 * "nonlinear" led the strip — stays on their cards. On a one-author page
 * every label is theirs anyway, so all count.
 */
export function gitLabelFacets(hits: readonly SearchHit[]): Facet[] {
  const counts = new Map<string, number>();
  const authorsOf = new Map<string, Set<string>>();
  const authors = new Set<string>();
  for (const h of hits) {
    if (!isGitItem(h.event.kind)) continue;
    authors.add(h.event.pubkey);
    for (const l of gitLabelsOf(h.event)) {
      counts.set(l, (counts.get(l) ?? 0) + 1);
      (authorsOf.get(l) ?? authorsOf.set(l, new Set()).get(l)!).add(h.event.pubkey);
    }
  }
  return [...counts.entries()]
    .filter(([l]) => authors.size === 1 || (authorsOf.get(l)?.size ?? 0) > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
}

/** The states the page's items are in, counted, in a fixed order. */
export function gitStateFacets(hits: readonly SearchHit[], statuses: GitStatuses): Facet<GitState>[] {
  const counts = new Map<GitState, number>();
  for (const h of hits) {
    const st = gitItemState(h.event, statuses);
    if (st) counts.set(st, (counts.get(st) ?? 0) + 1);
  }
  const order: GitState[] = ["open", "merged", "resolved", "closed", "draft"];
  return order.filter((k) => counts.has(k)).map((k) => [k, counts.get(k)!] as Facet<GitState>);
}

/** Issues' and PRs' rows: narrowed by state and label, people's before agents'. */
export function gitItemRows(
  shown: SearchHit[],
  s: { state: GitState | null; label: string | null; statuses: GitStatuses },
): SearchHit[] {
  if (s.state) shown = shown.filter((h) => gitItemState(h.event, s.statuses) === s.state);
  const label = s.label;
  if (label) shown = shown.filter((h) => gitLabelsOf(h.event).includes(label));
  // People's issues before agents' — the partition Latest uses for feeds.
  return peopleBeforeAgents(shown, (h) => ({ event: h.event, author: h.author }));
}

/**
 * Repos, Issues and PRs. One codebase, one card: forks fold behind the most trusted
 * maintainer's announcement and open on a tap, each naming its parent.
 * And one maintainer, three cards: Google's host-diversity rule. Probed
 * 2026-09-05, one company's 23 bare repos filled the first screens; the
 * rest now ride their third card's "+20 more from …" chip. A page that
 * is all one author's has no one to make room for, so it stays whole.
 */
export function gitRows(
  shown: SearchHit[],
  s: { expanded: ReadonlySet<string>; scoreOf: (pubkey: string) => number | null | undefined },
): DisplayRow[] {
  const repoName = (h: SearchHit) =>
    h.event.tags.find((t) => t[0] === "name")?.[1] ?? h.event.tags.find((t) => t[0] === "d")?.[1] ?? "the original";
  const groups = foldForks(shown, (h) => ({
    event: h.event,
    score: h.author?.wotRank ?? s.scoreOf(h.event.pubkey) ?? null,
  }));
  const authors = new Set(shown.map((h) => h.event.pubkey));
  const rows =
    authors.size > 1
      ? capPerAuthor(groups, (g) => g.primary.event.pubkey, 3)
      : groups.map((g) => ({ item: g, overflow: [] as typeof groups }));
  const folded: DisplayRow[] = [];
  for (const { item: g, overflow } of rows) {
    const id = g.primary.event.id;
    const open = s.expanded.has(id);
    const forks = g.forks.length;
    const more = overflow.reduce((n, o) => n + 1 + o.forks.length, 0);
    const who = g.primary.author?.displayName || g.primary.author?.name || "this maintainer";
    const parts = [
      forks > 0 ? `${forks} ${forks === 1 ? "fork" : "forks"}` : null,
      more > 0 ? `+${more} more from ${who}` : null,
    ].filter(Boolean);
    folded.push({
      hit: g.primary,
      collapsedCount: open ? 0 : forks + more,
      clusterId: id,
      chipLabel: parts.join(" · "),
    });
    if (open) {
      for (const f of g.forks) folded.push({ hit: f, collapsedCount: 0, clusterId: "", forkOf: repoName(g.primary) });
      for (const o of overflow) {
        folded.push({ hit: o.primary, collapsedCount: 0, clusterId: "" });
        for (const f of o.forks) folded.push({ hit: f, collapsedCount: 0, clusterId: "", forkOf: repoName(o.primary) });
      }
    }
  }
  return folded;
}
