import { Link } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { useListingShelf } from "@/hooks/useListingShelf";
import { eventPath } from "@/lib/shareId";
import { cn } from "@/lib/utils";

type ListingLike = Pick<NostrEvent, "id" | "pubkey" | "kind" | "created_at" | "tags">;

/** An option as a store draws it: a box a thumb can hit, not a tag. */
const OPTION =
  "inline-flex h-10 min-w-[2.75rem] items-center justify-center rounded-lg border px-3.5 text-sm font-medium tabular-nums transition-colors";
const OPTION_CHOSEN = "border-brand-primary bg-brand-primary text-white";
const OPTION_OTHER =
  "border-slate-200 bg-white text-slate-700 hover:border-slate-900 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-300 dark:hover:text-white";

/**
 * A product's options — "Size  XS S M L …" — where a shopper chooses: under
 * the title, above the buy button. Each chip is that option's own listing,
 * with its own page and buy link; the one being read is marked and is not a
 * link to itself. Nothing is drawn for a listing that is not one of several.
 */
export function ListingOptions({ event, className }: { event: ListingLike; className?: string }) {
  const { options } = useListingShelf(event);
  if (!options) return null;
  const chosen = options.chips.find((o) => o.current);
  return (
    <section data-testid="listing-options" className={className}>
      {/* "Size: 6XL" once one is chosen; "Choose a size" until then. */}
      <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="listing-options-heading">
        {chosen ? (
          <>
            {options.heading}: <span className="font-semibold text-slate-900 dark:text-slate-100">{chosen.label}</span>
          </>
        ) : (
          <span className="font-medium text-slate-700 dark:text-slate-200">{options.heading}</span>
        )}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.chips.map((o) =>
          o.current ? (
            // The option being read: filled, and not a link to itself.
            <span key={o.id} aria-current="true" className={cn(OPTION, OPTION_CHOSEN)} data-testid="listing-option">
              {o.label}
            </span>
          ) : (
            <Link
              key={o.id}
              href={eventPath({ id: o.id, pubkey: o.pubkey })}
              className={cn(OPTION, OPTION_OTHER)}
              data-testid="listing-option"
            >
              {o.label}
            </Link>
          ),
        )}
      </div>
    </section>
  );
}
