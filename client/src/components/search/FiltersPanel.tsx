/** The Filters panel under the tab row: sort, time, and the advanced trust controls, each a rewrite of the query. */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import { useLoginHref } from "@/hooks/useLoginHref";
import {
  BROWSE_UNAVAILABLE_SORTS,
  applyFilters,
  browseSafeQuery,
  datePreset,
  queryWords,
  readFilters,
  sinceForPreset,
  type DatePreset,
  type SearchFilterPatch,
} from "@/lib/searchSyntax";
import type { SearchPov, SearchTab } from "@/services/search";

/** Google's Tools menu for time. */
const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "day", label: "Past 24 hours" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
  { value: "custom", label: "Custom range" },
];

// Every option here changes the relay's order — probed 2026-09-03. "Text match
// only" went: it ordered exactly like "Include unranked" and confused people.
const SORT_OPTIONS = [
  { value: "", label: "Best match" },
  { value: "recent", label: "Newest first" },
  { value: "rank", label: "Most trusted authors" },
  { value: "followers", label: "Most followed authors" },
];
/** The Shop page's own sorts. The relay knows no prices: these ride the query
 *  as `sort:price` for the panel and the URL, and the page orders the cards
 *  itself through one Bitcoin rate (lib/exchangeRate). */
const PRICE_SORTS = [
  { value: "price", label: "Price: low to high" },
  { value: "price:desc", label: "Price: high to low" },
];

/**
 * The relay's `filter:rank:gte:N`, on the 0..100 trust scale. A floor DELETES rows below it
 * rather than sinking them (vespa-relay store e1ecd7f23e), which is why it is a coarse menu
 * and not a slider: the difference between 50 and 52 is not a decision anybody makes, and
 * each step is a page of results gone.
 */
const RANK_FLOORS: { value: number | null; label: string }[] = [
  { value: null, label: "No floor" },
  { value: 25, label: "Rank 25+" },
  { value: 50, label: "Rank 50+" },
  { value: 75, label: "Rank 75+" },
  { value: 90, label: "Rank 90+" },
];

/** A one-line facet chip strip: horizontal scroll with the scrollbar hidden,
 *  a soft right-edge fade to signal "more", and mouse-wheel → horizontal so a
 *  desktop mouse scrolls it as easily as a phone swipes (trackpads/touch already
 *  scroll it natively). */

/** The filters that are real (probed 2026-09-03). Every control rewrites the
 *  full query (words + tokens) through onQueryRewrite; the landing page keeps
 *  the tokens OUT of the visible box and in the URL's `f` instead. */
export function FiltersPanel({
  query,
  userPubkey,
  tab,
  onQueryRewrite,
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  tab: SearchTab;
  onQueryRewrite: (next: string) => void;
}) {
  const loginHref = useLoginHref();
  const sortOptions = tab === "shop" ? [...SORT_OPTIONS, ...PRICE_SORTS] : SORT_OPTIONS;
  // What the relay will actually run: a wordless browse cannot be rank- or
  // follower-sorted, so the panel shows the fallback and greys those two.
  const browsing = !queryWords(query);
  const state = readFilters(browsing ? browseSafeQuery(query) : query);
  const preset = datePreset(state);
  // "Custom range" stays open once chosen, even before a day is picked.
  const [customDates, setCustomDates] = useState(preset === "custom");
  const advancedActive = !!state.reach || state.includeSpam || state.rankFloor != null;
  const [advancedOpen, setAdvancedOpen] = useState(advancedActive);
  useEffect(() => {
    if (advancedActive) setAdvancedOpen(true);
  }, [advancedActive]);
  const write = (patch: SearchFilterPatch) => onQueryRewrite(applyFilters(query, patch));

  const showDates = customDates || preset === "custom";
  // The menu is coarse, but the grammar takes any 0..100 — a hand-typed `filter:rank:gte:33`
  // would otherwise read as "No floor" while the Filters badge counted it, which is the panel
  // disagreeing with the search it is describing. The typed value joins the menu, in order.
  const floors = useMemo(() => {
    const typed = state.rankFloor;
    if (typed == null || RANK_FLOORS.some((o) => o.value === typed)) return RANK_FLOORS;
    return [...RANK_FLOORS, { value: typed, label: `Rank ${typed}+` }].sort(
      (a, b) => (a.value ?? -1) - (b.value ?? -1),
    );
  }, [state.rankFloor]);
  const segment = (on: boolean) =>
    `h-8 px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/30 ${
      on
        ? "bg-brand-primary text-white"
        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
    }`;
  const field =
    "h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-accent/30";
  // Every field is a caption over a control of ONE height and ONE width rule:
  // half a phone row each (two up), a fixed column on desktop. Nothing under
  // a control — a hint inside one column used to push its neighbour down.
  const column =
    "flex min-w-0 flex-1 basis-[8.5rem] flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:flex-none sm:basis-auto";
  const control = `${field} w-full sm:w-44`;
  // iOS Safari gives a date input its own minimum width, wider than half a phone row, so
  // From/To day stuck out past Sort and Time (and past the panel). Without the native
  // appearance it takes the column's width like the selects; its value then sits left, as theirs do.
  const dateControl = `${control} min-w-0 appearance-none [&::-webkit-date-and-time-value]:text-left`;

  return (
    <div
      className="mb-3 flex flex-wrap items-start gap-x-4 gap-y-2.5 rounded-xl border border-slate-100 bg-white/70 p-3 dark:border-slate-800/60 dark:bg-slate-900/70"
      data-testid="search-filters-panel"
    >
      {!userPubkey && (
        <p className="basis-full text-xs text-slate-500 dark:text-slate-400" data-testid="filters-signin">
          Sign in to rank through your own network.{" "}
          <Link href={loginHref} className="font-medium text-brand-link hover:underline">
            Sign in →
          </Link>
        </p>
      )}
      <label className={column}>
        Sort
        <select
          className={control}
          value={state.sort ?? ""}
          onChange={(e) => write({ sort: e.target.value || null })}
          data-testid="filter-sort"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value} disabled={browsing && BROWSE_UNAVAILABLE_SORTS.has(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className={column}>
        Time
        <select
          className={control}
          value={showDates ? "custom" : preset}
          onChange={(e) => {
            const next = e.target.value as DatePreset;
            if (next === "custom") {
              setCustomDates(true);
              return;
            }
            setCustomDates(false);
            write({ since: sinceForPreset(next), until: null });
          }}
          data-testid="filter-date"
        >
          {DATE_PRESETS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {showDates && (
        <>
          <label className={column}>
            From day
            <input
              type="date"
              className={dateControl}
              value={state.since ?? ""}
              onChange={(e) => write({ since: e.target.value || null })}
              data-testid="filter-since"
            />
          </label>
          <label className={column}>
            To day
            <input
              type="date"
              className={dateControl}
              value={state.until ?? ""}
              onChange={(e) => write({ until: e.target.value || null })}
              data-testid="filter-until"
            />
          </label>
        </>
      )}
      {browsing && (
        <p className="-mt-1 basis-full text-[10px] text-slate-400 dark:text-slate-500" data-testid="filter-sort-hint">
          Trust and follower sorts need a search term
        </p>
      )}
      {/* Sort and date are the two anyone uses; the rest waits behind one
          word (the team: less busy), and comes forward by itself when one of
          its controls is set — by a shared link, say. */}
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
        className="flex basis-full items-center gap-1 text-left text-[11px] font-medium text-slate-500 hover:text-brand-link dark:text-slate-400"
        data-testid="filters-advanced-toggle"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
        Advanced
      </button>
      {advancedOpen && (
        <div className="flex basis-full flex-wrap items-end gap-x-4 gap-y-3" data-testid="filters-advanced">
          {/* Trust distance — how far the search casts its net. The relay has no
          hops, so this reads the viewer's own follow graph (Benjamin's
          slider); with nobody signed in there is no "you", so it isn't there. */}
          {userPubkey && (
            <div className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Trust distance
              <div
                role="group"
                aria-label="Trust distance"
                className="inline-flex divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800"
                data-testid="filter-reach"
              >
                {(
                  [
                    ["follows", "People you follow"],
                    [null, "Everyone"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={state.reach === value}
                    onClick={() => write({ reach: value })}
                    className={segment(state.reach === value)}
                    data-testid={`filter-reach-${value ?? "all"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* The relay's own floor, the opposite end of the same dial as "Include unranked":
          one lifts the floor to nothing, the other raises it. Both cannot be on, so
          choosing a floor turns the waiver off. */}
          <label className={column}>
            Trust floor
            <select
              className={control}
              value={state.rankFloor ?? ""}
              onChange={(e) => {
                const next = e.target.value === "" ? null : Number(e.target.value);
                write(next == null ? { rankFloor: null } : { rankFloor: next, includeSpam: false });
              }}
              data-testid="filter-rank-floor"
            >
              {floors.map((o) => (
                <option key={o.label} value={o.value ?? ""}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-brand-primary"
              checked={state.includeSpam}
              onChange={(e) =>
                write(e.target.checked ? { includeSpam: true, rankFloor: null } : { includeSpam: false })
              }
              data-testid="filter-spam"
            />
            Include unranked accounts
          </label>
        </div>
      )}
    </div>
  );
}
