import { type NostrEvent } from "applesauce-core/helpers";
import { lookupTrustSignals } from "@/services/trustSignals";

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
 * swap the body of `scoreHashtagAuthors` for that call — the page contract
 * (a trust-ranked, spam-filtered list of events) stays identical.
 */

/** House influence per author, from the shared batched memo. */
function scoreAuthor(pubkey: string): Promise<number | null> {
  return lookupTrustSignals(pubkey).then((s) => s.influence);
}

/** How many distinct authors we score per query — bounds the API fan-out. */
const MAX_SCORED_AUTHORS = 50;

/** The most recent distinct authors of a hashtag's candidates (newest-first), up to the scoring cap. */
export function hashtagAuthors(events: NostrEvent[]): string[] {
  const authors: string[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (!seen.has(ev.pubkey)) {
      seen.add(ev.pubkey);
      authors.push(ev.pubkey);
    }
    if (authors.length >= MAX_SCORED_AUTHORS) break;
  }
  return authors;
}

/**
 * An author WoT score per author. The PAGE applies the spam threshold +
 * Top/Latest ordering, so its strictness and sort controls re-filter instantly
 * with no refetch. Authors not scored (or not in the WoT graph) are treated as
 * untrusted.
 */
export async function scoreHashtagAuthors(authors: string[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  await Promise.all(
    authors.map(async (pk) => {
      const s = await scoreAuthor(pk);
      if (typeof s === "number" && Number.isFinite(s)) scores.set(pk, s);
    }),
  );
  return scores;
}
