/** The search page's tab row: the verticals in it, those behind More, and how a tab is drawn. */
import { TAB_LABEL } from "@/lib/tabLabels";
import type { NamedTag } from "@/services/namedTags";
import type { SearchTab } from "@/services/search";

/** Google's row: the verticals in view, the long tail behind More ▾.
 *  Benjamin (2026-09-23): Shop earns the row — Media, then Shop — and
 *  Articles is the first thing behind More.
 *  Top is the composed page and the default. All, after it, is the
 *  relay's answer with no kinds asked and nothing composed — every kind it
 *  indexes, in its order. It is noisy, so it is never anyone's default: only
 *  a click on it gets there. */
export const PRIMARY_TABS: { key: SearchTab; label: string }[] = [
  { key: "top", label: TAB_LABEL.top },
  { key: "all", label: TAB_LABEL.all },
  { key: "people", label: TAB_LABEL.people },
  { key: "notes", label: TAB_LABEL.notes },
  { key: "media", label: TAB_LABEL.media },
  { key: "shop", label: TAB_LABEL.shop },
];
/** On All, how many of its categories stand in the row before More. */
export const CATEGORIES_IN_ROW = 4;
/** A tag's tab in All's row, by key: `tag:<author>:<slug>`, as the link holds it. */
export const TAG_TAB = "tag:";
export const tagTabKeyOf = (tag: NamedTag) => `${TAG_TAB}${tag.authorPubkey}:${tag.slug}`;
/**
 * Behind More, grouped by what a person is doing — consumer things first,
 * developer things last (Benjamin, 2026-09-24: ten flat rows mixing Recipes
 * with PRs read like a settings list). Recipes are long-form articles
 * wearing zap.cooking's tag and NIPs are protocol specs (kind 30817); both
 * stay in Articles too, labelled — these are where people look for them.
 */
export const MORE_GROUPS: { title: string | null; tabs: { key: SearchTab; label: string }[] }[] = [
  {
    title: "Read & listen",
    tabs: [
      { key: "articles", label: TAB_LABEL.articles },
      { key: "music", label: TAB_LABEL.music },
      { key: "recipes", label: TAB_LABEL.recipes },
    ],
  },
  {
    title: "Out & about",
    tabs: [
      { key: "events", label: TAB_LABEL.events },
      { key: "live", label: TAB_LABEL.live },
    ],
  },
  {
    title: "Build",
    tabs: [
      { key: "apps", label: TAB_LABEL.apps },
      { key: "repos", label: TAB_LABEL.repos },
      { key: "issues", label: TAB_LABEL.issues },
      { key: "prs", label: TAB_LABEL.prs },
      { key: "nips", label: TAB_LABEL.nips },
    ],
  },
  {
    title: "Community",
    tabs: [
      { key: "communities", label: TAB_LABEL.communities },
      { key: "fundraisers", label: TAB_LABEL.fundraisers },
      { key: "reviews", label: TAB_LABEL.reviews },
    ],
  },
  { title: null, tabs: [{ key: "lists", label: TAB_LABEL.lists }] },
];
export const MORE_TABS: { key: SearchTab; label: string }[] = MORE_GROUPS.flatMap((g) => g.tabs);
/** Where we're going, said under More without a door: agent suites — verifying and hiring agents — are on the roadmap (Benjamin, 2026-09-25). */
export const SOON_TABS: { key: string; label: string; title: string }[] = [
  { key: "agents", label: "Agents", title: "Verify and hire agents — coming to Brainstorm" },
];
const TABS = [...PRIMARY_TABS, ...MORE_TABS];
/**
 * All's More, under Top's More headings: what is a tab of its own in Top's row (Notes, Media, Shop)
 * heads its own group, and the rest sit where Top's More puts them. Lists and Other come from
 * lib/allCategories.
 */
export const ALL_MORE_GROUPS: { title: string; tabs: SearchTab[] }[] = [
  { title: "Notes & people", tabs: ["notes", "people"] },
  { title: "Media", tabs: ["media"] },
  { title: "Shop", tabs: ["shop"] },
  // Zap Store releases are a band on the home feed, not a tab: they are built things.
  ...MORE_GROUPS.map((g) => ({
    title: g.title ?? "Lists",
    tabs: [...g.tabs.map((t) => t.key), ...(g.title === "Build" ? (["releases"] as SearchTab[]) : [])],
  })),
];

export const TAB_KEYS = new Set(TABS.map((t) => t.key));
/** The tabs a search counts results for (hooks/useTabCounts): every vertical, the row's first. */
export const COUNTED_TABS: SearchTab[] = TABS.map((t) => t.key).filter((key) => key !== "top" && key !== "all");

export const tabClass = (active: boolean) =>
  "shrink-0 px-2.5 sm:px-3 py-1.5 text-xs sm:text-[13px] font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-t " +
  (active
    ? "border-brand-primary text-brand-deep dark:text-brand-link"
    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200");

/** A category's tab on All: a long name ("Food and Drink Places") ends in an ellipsis, whole on hover. */
export const categoryTabClass = (active: boolean) => tabClass(active) + " max-w-[9.5rem] truncate";
