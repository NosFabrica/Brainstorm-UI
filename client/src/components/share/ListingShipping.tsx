/**
 * How a listing ships, on its page: the costs it prices itself (Shopstr's
 * `["shipping", "<name>", "<cost>", "<currency>"]`) and the Open Markets
 * options it points at — a kind-30406 option, or a kind-30405 collection's
 * options — each read from the store (ADR 0005) and priced as the option's
 * own price plus the product's extra cost. A reference not found still says
 * there is one, rather than showing its raw address.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { Truck } from "lucide-react";
import { useAddressedEvents } from "@/hooks/useAddressedEvents";
import type { Listing } from "@/lib/listing";
import { collectionShippingAddresses, shippingRows, type ShippingRow } from "@/lib/marketplace";
import { parseATag } from "@/lib/noteRefs";

function optionHref(address: string): string | null {
  const a = parseATag(address);
  if (!a) return null;
  try {
    return `/e/${nip19.naddrEncode({ kind: a.kind, pubkey: a.pubkey, identifier: a.identifier })}`;
  } catch {
    return null;
  }
}

/** The quiet line under an option's name: its service, where it goes, how long, which carrier, and the collection it came through. */
function rowDetails(row: ShippingRow, settled: boolean): string | null {
  const parts = [row.service, row.countries, row.duration, row.carrier, row.via && `via ${row.via}`].filter(
    (p): p is string => !!p,
  );
  if (!row.resolved && settled) parts.push("details not found");
  return parts.length ? parts.join(" · ") : null;
}

export function useListingShipping(listing: Pick<Listing, "shipping" | "shippingRefs" | "price">): {
  rows: ShippingRow[];
  settled: boolean;
} {
  const refs = listing.shippingRefs;
  const direct = useAddressedEvents(refs.map((r) => r.address));
  // A collection's options are asked once the collections are back: keyed on
  // events still arriving, the ask would go out again with each one.
  // Only what the listing does not already name: those are asked above.
  const viaCollections = useMemo(() => {
    if (!direct.settled) return [];
    const named = new Set(refs.map((r) => r.address));
    return collectionShippingAddresses(refs, direct.get).filter((a) => !named.has(a));
  }, [direct, refs]);
  const inherited = useAddressedEvents(viaCollections);
  const rows = shippingRows(listing, (a) => direct.get(a) ?? inherited.get(a));
  return { rows, settled: direct.settled && inherited.settled };
}

export function ListingShipping({
  listing,
  className = "",
}: {
  listing: Pick<Listing, "shipping" | "shippingRefs" | "price">;
  className?: string;
}) {
  const { rows, settled } = useListingShipping(listing);
  if (rows.length === 0) return null;
  return (
    <div
      className={`rounded-xl border border-slate-200 p-3 dark:border-slate-800 ${className}`}
      data-testid="listing-hero-shipping"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Truck className="h-3.5 w-3.5" /> Shipping
      </p>
      <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
        {rows.map((row) => {
          const href = row.address && row.resolved ? optionHref(row.address) : null;
          const details = rowDetails(row, settled);
          return (
            <li
              key={row.key}
              className="flex items-start justify-between gap-3"
              data-testid="listing-hero-shipping-row"
            >
              <span className="min-w-0">
                {href ? (
                  <Link href={href} className="block truncate hover:text-brand-link hover:underline">
                    {row.title}
                  </Link>
                ) : (
                  <span className="block truncate">{row.title}</span>
                )}
                {details && (
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{details}</span>
                )}
              </span>
              {row.cost && (
                <span
                  className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400"
                  data-testid="listing-hero-shipping-cost"
                >
                  {row.cost}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
