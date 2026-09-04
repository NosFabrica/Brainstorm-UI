import { useEffect, useState } from "react";
import { Link } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import { fetchProfileMap, fetchRecentByKinds } from "@/services/nostr";
import { fetchSimilarListings } from "@/services/search";
import { APP_TAGS, LISTING_KIND, isSellable, parseListing } from "@/lib/listing";
import { productsFromEvents, splitVariantTitle, type ProductCard } from "@/lib/listingVariants";
import { eventPath } from "@/lib/shareId";
import type { SearchResult } from "@/lib/profileSearch";
import { ListingCard } from "@/components/search/cards";

type ListingLike = Pick<NostrEvent, "id" | "pubkey" | "kind" | "created_at" | "tags">;

const addressOf = (ev: ListingLike) => `${ev.kind}:${ev.pubkey}:${ev.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
const sellable = (evs: NostrEvent[]) =>
  evs.filter((ev) => {
    const l = parseListing(ev);
    return !!l && isSellable(l);
  });

/**
 * Two ways onward from a listing: the seller's other things, and similar
 * things from other sellers in the same categories. The seller's row names
 * no author (it is theirs); the similar row names each seller, because who
 * is selling is the point of a web-of-trust shop.
 */
export function ListingRelated({ event, sellerName }: { event: ListingLike; sellerName?: string }) {
  const [mine, setMine] = useState<ProductCard<NostrEvent>[]>([]);
  const [options, setOptions] = useState<{ id: string; pubkey: string; label: string }[]>([]);
  const [similar, setSimilar] = useState<NostrEvent[]>([]);
  const [sellers, setSellers] = useState<Map<string, SearchResult>>(new Map());

  useEffect(() => {
    let alive = true;
    const address = addressOf(event);
    void fetchRecentByKinds(event.pubkey, [LISTING_KIND], 30).then((evs) => {
      if (!alive) return;
      // The seller's things as products. The product this listing belongs to
      // gives its other sizes as options; the rest are "more for sale".
      const products = productsFromEvents(evs);
      const isThis = (m: { id: string; pubkey: string; d: string }) => m.id === event.id || `${LISTING_KIND}:${m.pubkey}:${m.d}` === address;
      const own = products.find((p) => p.group.members.some(isThis));
      setOptions(
        (own?.group.members ?? [])
          .filter((m) => !isThis(m))
          .map((m) => ({ id: m.id, pubkey: m.pubkey, label: splitVariantTitle(m.title).option ?? m.title })),
      );
      setMine(products.filter((p) => p !== own).slice(0, 4));
    });
    // The listing's categories as the seller wrote them AND lower-cased — the
    // relay's tag filter is exact, marketplaces are not. App identifiers
    // (shopstr, plebeian…) stay out: they would match a whole catalogue.
    const categories = [
      ...new Set(
        event.tags
          .filter((t) => t[0] === "t" && t[1] && !APP_TAGS.has(t[1].trim().toLowerCase()))
          .flatMap((t) => [t[1].trim(), t[1].trim().toLowerCase()]),
      ),
    ].slice(0, 8);
    void fetchSimilarListings(categories, address, { excludePubkey: event.pubkey }).then((evs) => {
      if (!alive) return;
      const rows = sellable(evs).slice(0, 4);
      setSimilar(rows);
      const pks = [...new Set(rows.map((e) => e.pubkey))];
      if (pks.length === 0) return;
      void fetchProfileMap(pks).then((map) => {
        if (!alive) return;
        const next = new Map<string, SearchResult>();
        for (const [pk, c] of map) {
          const p = c as { name?: string; display_name?: string; displayName?: string; picture?: string; nip05?: string };
          next.set(pk, { pubkey: pk, npub: nip19.npubEncode(pk), name: p.name, displayName: p.display_name ?? p.displayName, picture: p.picture, nip05: p.nip05 });
        }
        setSellers(next);
      });
    });
    return () => {
      alive = false;
    };
  }, [event.id]);

  if (mine.length === 0 && similar.length === 0 && options.length === 0) return null;
  return (
    <div className="space-y-5" data-testid="listing-related">
      {options.length > 0 && (
        <section data-testid="listing-options" className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Other options</span>
          {options.map((o) => (
            <Link
              key={o.id}
              href={eventPath({ id: o.id, pubkey: o.pubkey })}
              className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-accent/40 transition-colors"
            >
              {o.label}
            </Link>
          ))}
        </section>
      )}
      {mine.length > 0 && (
        <section data-testid="listing-more-from-seller">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">More for sale from {sellerName || "this seller"}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {mine.map(({ event: ev, group }) => (
              <ListingCard key={group.id} event={ev} author={null} showAuthor={false} group={{ title: group.title, options: group.options.length }} />
            ))}
          </div>
        </section>
      )}
      {similar.length > 0 && (
        <section data-testid="listing-similar">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">Similar listings</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {similar.map((ev) => (
              <ListingCard key={ev.id} event={ev} author={sellers.get(ev.pubkey) ?? null} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
