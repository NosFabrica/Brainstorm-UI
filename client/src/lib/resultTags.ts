import type { SearchHit } from "@/services/search";

/** A tag some of a search's results carry: what a tag filter offers. */
export interface ResultTag {
  /** `<tag author>|<slug>`, the tag's identity (services/tags). */
  key: string;
  authorPubkey: string;
  slug: string;
  name: string;
  description?: string;
}

/** What a tagging names a result by. A person by pubkey, an addressable event by its coordinate too. */
export interface TagTargets {
  pubkeys: string[];
  /** Event ids, and addressable events' coordinates. */
  events: string[];
}

const isAddressable = (kind: number) => kind >= 30000 && kind < 40000;

/**
 * What a result is tagged as: a profile is its person (tagged by pubkey), anything else the event
 * itself — by id, and an addressable one (a Dictionary list item, an article) by its coordinate as
 * well, which is how most taggings name it.
 */
export function targetsOf(hit: SearchHit): string[] {
  const { event } = hit;
  if (event.kind === 0) return [event.pubkey];
  if (!isAddressable(event.kind)) return [event.id];
  const d = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  return [event.id, `${event.kind}:${event.pubkey}:${d}`];
}

/** Every result's targets, split the way the tag readers ask them. */
export function tagTargets(hits: readonly SearchHit[]): TagTargets {
  const pubkeys = new Set<string>();
  const events = new Set<string>();
  for (const h of hits) {
    if (h.event.kind === 0) pubkeys.add(h.event.pubkey);
    else for (const t of targetsOf(h)) events.add(t);
  }
  return { pubkeys: [...pubkeys], events: [...events] };
}

/**
 * The tags among these results, most carried first (then by name, so the row holds still), and
 * which each result carries — by event id. `tagsOn` answers for one target, undefined while it is
 * not yet known.
 */
export function gatherTags(
  hits: readonly SearchHit[],
  tagsOn: (target: string) => readonly ResultTag[] | undefined,
): { tags: ResultTag[]; byHit: Map<string, Set<string>> } {
  const tags = new Map<string, ResultTag>();
  const carriers = new Map<string, number>();
  const byHit = new Map<string, Set<string>>();
  for (const h of hits) {
    const keys = new Set<string>();
    for (const target of targetsOf(h))
      for (const tag of tagsOn(target) ?? []) {
        keys.add(tag.key);
        if (!tags.has(tag.key)) tags.set(tag.key, tag);
      }
    if (!keys.size) continue;
    byHit.set(h.event.id, keys);
    for (const k of keys) carriers.set(k, (carriers.get(k) ?? 0) + 1);
  }
  const ordered = [...tags.values()].sort(
    (a, b) => carriers.get(b.key)! - carriers.get(a.key)! || a.name.localeCompare(b.name),
  );
  return { tags: ordered, byHit };
}
