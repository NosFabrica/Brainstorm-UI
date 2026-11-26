/**
 * A search tab's pipeline, as pure functions: what of the relay's answer the tab keeps
 * (`tabHits`), and the rows it shows once its chips and the page's filters have narrowed,
 * ordered and folded them (`displayRows`). The facet counters each tab's chips read sit beside
 * them, one module per tab. components/search/SearchResults holds the state and memoises.
 */
import type { SearchHit, SearchTab } from "@/services/search";
import type { MediaKind } from "@/lib/mediaKind";
import type { EventWhen } from "@/lib/eventFilters";
import type { GitState } from "@/lib/gitStatus";
import type { LiveState } from "@/lib/liveStream";
import { sourceAppFor } from "@/lib/sourceApp";
import { describeThing, oneCardPerChannel } from "@/lib/thing";
import { isListed, parseListing } from "@/lib/listing";
import { isTestTrack, parseTrack } from "@/lib/trackEvent";
import { dedupeEvents } from "@/lib/eventDedupe";
import { belongsTo, type Category } from "@/lib/allCategories";
import { leadCarriersByRank, mergeCarrierHits, type CarrierPerson } from "@/lib/tagCarrierPeople";
import { collapseHits } from "@/lib/searchCollapse";
import { mergePointedHits, type PointedHit } from "@/hooks/useHandlePointers";
import { mediaUrlOf } from "@/components/search/cards";
import {
  CALENDAR_KIND,
  MUSIC_KINDS,
  SHOP_KINDS,
  SHOP_PLACE_KINDS,
  THING_TAB_DETAIL,
  isGitItemTab,
  isGitTab,
  isThingTab,
} from "@/components/search/tabKinds";
import { appRows } from "./apps";
import { articleTypeOf, recipeTopics, type ArticleType } from "./articles";
import { eventRows } from "./events";
import { gitItemRows, gitRows, type GitStatuses } from "./git";
import { listGroupRows, listRows } from "./lists";
import { liveRows, type LiveStates, type Proven } from "./live";
import { mediaRows } from "./media";
import { shopRows, type ShopState } from "./shop";
import type { DisplayRow } from "./types";

export type { DisplayRow } from "./types";

/**
 * Top with a typed sort: is a kind-less list drawn with the verticals' cards, so
 * their gates hold there too — or it shows what they hide: a listing sold,
 * hidden or priceless; a stall or calendar with nothing to name it; a 31337 that
 * is game state, not a song (whose card draws nothing). All has no such gate:
 * it is every kind the relay answered, each as a row that says what it is.
 */
export function showableUnfiltered(event: SearchHit["event"]): boolean {
  if (SHOP_PLACE_KINDS.has(event.kind) || event.kind === CALENDAR_KIND) return describeThing(event) !== null;
  if (SHOP_KINDS.has(event.kind)) {
    const listing = parseListing(event);
    return !!listing && isListed(listing);
  }
  if (MUSIC_KINDS.has(event.kind)) return parseTrack(event) !== null && !isTestTrack(event);
  return true;
}

export interface TabHitsState {
  tab: SearchTab;
  /** A pressed tag's carriers the page showed, kept when the stream's rows are that tag's own answer. */
  keptCarriers: SearchHit[] | null;
  /** The Shop's products (pipelines/shop foldShop), on the Shop tab. */
  shopHits: SearchHit[] | null;
  /** The accounts the matched profiles' handles belong to, and the people on a matched tag (People). */
  pointed: readonly PointedHit[];
  leadPeople: readonly CarrierPerson[];
  /** A named person's own tracks (Music). */
  personMedia: readonly SearchHit[];
  /** The notes the Media tab asked beside its media kinds, once they answer. */
  mediaNotes: readonly SearchHit[] | null;
}

/** What of the relay's answer a tab keeps, so the count line, the chips and the cards agree. */
export function tabHits(sent: SearchHit[], s: TabHitsState): SearchHit[] {
  const { tab } = s;
  // A pressed tag's own answer keeps the rows the page showed carrying it: the relay may have
  // found those through a list whose title holds the words ("verified" finds Verified Human's
  // people), which the narrowed ask doesn't match again.
  const kept = s.keptCarriers?.length ? s.keptCarriers : null;
  const sentIds = kept ? new Set(sent.map((h) => h.event.id)) : null;
  const base = kept ? [...sent, ...kept.filter((h) => !sentIds!.has(h.event.id))] : sent;
  // A listing is for sale or it is not a result: sold, hidden and priceless
  // never count, so the count line and the cards agree.
  // One product, one card: a seller's same-title copies from two apps fold
  // into the one with a product page (lib/listingDuplicates).
  // A NIP-15 stall or marketplace is a shop, not an item: it has no price,
  // and stays when it has a name to show (lib/thing).
  if (tab === "shop") return s.shopHits ?? [];
  // The relay narrows by tag but cannot exclude by one: zap.cooking's own
  // articles wear the recipe tag too. One source of truth says which is
  // which, here, so the count line, the chips and the cards agree.
  if (tab === "recipes") return base.filter((h) => sourceAppFor(h.event)?.noun === "Recipe");
  // The people on a matched tag lead the People tab, once each — after the accounts the
  // matched profiles' handles belong to.
  if (tab === "people") return mergeCarrierHits(mergePointedHits(base, s.pointed), s.leadPeople);
  if (tab === "top") return base.filter((h) => showableUnfiltered(h.event));
  // Only what lib/thing can name is a result — decided here, like the Shop,
  // so "Nothing found" and the counts agree with the cards — and one card
  // per NIP-28 channel.
  if (isThingTab(tab))
    return oneCardPerChannel(base.filter((h) => describeThing(h.event)?.detail.type === THING_TAB_DETAIL[tab]));
  // Event Index's list items join the Events tab (services/search): an aggregator's NIP-52 copy of
  // one goes, and so does a second curator's item for the same page (lib/eventDedupe).
  if (tab === "events") {
    const shown = base.filter((h) => h.event.kind !== CALENDAR_KIND || describeThing(h.event) !== null);
    const kept = new Set(dedupeEvents(shown.map((h) => h.event)).map((e) => e.id));
    return shown.filter((h) => kept.has(h.event.id));
  }
  // A named person's own tracks join the Music tab's hits, once each.
  if (tab === "music") {
    const seen = new Set(base.map((h) => h.event.id));
    return [...base, ...s.personMedia.filter((h) => !seen.has(h.event.id))];
  }
  if (tab !== "media" || !s.mediaNotes) return base;
  const seen = new Set(base.map((h) => h.event.id));
  const visual = s.mediaNotes.filter((h) => !seen.has(h.event.id) && mediaUrlOf(h.event) !== null);
  return [...base, ...visual];
}

export interface DisplayState extends Omit<ShopState, "category" | "price"> {
  tab: SearchTab;
  /** The tag's people, best first (People): their order, taken once when they land. */
  carrierRank: ReadonlyMap<string, number>;
  when: EventWhen;
  /** One of All's categories, pressed. */
  category: Category | null;
  /** A pressed tag, the tag the stream's rows were asked for, and the tags each loaded row carries. */
  tagFilter: string | null;
  streamTag: string | null;
  tagsByHit: ReadonlyMap<string, ReadonlySet<string>>;
  appPlatform: string | null;
  appCategory: string | null;
  shopCategory: string | null;
  shopPrice: ShopState["price"];
  articleType: ArticleType | null;
  recipeTopic: string | null;
  gitStatuses: GitStatuses;
  repoState: GitState | null;
  repoLabel: string | null;
  liveStates: LiveStates;
  shelf: LiveState;
  proven: Proven;
  pageKind: MediaKind | null;
  scoreOf: (pubkey: string) => number | null | undefined;
  /** The folds the reader opened, by cluster id. */
  expanded: ReadonlySet<string>;
}

/** The rows a tab shows: its hits narrowed by the chips and the page, ordered, and folded. */
export function displayRows(hits: SearchHit[], s: DisplayState): DisplayRow[] {
  const { tab } = s;
  let shown = hits;
  // The tag's people, best first; scores land after the merge, so the order does too.
  if (tab === "people" && s.carrierRank.size > 0) shown = leadCarriersByRank(shown, s.carrierRank);
  // Calendars have no date to window by: they follow the dated events,
  // whichever window is picked.
  if (tab === "events") shown = eventRows(shown, s.when);
  // A kind of All's keeps the rows it names: a Recipe is an article's kind, and so are Articles.
  const category = s.category;
  if (category) shown = shown.filter((h) => belongsTo(category, h));
  // A pressed tag the stream wasn't asked for keeps the rows known to carry it; one whose tags
  // are still coming joins once they are. The tag's own answer is all carriers.
  const tagFilter = s.tagFilter;
  if (tagFilter && s.streamTag !== tagFilter) shown = shown.filter((h) => s.tagsByHit.get(h.event.id)?.has(tagFilter));
  // A 31337 without a title and audio is not a song (the kind is abused).
  if (tab === "music") shown = shown.filter((h) => parseTrack(h.event) !== null && !isTestTrack(h.event));
  if (tab === "apps") shown = appRows(shown, { platform: s.appPlatform, category: s.appCategory });
  if (tab === "shop") shown = shopRows(shown, { ...s, category: s.shopCategory, price: s.shopPrice });
  const articleType = s.articleType;
  if (tab === "articles" && articleType) shown = shown.filter((h) => articleTypeOf(h.event.kind) === articleType);
  const recipeTopic = s.recipeTopic;
  if (tab === "recipes" && recipeTopic) shown = shown.filter((h) => recipeTopics(h.event).includes(recipeTopic));
  if (isGitItemTab(tab))
    shown = gitItemRows(shown, { state: s.repoState, label: s.repoLabel, statuses: s.gitStatuses });
  if (tab === "live") shown = liveRows(shown, { shelf: s.shelf, states: s.liveStates, proven: s.proven });
  // The Media tab and the Lists tab start again from the tab's hits.
  if (tab === "media") shown = mediaRows(hits, s.pageKind);
  if (tab === "lists") shown = listRows(hits);
  if (isGitTab(tab)) return gitRows(shown, { expanded: s.expanded, scoreOf: s.scoreOf });
  if (tab === "lists") return listGroupRows(shown, s.scoreOf);
  return clusterRows(shown, tab, s.expanded);
}

/**
 * Recurring events (the "liverpool" monthly-meetup dump) collapse on the
 * event-shaped tabs; a chip expands the rest of each cluster. Every other tab's
 * rows are its hits, one each.
 */
export function clusterRows(shown: SearchHit[], tab: SearchTab, expanded: ReadonlySet<string>): DisplayRow[] {
  const clustered = tab === "events" || tab === "live" || tab === "lists";
  if (!clustered) return shown.map((h) => ({ hit: h, collapsedCount: 0, clusterId: "" }));
  // A calendar is not one of its events: it never folds into (or leads) an
  // event's cluster, and stays below the dated events, unclustered.
  const calendars = tab === "events" ? shown.filter((h) => h.event.kind === CALENDAR_KIND) : [];
  const out: DisplayRow[] = [];
  for (const cluster of collapseHits(calendars.length ? shown.filter((h) => h.event.kind !== CALENDAR_KIND) : shown)) {
    const id = cluster.primary.event.id;
    const open = expanded.has(id);
    out.push({ hit: cluster.primary, collapsedCount: open ? 0 : cluster.others.length, clusterId: id });
    if (open) for (const h of cluster.others) out.push({ hit: h, collapsedCount: 0, clusterId: "" });
  }
  for (const h of calendars) out.push({ hit: h, collapsedCount: 0, clusterId: "" });
  return out;
}
