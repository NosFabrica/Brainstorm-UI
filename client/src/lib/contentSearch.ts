import { fetchNotesByHashtag } from "@/services/nostr";
import { type NostrEvent } from "applesauce-core/helpers";
import { apiClient } from "@/services/api";

export type SortMode = "top" | "latest";

/**
 * Apply the spam threshold + ordering to scored candidates — this is what the
 * topic page's strictness (threshold) and Top/Latest (sort) controls drive.
 * "top" ranks by author trust (recency tiebreak); "latest" is newest-first.
 * Both only ever show authors with positive WoT presence at/above `threshold`.
 */
export function rankHashtagEvents(
  events: NostrEvent[],
  scores: Map<string, number>,
  threshold: number,
  sort: SortMode,
): NostrEvent[] {
  const trusted = events.filter((ev) => {
    const s = scores.get(ev.pubkey);
    return typeof s === "number" && s > 0 && s >= threshold;
  });
  return [...trusted].sort((a, b) => {
    if (sort === "latest") return (b.created_at ?? 0) - (a.created_at ?? 0);
    const sa = scores.get(a.pubkey) ?? 0;
    const sb = scores.get(b.pubkey) ?? 0;
    if (sb !== sa) return sb - sa;
    return (b.created_at ?? 0) - (a.created_at ?? 0);
  });
}

/**
 * Content search — v1 runs entirely against live relays and ranks results by
 * author Web-of-Trust score (house POV) client-side. This is deliberately a
 * thin facade: when a backend content index (Vespa / NIP-50 note search) lands,
 * swap the body of `searchContentByHashtag` for that call — the page contract
 * (a trust-ranked, spam-filtered list of events) stays identical.
 */

/** Session-memoized house-influence lookups, so overlapping tags/authors don't
 *  re-hit the API. Value is a promise (dedupes concurrent lookups too). */
const scoreCache = new Map<string, Promise<number | null>>();

function scoreAuthor(pubkey: string): Promise<number | null> {
  let p = scoreCache.get(pubkey);
  if (!p) {
    p = apiClient.getHouseInfluence(pubkey).catch(() => null);
    scoreCache.set(pubkey, p);
  }
  return p;
}

export interface HashtagContent {
  /** Trust-ranked, spam-filtered events (kind 1 + 30023). */
  events: NostrEvent[];
  /** author pubkey → house-influence score (0..1), for badges / debugging. */
  scores: Map<string, number>;
  /** Total candidates fetched before trust filtering (for "N of M" context). */
  candidateCount: number;
}

/** How many distinct authors we score per query — bounds the API fan-out. */
const MAX_SCORED_AUTHORS = 50;

/**
 * Fetch candidate content for a hashtag and attach an author WoT score to each.
 * Returns the raw candidates (newest-first) plus the `scores` map — the PAGE
 * applies the spam threshold + Top/Latest ordering, so its strictness and sort
 * controls re-filter instantly with no refetch. Authors beyond the scoring cap
 * (or not in the WoT graph) simply have no score and are treated as untrusted.
 */
export async function searchContentByHashtag(
  tag: string,
  opts: { limit?: number } = {},
): Promise<HashtagContent> {
  const events = await fetchNotesByHashtag(tag, { limit: opts.limit ?? 100 });
  const candidateCount = events.length;

  // events arrive newest-first; take the most-recent authors up to the cap.
  const authors: string[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (!seen.has(ev.pubkey)) {
      seen.add(ev.pubkey);
      authors.push(ev.pubkey);
    }
    if (authors.length >= MAX_SCORED_AUTHORS) break;
  }

  const scores = new Map<string, number>();
  await Promise.all(
    authors.map(async (pk) => {
      const s = await scoreAuthor(pk);
      if (typeof s === "number" && Number.isFinite(s)) scores.set(pk, s);
    }),
  );

  return { events, scores, candidateCount };
}
