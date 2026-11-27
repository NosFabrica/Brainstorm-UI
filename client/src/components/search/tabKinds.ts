/**
 * Which kinds each search tab draws, and how — read by the tab pipelines (./pipelines) and the
 * result grid's cards (TabResultCard) alike, so a tab's rows and its cards agree.
 */
import { TAB_KINDS, type SearchTab } from "@/services/search";
import type { ThingDetail } from "@/lib/thing";
import { TRUSTED_ITEM_LIST_KINDS, TRUSTED_PEOPLE_KIND } from "@/lib/trustedList";
import { WEB_BOOKMARK_KIND } from "@/lib/webBookmark";

export const NOTE_KINDS = new Set(TAB_KINDS.notes);
export const ARTICLE_KINDS = new Set(TAB_KINDS.articles);
export const MEDIA_KINDS = new Set(TAB_KINDS.media);
export const APP_KINDS = new Set(TAB_KINDS.apps);
// Repos, Issues and PRs all draw a RepoCard; the latter two carry a state.
export const REPO_KINDS = new Set([...TAB_KINDS.repos, ...TAB_KINDS.issues, ...TAB_KINDS.prs]);
export const isGitItemTab = (tab: SearchTab) => tab === "issues" || tab === "prs";
export const isGitTab = (tab: SearchTab) => tab === "repos" || isGitItemTab(tab);
export const LIVE_KINDS = new Set(TAB_KINDS.live);
export const EVENT_KINDS = new Set(TAB_KINDS.events);
export const MUSIC_KINDS = new Set(TAB_KINDS.music);
export const SHOP_KINDS = new Set(TAB_KINDS.shop);
/** NIP-15 stalls and marketplaces: in the Shop, but places to buy rather than things for sale. */
export const SHOP_PLACE_KINDS = new Set([30017, 30019]);
/** NIP-52 calendars: collections of events, with no date of their own. */
export const CALENDAR_KIND = 31924;
/** The tabs made only of kinds lib/thing reads — one ThingCard each, in a grid. */
export const isThingTab = (tab: SearchTab) => tab === "communities" || tab === "fundraisers" || tab === "reviews";
/** What a thing tab holds — kind 38000 also carries prediction markets and ballots, which are not reviews. */
export const THING_TAB_DETAIL: Partial<Record<SearchTab, ThingDetail["type"]>> = {
  communities: "community",
  fundraisers: "fundraiser",
  reviews: "review",
};
// Drawn as lists wherever they turn up; a Trusted List is not asked for by the
// Lists tab (the relay holds a copy per perspective), but a `kind:` or a
// mixed answer that meets one shows it as the people list it is. A web
// bookmark sits on the Lists tab but is one link: its row is the page's.
export const LIST_KINDS = new Set([
  ...TAB_KINDS.lists.filter((k) => k !== WEB_BOOKMARK_KIND),
  TRUSTED_PEOPLE_KIND,
  ...TRUSTED_ITEM_LIST_KINDS,
]);
