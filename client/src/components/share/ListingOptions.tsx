import { Link } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { useListingShelf } from "@/hooks/useListingShelf";
import { eventPath } from "@/lib/shareId";
import { cn } from "@/lib/utils";

type ListingLike = Pick<NostrEvent, "id" | "pubkey" | "kind" | "created_at" | "tags">;

/**
 * A product's options — "Size  XS S M L …" — where a shopper chooses: under
 * the title, above the buy button. Each chip is that option's own listing,
 * with its own page and buy link; the one being read is marked and is not a
 * link to itself. Nothing is drawn for a listing that is not one of several.
 */
export function ListingOptions({ event, className }: { event: ListingLike; className?: string }) {
  const { options } = useListingShelf(event);
  if (!options) return null;
  return (
    <section data-testid="listing-options" className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{options.heading}</span>
      {options.chips.map((o) =>
        o.current ? (
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
  );
}
