import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { fetchRecentByKinds } from "@/services/nostr";
import { LISTING_KIND, isSellable, parseListing } from "@/lib/listing";
import { ListingCard } from "@/components/search/cards";
import { ContentTeaserBlock } from "./ContentTeaserBlock";

/**
 * What a person has for sale, on their public page — the shelf the search
 * panel's "All" link leads to. Newest first; sold, hidden and inactive
 * listings stay off it. The block fetches even while hidden so the owner's
 * customizer knows whether there is anything to show.
 */
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
  const q = useQuery({
    queryKey: ["share-selling", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [LISTING_KIND], 24, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const listings = useMemo(
    () =>
      (q.data ?? [])
        .filter((ev) => {
          const l = parseListing(ev);
          return !!l && isSellable(l);
        })
        .sort((a, b) => b.created_at - a.created_at),
    [q.data],
  );
  useEffect(() => {
    if (q.isSuccess || q.isError) onCount?.(listings.length);
  }, [q.isSuccess, q.isError, listings.length]);

  if (hidden || listings.length === 0) return null;
  return (
    <ContentTeaserBlock icon={<ShoppingBag className="h-4 w-4" />} title="Selling" testId="share-block-selling" className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {listings.map((ev: NostrEvent) => (
          <ListingCard key={ev.id} event={ev} author={null} showAuthor={false} />
        ))}
      </div>
    </ContentTeaserBlock>
  );
}
