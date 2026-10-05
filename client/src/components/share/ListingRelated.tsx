import { useEffect, useState } from "react";
import { Link } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import { fetchListingFamily, fetchProfileMap, fetchRecentByKinds } from "@/services/nostr";
import { fetchSimilarListings } from "@/services/search";
import { APP_TAGS, LISTING_KIND, isSellable, parseListing } from "@/lib/listing";
import { cardGroupOf, familyOf, productsFromEvents, type ProductCard } from "@/lib/listingVariants";
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
  // Everything the seller has, counted, for the row's door to their page.
  const [mineTotal, setMineTotal] = useState(0);
  // This product's options: every one of them when the seller declared the
  // product (this listing's own marked), the others when it is a title guess.
  const [options, setOptions] = useState<{
    heading: string;
    chips: { id: string; pubkey: string; label: string; current: boolean }[];
  } | null>(null);
  const [similar, setSimilar] = useState<NostrEvent[]>([]);
  const [sellers, setSellers] = useState<Map<string, SearchResult>>(new Map());

  useEffect(() => {
    let alive = true;
    const address = addressOf(event);
    // As deep as the profile's shelf asks: a seller's newest listings can be
    // a run of hidden copies (Staci's shop, 2026-09-24), and thirty of those
    // left this row empty while her profile showed 36 products.
    // A declared product is also asked for by name, so a big shop's product
    // page never shows half its sizes (lib/listingVariants, #158).
    const self = parseListing({ ...event, content: "" });
    const family = self ? familyOf(self) : null;
    void Promise.all([
      fetchRecentByKinds(event.pubkey, [LISTING_KIND], 100),
      family ? fetchListingFamily(event.pubkey, family).catch(() => []) : Promise.resolve([]),
    ]).then(([recent, familyEvents]) => {
      if (!alive) return;
      const seen = new Set<string>();
      const evs = [...recent, ...familyEvents].filter((ev) => !seen.has(ev.id) && seen.add(ev.id));
      // The seller's things as products. The product this listing belongs to
      // gives its options; the rest are "more for sale".
      const products = productsFromEvents(evs);
      const isThis = (m: { id: string; pubkey: string; d: string }) =>
        m.id === event.id || `${LISTING_KIND}:${m.pubkey}:${m.d}` === address;
      const own = products.find((p) => isThis(p.group.primary) || p.group.members.some(isThis));
      // Declared by the seller: the parent is the product, never an option.
      const declared = !!own && (own.group.parent !== null || !own.group.complete);
      const chips = (own?.group.options.length ? own.group.members : [])
        .map((m, i) => ({ id: m.id, pubkey: m.pubkey, label: own!.group.options[i], current: isThis(m) }))
        .filter((c) => declared || !c.current);
      setOptions(
        chips.length > 0 ? { heading: declared ? (own!.group.optionName ?? "Options") : "Other options", chips } : null,
      );
      const others = products.filter((p) => p !== own);
      setMineTotal(others.length);
      setMine(others.slice(0, 4));
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
          const p = c as {
            name?: string;
            display_name?: string;
            displayName?: string;
            picture?: string;
            nip05?: string;
          };
          next.set(pk, {
            pubkey: pk,
            npub: nip19.npubEncode(pk),
            name: p.name,
            displayName: p.display_name ?? p.displayName,
            picture: p.picture,
            nip05: p.nip05,
          });
        }
        setSellers(next);
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on event identity
  }, [event.id]);

  if (mine.length === 0 && similar.length === 0 && !options) return null;
  return (
    // The same distance from its neighbours as the posts strip below it (mt-8),
    // and as much between its own rows: a shop page, not a footnote.
    <div className="mb-8 mt-8 space-y-8" data-testid="listing-related">
      {options && (
        <section data-testid="listing-options" className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{options.heading}</span>
          {options.chips.map((o) =>
            o.current ? (
              // The option being read: marked, and not a link to itself.
              <span
                key={o.id}
                aria-current="true"
                className="rounded-full border border-brand-primary bg-brand-primary/10 px-2.5 py-1 text-xs font-semibold text-brand-primary"
                data-testid="listing-option"
              >
                {o.label}
              </span>
            ) : (
              <Link
                key={o.id}
                href={eventPath({ id: o.id, pubkey: o.pubkey })}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-accent/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                data-testid="listing-option"
              >
                {o.label}
              </Link>
            ),
          )}
        </section>
      )}
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
