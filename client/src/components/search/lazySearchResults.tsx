/**
 * The results half of the search page, as its own chunk. SearchResults owns every
 * vertical (the cards, the knowledge panel, Music, the syntax sheet), a large share
 * of the app's code, and the bare home needs none of it until a search exists. The
 * home stays in the entry; this loads on the first search, and earlier where it can:
 * from main.tsx on a `?q=` link, and the moment the box is focused or typed in.
 */
import { lazyWithReload } from "@/lib/lazyWithReload";

export const LazySearchResults = lazyWithReload(() =>
  import("./SearchResults").then((m) => ({ default: m.SearchResults })),
);

/** Start the download now; a warm-up that fails is retried by the visit itself. */
export function preloadSearchResults(): void {
  void LazySearchResults.preload();
}

/**
 * What the page shows while the chunk arrives: the toolbar's room and the same
 * five pulsing rows SearchResults shows while the relay answers, in the same
 * column, so the load and the search read as one wait with nothing jumping.
 */
export function SearchResultsFallback() {
  return (
    <div
      className="mx-auto mt-4 w-full max-w-2xl text-left sm:mt-5 lg:max-w-[62rem]"
      data-testid="search-results-pending"
      aria-busy="true"
    >
      <div className="-mx-1 mb-2 h-8 border-b border-slate-100 px-1 dark:border-slate-800/60 sm:mb-3" />
      <div className="w-full min-w-0 lg:mx-auto lg:w-[42rem]">
        <div className="space-y-2 sm:space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex animate-pulse items-start gap-3 rounded-xl border border-slate-100 bg-white/70 p-3 dark:border-slate-800/60 dark:bg-slate-900/70 sm:gap-4 sm:p-4"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 sm:h-11 sm:w-11" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 w-28 rounded-full bg-slate-200 dark:bg-slate-700 sm:h-3.5 sm:w-36" />
                <div className="h-2.5 w-full max-w-md rounded-full bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
