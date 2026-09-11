/**
 * Trending topics for the home feed, computed from the notes the feed
 * already fetched — no extra requests. A tag counts once per author, needs
 * at least two different voices (one person's ten posts is not a trend), and
 * the list is short and ranked by voices, then by mentions.
 */
import type { SearchHit } from "@/services/search";

export interface TrendingTag {
  tag: string;
  /** Distinct authors who used it. */
  voices: number;
}

export function trendingTags(hits: SearchHit[], opts: { max?: number; minVoices?: number } = {}): TrendingTag[] {
  const max = opts.max ?? 8;
  const minVoices = opts.minVoices ?? 2;
  const voicesByTag = new Map<string, Set<string>>();
  const mentions = new Map<string, number>();
  for (const hit of hits) {
    for (const t of hit.event.tags) {
      if (t[0] !== "t" || !t[1]) continue;
      const tag = t[1].trim().toLowerCase();
      // Too short to mean anything, too long to be a topic.
      if (tag.length < 2 || tag.length > 32) continue;
      (voicesByTag.get(tag) ?? voicesByTag.set(tag, new Set()).get(tag)!).add(hit.event.pubkey);
      mentions.set(tag, (mentions.get(tag) ?? 0) + 1);
    }
  }
  return [...voicesByTag.entries()]
    .map(([tag, voices]) => ({ tag, voices: voices.size, mentions: mentions.get(tag) ?? 0 }))
    .filter((t) => t.voices >= minVoices)
    .sort((a, b) => b.voices - a.voices || b.mentions - a.mentions || a.tag.localeCompare(b.tag))
    .slice(0, max)
    .map(({ tag, voices }) => ({ tag, voices }));
}
