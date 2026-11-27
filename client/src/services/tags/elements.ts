/** Tag-elements and their names, cached for the session (positive only). */
import { fetchTagEvents } from "./read";
import { TAG_ELEMENT_KIND, tagValue, type NostrEvent } from "./shared";

/**
 * Tag-elements, cached for the session. ACCEPTANCE C1 asks that "repeat reads
 * hit the cache, not the relay", and without this two profiles carrying the
 * same tag each re-fetched its element: the catalogue read alone resolves every
 * tag in the corpus, then every profile view resolved its own again.
 *
 * Both caches are POSITIVE ONLY. A miss is not cached, because an element the
 * relay doesn't have yet is exactly what someone minting a tag creates a second
 * later — negative caching would hide their own new tag from them for the rest
 * of the session. Elements are immutable at a given id, and a coordinate's
 * name/description changing is a cosmetic staleness we accept until reload.
 */
export const elementsById = new Map<string, TagRefResolved>();
export const elementMetaByCoord = new Map<string, { name: string; description?: string }>();

/** A tag-element's coordinates, however we got to them. */
export interface TagRefResolved {
  tagAuthor: string;
  slug: string;
}

/**
 * Resolve tag-elements to display names. A tag-element is itself a kind-39999
 * keyed `["d", <slug>]` under its author, with `{"tag":{name,description}}` in
 * content. Unresolvable tags still render — the slug is a usable label.
 */
/**
 * Park a tag-element's display metadata under its coordinate. Shared by the
 * two paths that end up holding an element event, so neither has to re-fetch
 * what the other already had.
 */
export function cacheElementMeta(authorPubkey: string, slug: string, content: string) {
  try {
    const parsed = JSON.parse(content) as { tag?: { name?: string; description?: string } };
    if (parsed?.tag?.name) {
      elementMetaByCoord.set(`${authorPubkey}|${slug}`, {
        name: parsed.tag.name,
        description: parsed.tag.description,
      });
    }
  } catch {
    // malformed content → callers fall through to the slug
  }
}

export async function resolveTagNames(
  refs: Array<{ authorPubkey: string; slug: string }>,
): Promise<Map<string, { name: string; description?: string }>> {
  const out = new Map<string, { name: string; description?: string }>();
  if (!refs.length) return out;

  // Serve what we already know, and only ask the relay about the rest. All
  // cached → no query at all, which is the C1 property.
  const unresolved: Array<{ authorPubkey: string; slug: string }> = [];
  for (const r of refs) {
    const key = `${r.authorPubkey}|${r.slug}`;
    const hit = elementMetaByCoord.get(key);
    if (hit) out.set(key, hit);
    else unresolved.push(r);
  }
  if (!unresolved.length) return out;

  // Chunked by slug. The catalogue now carries every tag anyone has used, so
  // an unchunked filter would ask for hundreds of `#d` values in one REQ —
  // past what some relays accept, and a rejection here would blank every name
  // on the page.
  const slugs = Array.from(new Set(unresolved.map((r) => r.slug)));
  const authors = Array.from(new Set(unresolved.map((r) => r.authorPubkey)));
  for (let i = 0; i < slugs.length; i += 200) {
    let events: NostrEvent[] = [];
    try {
      events = await fetchTagEvents({
        kinds: [TAG_ELEMENT_KIND],
        authors,
        "#d": slugs.slice(i, i + 200),
      });
    } catch {
      continue; // names are cosmetic; slugs carry the meaning
    }
    for (const ev of events) {
      const d = tagValue(ev, "d");
      if (!d) continue;
      cacheElementMeta(ev.pubkey, d, ev.content);
      const key = `${ev.pubkey}|${d}`;
      const meta = elementMetaByCoord.get(key);
      if (meta) out.set(key, meta);
    }
  }
  return out;
}
