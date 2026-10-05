/**
 * The articles a note links — by `a` tag or an naddr in its text — as
 * events, so a compact card can show the article itself (cover, title,
 * summary) where the note's full page already does. A note that is nothing
 * but a link to an article (Geyser publishes these for every update) read
 * as "📄 article" in "More from this author" (Benjamin, 2026-09-24).
 *
 * Only the kinds Brainstorm has a reader for; anything else keeps its link.
 * Held copies render at once; one ask per set of coordinates per window.
 */
import { useMemo } from "react";
import { addrCoord, analyzeNote, type AddressRef, type MinimalEvent } from "@/lib/noteRefs";
import { fetchAddressableEvents } from "@/services/nostr";
import { useHeldReplaceables } from "@/hooks/useHeldEvents";
import { mergeNewest } from "@/hooks/useNoteRefs";
import { useStoreEvents } from "@/hooks/useStoreEvents";

/** Articles, wiki pages and specs — what `EmbeddedArticleCard` renders. */
export const READER_KINDS: ReadonlySet<number> = new Set([30023, 30818, 30817]);

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

const byCoord = (events: MinimalEvent[]) =>
  new Map(events.map((e) => [`${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`, e]));

/** The articles behind a set of addresses: held copies at once, newer ones as the relays answer. */
export function useArticlesByRefs(refs: AddressRef[]): { articles: MinimalEvent[]; coords: ReadonlySet<string> } {
  const key = refs.map(addrCoord).join(",");
  const stable = useMemo(() => refs, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = useHeldReplaceables(stable);
  const asked = useStoreEvents(key ? `linked-articles:${key}` : null, null, async () =>
    Array.from((await fetchAddressableEvents(stable).catch(() => new Map<string, MinimalEvent>())).values()),
  );
  return useMemo(() => {
    const merged = mergeNewest(stable, held, byCoord(asked.events as MinimalEvent[]));
    const articles: MinimalEvent[] = [];
    const coords = new Set<string>();
    for (const ad of stable) {
      const ev = merged.get(addrCoord(ad));
      if (ev) {
        articles.push(ev);
        coords.add(addrCoord(ad));
      }
    }
    return { articles, coords };
  }, [stable, held, asked.events]);
}

export function useLinkedArticles(event: MinimalEvent): { articles: MinimalEvent[]; coords: ReadonlySet<string> } {
  return useArticlesByRefs(linkedArticleRefs(event));
}
