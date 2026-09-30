/**
 * The musicians the network has tagged — the tagging list behind the
 * "Musician" chip on a profile — as people for the Music tab. The team
 * (2026-09-24): search should find music through the tagging lists too;
 * most tagged musicians publish no track events and were invisible there.
 *
 * The carriers come from the same trust-filtered read the profile chip
 * uses (services/tags), under the house observer, so the shelf inherits
 * the trust the chip already has. Once per session; a failed read is
 * nobody, silently, and is asked again on the next visit.
 */
import { CATEGORY_TAGS } from "@/lib/dlists";
import { profileToSearchResult, type ProfileLite, type SearchResult } from "@/lib/profileSearch";
import { fetchProfileMap } from "@/services/nostr";
import { fetchTagDetail } from "@/services/tags";

async function lookup(): Promise<SearchResult[]> {
  const tags = CATEGORY_TAGS.filter((t) => t.category === "music");
  const details = await Promise.all(tags.map((t) => fetchTagDetail(t.author, t.slug, undefined, "house")));
  const pubkeys = [...new Set(details.flatMap((d) => d.carriers.map((c) => c.pubkey)))];
  if (pubkeys.length === 0) return [];
  const profiles = (await fetchProfileMap(pubkeys).catch(() => new Map())) as Map<string, ProfileLite>;
  return pubkeys.map((pubkey) => profileToSearchResult(pubkey, profiles.get(pubkey)));
}

let cached: Promise<SearchResult[]> | null = null;

export function fetchTaggedMusicians(): Promise<SearchResult[]> {
  if (cached) return cached;
  const p = lookup().catch(() => {
    cached = null; // a failure is not remembered
    return [] as SearchResult[];
  });
  cached = p;
  return p;
}

/** Test seam. */
export function __resetTaggedMusicians(): void {
  cached = null;
}
