import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { decodeShareId } from "@/lib/shareId";
import { fetchProfileForShare, fetchRecentByKinds } from "@/services/nostr";
import { LISTING_KIND, isSellable, parseListing } from "@/lib/listing";
import { ListingCard } from "@/components/search/cards";
import { Chip } from "@/components/ui/chip";
import { Wordmark } from "@/components/Wordmark";
import { AccountMenu } from "@/components/AccountMenu";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useGoBack } from "@/hooks/useGoBack";
import { logout } from "@/accounts/login-flow";

/**
 * Everything a person has for sale. The share page keeps a short shelf and
 * sends the curious here; the search panel's "All" lands here too. Same
 * cards as the Shop tab, the seller's own, so no author row.
 */
export function SellerListings({ pubkey, npub, relayHints }: { pubkey: string; npub: string; relayHints: string[] }) {
  const goBack = useGoBack();
  const me = useActiveAccountDisplay();

  const profileQuery = useQuery({
    queryKey: ["share-profile", pubkey],
    queryFn: () => fetchProfileForShare(pubkey, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const listingsQuery = useQuery({
    queryKey: ["seller-listings", pubkey],
    queryFn: () => fetchRecentByKinds(pubkey, [LISTING_KIND], 100, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const listings = useMemo(
    () =>
      (listingsQuery.data ?? [])
        .filter((ev) => {
          const l = parseListing(ev);
          return !!l && isSellable(l);
        })
        .sort((a, b) => b.created_at - a.created_at),
    [listingsQuery.data],
  );
  const profile = profileQuery.data;
  const name = profile?.display_name || profile?.name || `${npub.slice(0, 12)}…`;
  const first = name.split(" ")[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => goBack(`/p/${npub}`)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-100 hover:text-slate-900 dark:hover:text-white transition-colors"
            data-testid="selling-back"
          >
            <ArrowLeft className="h-4 w-4" /> Back to {first}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/" className="flex items-center">
              <Wordmark height={24} className="dark:hidden" />
              <Wordmark height={24} variant="white" className="hidden dark:block" />
            </Link>
            {me && <AccountMenu user={me} onLogout={() => logout()} />}
          </div>
        </div>
      </header>

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
              {listings.length}
            </Chip>
          )}
        </div>

        {listingsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400" data-testid="selling-loading">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : listings.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="selling-empty">
            Nothing for sale right now.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {listings.map((ev: NostrEvent) => (
              <ListingCard key={ev.id} event={ev} author={null} showAuthor={false} />
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
