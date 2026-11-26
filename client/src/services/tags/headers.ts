/** The kind-39999 tagging headers a note's taggings name, cached by coordinate (lib/addressCache). */
import { AddressCache } from "@/lib/addressCache";
import { fetchTagEvents } from "./read";
import { TAG_ELEMENT_KIND, tagValue, type NostrEvent } from "./shared";

/**
 * Tagging headers, held alongside the tag-elements. Same reasoning as
 * `elementMetaByCoord`: every note carrying a given tag points at the same
 * header, so resolving it once per note is a wasted round-trip per note.
 * Positive-only, for the same reason — a header minted seconds ago must not be
 * cached as absent. A header is addressable (39999): the newest version wins
 * whatever order relays answer in (NIP-01), and after a while a read asks again,
 * so an edited header reaches the page (lib/addressCache).
 */
const HEADER_TTL_MS = 10 * 60 * 1000;
export const headersByCoord = new AddressCache<NostrEvent>({ ttlMs: HEADER_TTL_MS, cap: 2000 });
/** A header a relay sent: held if it is the newest version of its coordinate. */
export const holdHeader = (ev: NostrEvent): NostrEvent => headersByCoord.hold(headerCoordOf(ev), ev);

/** `39999:<author>:tagging:<slug>-tagging` → its `d` tag. */
function headerDTagFromCoord(coord: string): string | null {
  const m = /^39999:[0-9a-f]{64}:(tagging:.+-tagging)$/.exec(coord);
  return m ? m[1] : null;
}

export function headerCoordOf(ev: NostrEvent): string {
  return `39999:${ev.pubkey}:${tagValue(ev, "d") ?? ""}`;
}

/** Resolve tagging headers by coordinate, serving what we already hold. */
export async function resolveTaggingHeaders(coords: string[]): Promise<NostrEvent[]> {
  const wanted = Array.from(new Set(coords));
  const out: NostrEvent[] = [];
  const missing: string[] = [];
  for (const c of wanted) {
    const hit = headersByCoord.fresh(c);
    if (hit) out.push(hit);
    else missing.push(c);
  }
  if (!missing.length) return out;

  const authors = new Set<string>();
  const dTags = new Set<string>();
  for (const c of missing) {
    const parts = c.split(":");
    const d = headerDTagFromCoord(c);
    if (parts[1] && d) {
      authors.add(parts[1]);
      dTags.add(d);
    }
  }
  // What a stale entry held still answers when the relays don't.
  const fallBack = () => {
    for (const c of missing) {
      const held = headersByCoord.held(c);
      if (held && !out.includes(held)) out.push(held);
    }
  };
  if (!authors.size) {
    fallBack();
    return out;
  }

  try {
    const found = await fetchTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      authors: Array.from(authors),
      "#d": Array.from(dTags),
    });
    // The filter is a cross-product, so it can return headers we didn't ask for.
    // Cache them all — they're the ones the next note will want.
    for (const ev of found) holdHeader(ev);
  } catch {
    // Unresolved headers become `unverifiable` downstream, which is the honest
    // outcome — better than dropping the assertions or failing the read.
  }
  fallBack();
  return out;
}
