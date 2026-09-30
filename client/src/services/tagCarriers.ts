/**
 * A tag's carriers as people for search. The team (2026-09-29): a query that
 * matches a tag should find the people the network tagged, with the tag on
 * their row — the collection, how it was formed, and where to look deeper.
 *
 * The carriers come from the same trust-filtered read the profile chip and
 * the tag page use (services/tags), under whatever observer the surface is
 * showing, so the rows inherit the trust the chip already has. Once per tag
 * and observer for the session; a failed read is nobody, silently, and is
 * asked again next time.
 */
import type { CarrierPerson } from "@/lib/tagCarrierPeople";
import { profileToSearchResult, type ProfileLite } from "@/lib/profileSearch";
import { fetchProfileMap } from "@/services/nostr";
import { fetchTagDetail, type TagIdentity } from "@/services/tags";

async function lookup(tag: TagIdentity, observer: string): Promise<CarrierPerson[]> {
  const detail = await fetchTagDetail(tag.authorPubkey, tag.slug, undefined, observer);
  const carriers = detail.carriers;
  if (carriers.length === 0) return [];
  const profiles = (await fetchProfileMap(carriers.map((c) => c.pubkey)).catch(() => new Map())) as Map<
    string,
    ProfileLite
  >;
  return carriers.map((c) => ({
    ...profileToSearchResult(c.pubkey, profiles.get(c.pubkey)),
    applications: c.applications,
    addedAt: c.addedAt,
  }));
}

const cached = new Map<string, Promise<CarrierPerson[]>>();

export function fetchTagCarrierPeople(tag: TagIdentity, observer: string): Promise<CarrierPerson[]> {
  const key = `${observer}|${tag.authorPubkey}|${tag.slug}`;
  const held = cached.get(key);
  if (held) return held;
  const p = lookup(tag, observer).catch(() => {
    cached.delete(key); // a failure is not remembered
    return [] as CarrierPerson[];
  });
  cached.set(key, p);
  return p;
}

/** Test seam. */
export function __resetTagCarriers(): void {
  cached.clear();
}
