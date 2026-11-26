/** The search's tabs: which kinds each asks, its word, and what a preview band asks instead. */
import { RECIPE_TAGS } from "@/lib/sourceApp";

export type SearchTab =
  | "top"
  | "all"
  | "people"
  | "notes"
  | "articles"
  | "media"
  | "apps"
  | "shop"
  | "repos"
  | "issues"
  | "prs"
  | "events"
  | "live"
  | "music"
  | "releases"
  | "lists"
  | "recipes"
  | "nips"
  | "communities"
  | "fundraisers"
  | "reviews";

/** One truth for tab → kinds, extracted from the SearchOverTrust app. */
export const TAB_KINDS: Record<Exclude<SearchTab, "top" | "all">, number[]> = {
  people: [0],
  // NIP-84 highlights (a quoted passage) and NIP-88 / zap polls read as notes.
  notes: [1, 11, 1111, 9802, 1068, 6969],
  // 30817 = specs (NIPs on Nostr): Markdown, addressable, indexed by the
  // search relay — read like an article, labelled "Spec".
  // 30142 = learning resources (lesson plans, courses), read like an article.
  articles: [30023, 30024, 30818, 30040, 30041, 30045, 30817, 30142],
  // Specs alone, as their own vertical under More — "NIPs" is the word people
  // search (Benjamin, 2026-09-23). They stay in Articles too, labelled.
  nips: [30817],
  // Pictures, NIP-71 clips, files (by mime), voice. Kind 1986 was here once — a NIP-32 label, not media.
  // 2003 = NIP-35 torrents. 1808 = audio headers (Stemstr, Nosis' audio notes), read like voice.
  media: [20, 21, 22, 1063, 1222, 1808, 34235, 34236, 2003],
  // Vitor's split: Zap Store app listings and git-shaped kinds were one
  // confusing tab. Kind 1337 "snippets" is deliberately in NEITHER — live
  // probing showed it ~90% JSON junk; it still surfaces via All.
  // Beside them: NIP-89 app handlers, NIP-5A Nostr sites, NIP-5D mini apps (root 15129 and named 35129).
  apps: [32267, 31990, 35128, 15128, 35129, 15129],
  // NIP-99 classifieds — the Shop. Sold, hidden and priceless are gated in the UI (lib/listing).
  // NIP-15 beside it: products and auctions sell in the grid; stalls and
  // marketplaces are shops, shown by name.
  shop: [30402, 30018, 30020, 30017, 30019],
  // Native tracks (Wavlake, Stemstr, Tunestr). The kind is also abused for
  // game state and ad-skip data, so the UI keeps only hits with a title and
  // audio — see lib/trackEvent.
  // 36787 is the newer addressable track (26x the 31337s on staging,
  // 2026-09-29); 54/30054/30055 are podcast episodes and trailers.
  music: [31337, 36787, 54, 30054, 30055],
  // NIP-34 git, one vertical per thing people look for: repo announcements,
  // issues, and patches with pull requests (both are code up for review).
  repos: [30617],
  issues: [1621],
  prs: [1617, 1618],
  // Benjamin: "filter by events also". NIP-52 calendar events are their own
  // vertical (the tab does the calendar work — the relay only knows
  // created_at); Live keeps the NIP-53 streams. Kind 31924 calendars (event
  // containers) join the Events tab, below the dated events.
  events: [31922, 31923, 31924],
  live: [30311, 30312, 30313],
  // Not a tab — the home feed's New releases band streams Zap Store releases.
  releases: [30063],
  // 30000 = NIP-51 follow sets — Brainstorm's own pinned-tag exports live here.
  // Also starter packs, curation sets (articles, videos, pictures), music
  // playlists, emoji packs, and NIP-58 badges.
  lists: [
    30000, 10003, 10015, 30001, 30003, 30015, 30267, 39701, 39089, 39092, 30004, 30005, 30006, 34139, 30030, 30009,
  ],
  // Recipes are long-form articles wearing zap.cooking's tag — the same kind as
  // Articles, narrowed by tag (TAB_TAGS). They stay in Articles too, labelled.
  recipes: [30023],
  // NIP-72 moderated communities, NIP-29 relay groups, NIP-28 public channels.
  communities: [34550, 39000, 40, 41],
  // NIP-75 zap goals and Agora fundraisers.
  fundraisers: [9041, 33863],
  // Ratings of anything (34259), relay reviews (31987), NIP-87 mint reviews,
  // Open Markets product reviews (31555).
  reviews: [34259, 31987, 38000, 31555],
};

/**
 * The verticals that are a kind narrowed by tag. The relay filters `#t`
 * alongside `search` and `kinds` (probed 2026-09-22), so this is a real
 * vertical, not a client-side sieve.
 */
const TAB_TAGS: Partial<Record<SearchTab, readonly string[]>> = {
  recipes: RECIPE_TAGS,
};

/** The word each tab wears — for anything that names a tab away from the tab bar. */
export const TAB_LABELS: Record<SearchTab, string> = {
  top: "Top",
  all: "All",
  people: "People",
  notes: "Notes",
  articles: "Articles",
  media: "Media",
  apps: "Apps",
  shop: "Shop",
  repos: "Repos",
  issues: "Issues",
  prs: "PRs",
  events: "Events",
  live: "Live",
  music: "Music",
  releases: "Releases",
  lists: "Lists",
  recipes: "Recipes",
  nips: "NIPs",
  communities: "Communities",
  fundraisers: "Fundraisers",
  reviews: "Reviews",
};
export const tabLabel = (tab: string): string => TAB_LABELS[tab as SearchTab] ?? tab;

const MINT_REVIEW_KIND = 38000;
/** NIP-87's own `k` on a kind-38000: the mint it recommends is a Cashu mint (38172) or a Fedimint (38173). */
const MINT_REVIEW_KS = ["38172", "38173"];

/**
 * Reviews asks the relay for NIP-87's mint reviews alone. Kind 38000 is shared — BAO's
 * prediction markets, an election app's ballots, thousands of one-key test votes
 * (lib/thing's kind38000Format) — and asked bare, they filled the page the tab then
 * emptied: on the production relay, through the house lens, 29 of the first 100 Reviews
 * hits were markets, and 87 of 100 on "bitcoin" (2026-10-01). So 38000 goes in a filter
 * of its own, narrowed by `#k`, ORed with the other review kinds. The handful of old
 * reviews published before NIP-87 had a `k` are left out.
 */
export function askMintReviewsOnly<F extends { kinds?: number[]; "#k"?: string[] }>(filters: F[]): F[] {
  return filters.flatMap((f) => {
    if (!f.kinds?.includes(MINT_REVIEW_KIND) || f["#k"]) return [f];
    const rest = f.kinds.filter((k) => k !== MINT_REVIEW_KIND);
    const mint = { ...f, kinds: [MINT_REVIEW_KIND], "#k": MINT_REVIEW_KS };
    return rest.length ? [{ ...f, kinds: rest }, mint] : [mint];
  });
}
/**
 * Neither Top nor All names kinds: Top's sections each ask their own
 * (bandKindsForTab), and All is deliberately unconstrained — every
 * kind the relay indexes, in the relay's order. (Top with a typed sort:
 * is that same kind-less list.)
 */
export function isKindlessTab(tab: SearchTab): tab is "top" | "all" {
  return tab === "top" || tab === "all";
}

export function kindsForTab(tab: SearchTab): number[] | undefined {
  return isKindlessTab(tab) ? undefined : TAB_KINDS[tab];
}

/**
 * What a preview band asks of a tab — a Top section, a home-feed
 * band, a panel rail — where it differs from the tab: the kinds only the
 * tab itself can show are left out, since a band would ask for them, fill
 * its few slots with them, and then drop them. Calendars have no date for
 * Happening's upcoming window; stalls and marketplaces have no price for
 * the Shop row; a torrent has nothing to see in a media tile; the panel's
 * app rail draws Zap Store listings.
 */
const BAND_KINDS: Partial<Record<SearchTab, number[]>> = {
  events: [31922, 31923],
  shop: [30402, 30018, 30020],
  media: [20, 21, 22, 1063, 1222, 34235, 34236],
  apps: [32267],
};

export function bandKindsForTab(tab: SearchTab): number[] | undefined {
  return BAND_KINDS[tab] ?? kindsForTab(tab);
}

/** The `#t` a vertical is defined by, if any — a typed `#tag` in the query wins over it. */
export function tagsForTab(tab: SearchTab): string[] | undefined {
  const tags = TAB_TAGS[tab];
  return tags ? [...tags] : undefined;
}
