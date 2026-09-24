import { ArrowRight, ShoppingBag } from "lucide-react";
import { formatListingPrice, parseListing } from "@/lib/listing";
import type { SearchHit } from "@/services/search";

/**
 * A product in the search dropdown — "Satoshi Smiley T-shirt · $21 · Black
 * Sheep", straight to the listing. Built to the same shape as the people
 * rows and `TagSuggestionRow` (tile, primary line, secondary line, trailing
 * arrow) so the dropdown reads as one list. Mouse and tap only: the arrow
 * keys walk the people, as before.
 */
export function ListingSuggestionRow({ hit, onSelect, testId = "listing-suggestion" }: { hit: SearchHit; onSelect?: () => void; testId?: string }) {
  const l = parseListing(hit.event);
  if (!l) return null;
  const seller = hit.author?.displayName || hit.author?.name || null;
  const detail = [l.price ? formatListingPrice(l.price) : null, seller].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
      data-testid={testId}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {l.images[0] ? <img src={l.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ShoppingBag className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{l.title}</p>
        {detail && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
    </button>
  );
}
