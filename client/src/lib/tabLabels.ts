/**
 * What each search filter is called: one table, read by the filter row and its
 * More menu (components/search/SearchResults) and by tagging (lib/taggable),
 * which files a tagged thing under the filter it is found under. A filter
 * renamed here is renamed in both.
 */
import type { SearchTab } from "@/services/search";

export const TAB_LABEL: Record<SearchTab, string> = {
  top: "Top",
  all: "All",
  people: "People",
  notes: "Notes",
  media: "Media",
  shop: "Shop",
  articles: "Articles",
  music: "Music",
  recipes: "Recipes",
  events: "Events",
  live: "Live",
  apps: "Apps",
  repos: "Repos",
  issues: "Issues",
  prs: "PRs",
  nips: "NIPs",
  communities: "Communities",
  fundraisers: "Fundraisers",
  reviews: "Reviews",
  lists: "Lists",
  // Not a tab: the home feed's New releases band.
  releases: "Releases",
};
