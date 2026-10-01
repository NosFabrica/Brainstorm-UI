import { ArrowRight, ShoppingBag } from "lucide-react";

/**
 * The Shop page for the words, as a row in the search dropdown — "honey /
 * Shop · 6+ listings". Shopping is a place to land with everything for the
 * word, the way Google's is a tab and a marketplace offers "honey in Grocery":
 * the box offers the wider search first, and a single product only as a
 * shortcut beneath it. Same shape as the tag and topic rows.
 */
export function ShopSuggestionRow({
  words,
  count,
  onSelect,
  testId = "shop-suggestion",
}: {
  words: string;
  /**
   * Listings whose title carries the words. A floor, not a total: the Shop
   * page also finds listings that only mention them, so the row says "4+".
   */
  count: number;
  onSelect?: () => void;
  testId?: string;
}) {
  const listings = `${count}+ listings`;
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
      data-testid={testId}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <ShoppingBag className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{words}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">Shop · {listings}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
    </button>
  );
}
