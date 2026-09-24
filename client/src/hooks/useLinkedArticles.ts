/**
 * The articles a note links — by `a` tag or an naddr in its text — as
 * events, so a compact card can show the article itself (cover, title,
 * summary) where the note's full page already does. A note that is nothing
 * but a link to an article (Geyser publishes these for every update) read
 * as "📄 article" in "More from this author" (Benjamin, 2026-09-24).
 *
 * Only the kinds Brainstorm has a reader for; anything else keeps its link.
 * Cached for the session by coordinate, like client links: a compact card
 * renders in every list on the site, some outside a query provider, so the
 * lookup keeps its own memory and the hook only watches it.
 */
import { useEffect, useState } from "react";
import { addrCoord, analyzeNote, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";
import { fetchAddressableEvents } from "@/services/nostr";

/** Articles, wiki pages and specs — what `EmbeddedArticleCard` renders. */
const READER_KINDS = new Set([30023, 30818, 30817]);

export function linkedArticleRefs(event: MinimalEvent): AddressRef[] {
  const seen = new Set<string>();
  return analyzeNote(event).addrs.filter((ad) => {
    if (!READER_KINDS.has(ad.kind)) return false;
    const key = addrCoord(ad);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const settled = new Map<string, MinimalEvent | null>();
const pending = new Map<string, Promise<void>>();

/** One relay ask per set of coordinates; every article lands in `settled` (null when not found). */
function resolve(refs: AddressRef[]): Promise<void> {
  const key = refs.map(addrCoord).join(",");
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const p = fetchAddressableEvents(refs)
    .catch(() => new Map<string, MinimalEvent>())
    .then((found) => {
      for (const ad of refs) settled.set(addrCoord(ad), (found.get(addrCoord(ad)) as MinimalEvent | undefined) ?? null);
    });
  pending.set(key, p);
  return p;
}

function known(refs: AddressRef[]): { articles: MinimalEvent[]; coords: ReadonlySet<string> } {
  const articles: MinimalEvent[] = [];
  const coords = new Set<string>();
  for (const ad of refs) {
    const ev = settled.get(addrCoord(ad));
    if (ev) {
      articles.push(ev);
      coords.add(addrCoord(ad));
    }
  }
  return { articles, coords };
}

export function useLinkedArticles(event: MinimalEvent): { articles: MinimalEvent[]; coords: ReadonlySet<string> } {
  const refs = linkedArticleRefs(event);
  const key = refs.map(addrCoord).join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    const missing = refs.filter((ad) => !settled.has(addrCoord(ad)));
    if (missing.length === 0) return;
    let alive = true;
    void resolve(missing).then(() => {
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return known(refs);
}

/** Test seam. */
export function __resetLinkedArticles(): void {
  settled.clear();
  pending.clear();
}
