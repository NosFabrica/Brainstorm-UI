import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { fetchSimilarListings } from "@/services/search";
import { APP_TAGS, isSellable, parseListing } from "@/lib/listing";
import { cardGroupOf } from "@/lib/listingVariants";
import { useListingShelf } from "@/hooks/useListingShelf";
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
  const [similar, setSimilar] = useState<NostrEvent[]>([]);
  const address = addressOf(event);

  // The seller's other products, counted, for the row and its door to their
  // page. This product's own options are offered by the buy button
  // (ListingOptions); the two read one shelf (hooks/useListingShelf).
  const { others } = useListingShelf(event);
  const mine = others.slice(0, 4);
  const mineTotal = others.length;

  useEffect(() => {
    let alive = true;
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
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on event identity
  }, [event.id]);

  const sellerProfiles = useLiveProfiles(similar.map((e) => e.pubkey));
  const sellers = useMemo(() => {
    const next = new Map<string, SearchResult>();
    for (const [pk, p] of sellerProfiles) {
      next.set(pk, {
        pubkey: pk,
        npub: nip19.npubEncode(pk),
        name: p.name,
        displayName: p.display_name ?? (p as { displayName?: string }).displayName,
        picture: p.picture,
        nip05: p.nip05,
      });
    }
    return next;
  }, [sellerProfiles]);

  if (mine.length === 0 && similar.length === 0) return null;
  return (
    // The same distance from its neighbours as the posts strip below it (mt-8),
    // and as much between its own rows: a shop page, not a footnote.
    <div className="mb-8 mt-8 space-y-8" data-testid="listing-related">
      {mine.length > 0 && (
        <section data-testid="listing-more-from-seller">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              More for sale from {sellerName || "this seller"}
            </h2>
            {/* Four is a teaser; the seller's page has everything. */}
            {mineTotal > mine.length && (
              <Link
                href={`/p/${nip19.npubEncode(event.pubkey)}/selling`}
                className="ml-auto shrink-0 text-xs font-semibold text-brand-link hover:underline"
                data-testid="listing-seller-all"
              >
                See all {mineTotal} →
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {mine.map(({ event: ev, group }) => (
              <ListingCard key={group.id} event={ev} author={null} showAuthor={false} group={cardGroupOf(group)} />
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
