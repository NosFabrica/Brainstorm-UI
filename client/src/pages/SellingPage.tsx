import { useMemo } from "react";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingBag } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { decodeShareId } from "@/lib/shareId";
import { fetchRecentByKinds } from "@/services/nostr";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { LISTING_KIND } from "@/lib/listing";
import { productsFromEvents } from "@/lib/listingVariants";
import { ListingCard } from "@/components/search/cards";
import { Chip } from "@/components/ui/chip";
import { useGoBack } from "@/hooks/useGoBack";

/**
 * Everything a person has for sale. The share page keeps a short shelf and
 * sends the curious here; the search panel's "All" lands here too. Same
 * cards as the Shop tab, the seller's own, so no author row.
 */
export function SellerListings({ pubkey, npub, relayHints }: { pubkey: string; npub: string; relayHints: string[] }) {
  const goBack = useGoBack();

  const { profile } = useLiveProfile(pubkey, relayHints);
  const listingsQuery = useQuery({
    queryKey: ["seller-listings", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [LISTING_KIND], 100, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const products = useMemo(() => productsFromEvents(listingsQuery.data ?? []), [listingsQuery.data]);
  const name = profile?.display_name || profile?.name || `${npub.slice(0, 12)}…`;
  const first = name.split(" ")[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      {/* The public pages' header — B mark, the shared search box, account — so
          search stays one tap away below a profile too, with Back pinned in it. */}
      <PublicPageHeader
        maxWidthClass="max-w-3xl"
        back={{ label: `Back to ${first}`, onClick: () => goBack(`/p/${npub}`) }}
      />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-accent/30 bg-brand-deep/5 text-brand-deep">
            <ShoppingBag className="h-4 w-4" />
          </span>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="selling-title">
            For sale from {name}
          </h1>
          {listingsQuery.isSuccess && (
            <Chip tone="slate" size="sm" data-testid="selling-count">
              {products.length}
            </Chip>
          )}
        </div>

        {listingsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400" data-testid="selling-loading">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="selling-empty">
            Nothing for sale right now.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.map(({ event, group }) => (
              <ListingCard key={group.id} event={event as NostrEvent} author={null} showAuthor={false} group={{ title: group.title, options: group.options.length }} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SellingPage() {
  const [, params] = useRoute("/p/:id/selling");
  const rawId = params?.id || "";
  const decoded = useMemo(() => decodeShareId(rawId), [rawId]);
  if (!decoded?.pubkey) return null;
  return <SellerListings pubkey={decoded.pubkey} npub={rawId} relayHints={decoded.relays || []} />;
}
