/**
 * What a tagged thing is called.
 *
 * A tag can be put on a person or on any event: a post, an article, a repo, an
 * issue, a community, a list's item. Nothing about the type is stored in the
 * tagging itself. It is read off the thing that was tagged: its kind, through
 * the one registry every card and row already uses (lib/kindLabel), or, for a
 * Dictionary list's item, the name its list gives its items. So a new kind is
 * taggable by its own name the day lib/kindLabel learns it, and nothing already
 * published has to change.
 *
 * Where it is FILED is the search filter it is found under, in the filter's own
 * word (lib/tabLabels): an app handler, a website and a Zap Store app are three
 * things with three names, and all of them are under Apps. So Your tags has the
 * sections the filter menu has, and a type the menu renames is renamed here.
 *
 * What comes out: the `noun` a sentence uses ("Tag this issue", "Anyone can see
 * this on the issue"), the `label` a row names the thing with ("App handler"),
 * the `plural` its section is headed with on Your tags ("Apps") and how that
 * section counts ("1 app", "2 apps").
 */
import { pluralLabel } from "@/lib/allCategories";
import { formatEventDate, parseCalendarEvent } from "@/lib/calendarEvent";
import { DLIST_ITEM_KINDS } from "@/lib/dlistFields";
import { kindLabel, type KindEvent } from "@/lib/kindLabel";
import { mediaPosterOf } from "@/lib/mediaKind";
import { extractImageUrls } from "@/lib/noteContent";
import { TAB_LABEL } from "@/lib/tabLabels";
import { TAB_KINDS, type SearchTab } from "@/services/search";

export interface TaggableType {
  /** The same for everything filed in one section, and for nothing else: what sections group by. */
  key: string;
  /** The thing's own word, as a sentence says it: "issue", "app handler", "GitHub account". */
  noun: string;
  /** The thing's own word, as its card says it: "Issue", "App handler", "GitHub Account". */
  label: string;
  /** What its section is headed: the filter's name ("Apps", "PRs"), or the list's ("Books"). */
  plural: string;
  /** How its section counts what it holds: "1 app", "2 apps". */
  counted: { one: string; many: string };
}

/** What a Dictionary list calls its items: `["names", "Book", "Books"]`. */
export interface ListNames {
  singular: string;
  plural: string;
  /**
   * The search filter made of this list, in the filter's own name, when there
   * is one (hooks/useTaggedItems): "Places" for the "Food and Drink Places" list
   * and its copies. Its items are filed there, whatever a copy calls itself.
   */
  section?: string;
}

/** A kind with no name of its own, a list item whose list isn't read yet, or a thing that couldn't be read. */
export const UNKNOWN_ITEM: TaggableType = {
  key: "item",
  noun: "item",
  label: "Item",
  plural: "Other items",
  counted: { one: "item", many: "items" },
};
const ITEM = UNKNOWN_ITEM;

type Filter = Exclude<SearchTab, "top" | "all" | "people" | "releases">;

/**
 * A filter as a section: its heading, and the word it counts in. Tagging's word
 * for what the Notes filter holds has always been "post"; Music, Live, Media
 * and Shop name no single thing, so each counts in the word for what it mostly
 * holds.
 */
const SECTION: Record<Filter, { plural: string; one: string; many: string }> = {
  notes: { plural: "Posts", one: "post", many: "posts" },
  articles: { plural: TAB_LABEL.articles, one: "article", many: "articles" },
  recipes: { plural: TAB_LABEL.recipes, one: "recipe", many: "recipes" },
  nips: { plural: TAB_LABEL.nips, one: "NIP", many: "NIPs" },
  music: { plural: TAB_LABEL.music, one: "track", many: "tracks" },
  events: { plural: TAB_LABEL.events, one: "event", many: "events" },
  live: { plural: TAB_LABEL.live, one: "stream", many: "streams" },
  apps: { plural: TAB_LABEL.apps, one: "app", many: "apps" },
  repos: { plural: TAB_LABEL.repos, one: "repo", many: "repos" },
  issues: { plural: TAB_LABEL.issues, one: "issue", many: "issues" },
  prs: { plural: TAB_LABEL.prs, one: "PR", many: "PRs" },
  communities: { plural: TAB_LABEL.communities, one: "community", many: "communities" },
  fundraisers: { plural: TAB_LABEL.fundraisers, one: "fundraiser", many: "fundraisers" },
  reviews: { plural: TAB_LABEL.reviews, one: "review", many: "reviews" },
  lists: { plural: TAB_LABEL.lists, one: "list", many: "lists" },
  shop: { plural: TAB_LABEL.shop, one: "listing", many: "listings" },
  media: { plural: TAB_LABEL.media, one: "item", many: "items" },
};

/**
 * The filter a kind is found under. Several filters share kinds (a spec is in
 * NIPs and in Articles): the narrower one is named first and wins. Recipes are
 * not here: a recipe is an article by kind, told apart by its label.
 */
const FILTER_ORDER: Filter[] = [
  "nips",
  "articles",
  "music",
  "events",
  "live",
  "apps",
  "repos",
  "issues",
  "prs",
  "communities",
  "fundraisers",
  "reviews",
  "lists",
  "shop",
  "media",
  "notes",
];
/** In the Lists filter's kinds for its search, and not a list: a web bookmark keeps its own name. */
const NOT_A_LIST = 39701;
const FILTER_OF_KIND = new Map<number, Filter>();
for (const filter of FILTER_ORDER) {
  for (const kind of TAB_KINDS[filter]) {
    if (kind !== NOT_A_LIST && !FILTER_OF_KIND.has(kind)) FILTER_OF_KIND.set(kind, filter);
  }
}

/** Tagging's word for a note or a comment has always been "post". */
const POST_KINDS = new Set([1, 11, 1111]);

/**
 * A name as it reads mid-sentence: a word that is only capitalised goes lower
 * case, one cased on purpose stays ("GitHub Account" → "GitHub account").
 */
export function inSentence(name: string): string {
  return name.replace(/\b[A-Z][a-z]+\b/g, (word) => word.toLowerCase());
}

/** A name as a heading writes it, the way the filter menu does: "GitHub Accounts" → "GitHub accounts". */
function asHeading(name: string): string {
  const words = inSentence(name);
  return name.charAt(0) + words.slice(1);
}

export function taggableType(event: KindEvent, list?: ListNames | null): TaggableType {
  if (list?.singular) {
    const plural = list.section || list.plural || list.singular;
    // A list a filter is named for is found under that filter, beside the kinds it holds:
    // an Event Index event and a calendar event are both under Events.
    const filter = FILTER_ORDER.find((f) => SECTION[f].plural.toLowerCase() === plural.trim().toLowerCase());
    if (filter) {
      const { one, many } = SECTION[filter];
      return {
        key: `filter:${filter}`,
        noun: inSentence(list.singular),
        label: list.singular,
        plural: SECTION[filter].plural,
        counted: { one, many },
      };
    }
    return {
      key: `list:${plural}`,
      noun: inSentence(list.singular),
      label: list.singular,
      plural: asHeading(plural),
      counted: { one: inSentence(list.singular), many: inSentence(list.plural || list.singular) },
    };
  }
  if ((DLIST_ITEM_KINDS as readonly number[]).includes(event.kind)) return ITEM;
  const label = POST_KINDS.has(event.kind) ? "Post" : kindLabel(event);
  if (/^Kind \d+$/.test(label)) return ITEM;
  const noun = inSentence(label);

  // A kind several things share (38000: a mint review, a market, a ballot) is filed by what it says it is.
  const shared = event.kind === 38000 && label !== "Mint review";
  const filter: Filter | undefined =
    label === "Recipe" ? "recipes" : shared ? undefined : FILTER_OF_KIND.get(event.kind);
  if (filter) {
    const { plural, one, many } = SECTION[filter];
    return { key: `filter:${filter}`, noun, label, plural, counted: { one, many } };
  }
  const plural = pluralLabel(label);
  return { key: `kind:${label}`, noun, label, plural, counted: { one: noun, many: inSentence(plural) } };
}

const TITLE_MAX = 80;

/**
 * What a tagged thing is called in a list: the name it gives itself (a `title`,
 * a `name`, an issue's `subject`, a name in JSON content), else the first line
 * of what it says, cut at a word. Null when it has no words of its own (a bare link, a picture): the
 * caller says what it is instead.
 */
export function taggableTitle(event: { tags: string[][]; content: string }): string | null {
  for (const key of ["title", "name", "subject"]) {
    const value = event.tags.find((t) => t[0] === key)?.[1]?.trim();
    if (value) return value;
  }
  // Several kinds keep their name in JSON content: an app handler, a channel, a stall.
  const text = event.content.trim();
  if (text.startsWith("{")) {
    try {
      const named = JSON.parse(text) as { name?: unknown; display_name?: unknown; title?: unknown };
      const value = [named.name, named.display_name, named.title].find((v) => typeof v === "string" && v.trim());
      return typeof value === "string" ? value.trim() : null;
    } catch {
      // Not JSON after all: read as words, below.
    }
  }
  const line = event.content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^(https?:\/\/|nostr:)\S+$/i.test(l));
  if (!line) return null;
  if (line.length <= TITLE_MAX) return line;
  const cut = line.slice(0, TITLE_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : TITLE_MAX).trimEnd()}…`;
}

const isWebAddress = (value: unknown): value is string => typeof value === "string" && /^https?:\/\/\S+$/i.test(value);

/**
 * The picture a tagged thing is shown with in a list: the one it names for
 * itself (an article's `image`, a stream's `thumb`, an app's `icon`, a picture
 * in JSON content), else the first picture it carries. Null when it has none:
 * the caller draws what kind of thing it is instead.
 */
export function taggableImage(event: { kind: number; tags: string[][]; content: string }): string | null {
  for (const key of ["image", "thumb", "picture", "icon", "cover"]) {
    const value = event.tags.find((t) => t[0] === key)?.[1]?.trim();
    if (isWebAddress(value)) return value;
  }
  // A video's poster (NIP-71 keeps it in `imeta`): the file itself is not a picture.
  const poster = mediaPosterOf(event);
  if (isWebAddress(poster)) return poster;
  const text = event.content.trim();
  if (text.startsWith("{")) {
    try {
      const held = JSON.parse(text) as Record<string, unknown>;
      // A product lists its pictures; the first is the one its card shows.
      const first = Array.isArray(held.images) ? held.images[0] : undefined;
      const value = [held.picture, held.image, held.icon, first, held.banner].find(isWebAddress);
      return value ?? null;
    } catch {
      // Not JSON after all: read as words, below.
    }
  }
  return extractImageUrls(event.content, event.tags, { allImeta: event.kind === 20 }).find(isWebAddress) ?? null;
}

const CALENDAR_EVENT_KINDS = new Set([31922, 31923]);

/**
 * The one thing worth saying about a thing beside its name, where its kind has
 * one: when a calendar event is. Null for the rest, and the caller says whose
 * it is instead.
 */
export function taggableDetail(event: KindEvent): string | null {
  if (!CALENDAR_EVENT_KINDS.has(event.kind)) return null;
  const { startSec, isDateOnly } = parseCalendarEvent(event);
  return formatEventDate(startSec, isDateOnly) || null;
}
