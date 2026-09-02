/**
 * Near-duplicate collapsing — Google's "similar results are hidden", for
 * relay hits. The archetype (live-probed): one author's monthly "Bitcoin
 * Liverpool Meet(up)" calendar entries — legitimate distinct events on the
 * wire, one thing to a searcher.
 *
 * Cluster key: same author AND near-identical title (normalized token
 * overlap — catches Meet/Meetup/BTC wobble without merging genuinely
 * different content). Primary: the next-upcoming occurrence for calendar/
 * live kinds, the newest otherwise. Cluster order follows first appearance,
 * so the relay's ranking still owns the page.
 */
import type { SearchHit } from "@/services/search";

export interface HitCluster {
  primary: SearchHit;
  /** The collapsed rest — the "+N more" chip's content, hidden by default. */
  others: SearchHit[];
}

/** Kinds where "next upcoming" beats "newest" as the face of the cluster. */
const SCHEDULED_KINDS = new Set([30311, 30312, 30313, 31922, 31923, 31924]);

function titleOf(hit: SearchHit): string {
  const tag = hit.event.tags.find((t) => t[0] === "title" || t[0] === "name")?.[1];
  return tag ?? hit.event.content.slice(0, 80);
}

function tokensOf(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      // Meet/Meetup, and similar suffix wobble, normalize by stem-ish crop.
      .map((w) => (w.length > 4 ? w.slice(0, 4) : w)),
  );
}

function similar(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size) >= 0.6;
}

function startOf(hit: SearchHit): number {
  const start = hit.event.tags.find((t) => t[0] === "start")?.[1];
  const n = Number(start);
  return Number.isFinite(n) && n > 0 ? n : hit.event.created_at;
}

function betterPrimary(a: SearchHit, b: SearchHit, now: number): SearchHit {
  if (SCHEDULED_KINDS.has(a.event.kind) || SCHEDULED_KINDS.has(b.event.kind)) {
    const [sa, sb] = [startOf(a), startOf(b)];
    const [aFuture, bFuture] = [sa >= now, sb >= now];
    if (aFuture !== bFuture) return aFuture ? a : b; // upcoming beats past
    if (aFuture) return sa <= sb ? a : b; // soonest upcoming
    return sa >= sb ? a : b; // else most recent past
  }
  return a.event.created_at >= b.event.created_at ? a : b;
}

export interface CollapseOptions {
  /** Google's host-diversity move: at most this many clusters per author;
   *  overflow folds into the author's last kept cluster's chip. */
  maxPerAuthor?: number;
}

export function collapseHits(
  hits: SearchHit[],
  now = Math.floor(Date.now() / 1000),
  options: CollapseOptions = {},
): HitCluster[] {
  const clusters: (HitCluster & { tokens: Set<string> })[] = [];
  for (const hit of hits) {
    const tokens = tokensOf(titleOf(hit));
    const home = clusters.find(
      (c) => c.primary.event.pubkey === hit.event.pubkey && similar(c.tokens, tokens),
    );
    if (!home) {
      clusters.push({ primary: hit, others: [], tokens });
      continue;
    }
    const winner = betterPrimary(home.primary, hit, now);
    if (winner === hit) {
      home.others.push(home.primary);
      home.primary = hit;
    } else {
      home.others.push(hit);
    }
  }
  const plain = clusters.map(({ primary, others }) => ({ primary, others }));
  const cap = options.maxPerAuthor;
  if (!cap) return plain;

  const kept: HitCluster[] = [];
  const perAuthor = new Map<string, HitCluster[]>();
  for (const cluster of plain) {
    const author = cluster.primary.event.pubkey;
    const mine = perAuthor.get(author) ?? [];
    if (mine.length < cap) {
      mine.push(cluster);
      perAuthor.set(author, mine);
      kept.push(cluster);
    } else {
      const last = mine[mine.length - 1];
      last.others.push(cluster.primary, ...cluster.others);
    }
  }
  return kept;
}
