import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { nip19, type NostrEvent } from "nostr-tools";
import { fetchRecentByKinds } from "@/services/nostr";
import { LISTING_KIND } from "@/lib/listing";
import { productsFromEvents } from "@/lib/listingVariants";
import { ListingCard } from "@/components/search/cards";
import { ContentTeaserBlock } from "./ContentTeaserBlock";

/**
 * What a person has for sale, on their public page — the shelf the search
 * panel's "All" link leads to. Newest first; sold, hidden and inactive
 * listings stay off it. A public page stays short: six on the shelf, and
 * "See all" to the page with everything. The block fetches even while
 * hidden so the owner's customizer knows whether there is anything to show.
 */
const SHELF_SIZE = 6;

export function SellingBlock({
  pubkey,
  relayHints,
  className = "",
  hidden = false,
  onCount,
}: {
  pubkey: string;
  relayHints?: string[];
  className?: string;
  hidden?: boolean;
  onCount?: (n: number) => void;
}) {
  // Same query as the page with everything, so "See all N" counts what the
  // page will show and the tap lands on a warm cache.
  const q = useQuery({
    queryKey: ["seller-listings", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [LISTING_KIND], 100, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  // Products, not listings: a shirt in five sizes is one card, "5 options".
  const products = useMemo(() => productsFromEvents(q.data ?? []), [q.data]);
  useEffect(() => {
    if (q.isSuccess || q.isError) onCount?.(products.length);
  }, [q.isSuccess, q.isError, products.length]);

  if (hidden || products.length === 0) return null;
  const more = products.length > SHELF_SIZE;
  return (
    <ContentTeaserBlock
      icon={<ShoppingBag className="h-4 w-4" />}
      title="Selling"
      testId="share-block-selling"
      className={className}
      viewAllHref={more ? `/p/${nip19.npubEncode(pubkey)}/selling` : undefined}
      viewAllLabel={`See all ${products.length} →`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.slice(0, SHELF_SIZE).map(({ event, group }) => (
          <ListingCard key={group.id} event={event as NostrEvent} author={null} showAuthor={false} group={{ title: group.title, options: group.options.length }} />
        ))}
      </div>
    </ContentTeaserBlock>
  );
}
