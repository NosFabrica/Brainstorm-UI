import type { Filter } from "nostr-tools";
import type { MinimalEvent } from "@/lib/noteRefs";
import { RECIPE_TAGS, publishedOnZapCooking } from "@/lib/sourceApp";
import { liveStateOf } from "@/lib/liveStream";

/**
 * What a person publishes, as chips on their row in search.
 *
 * Finding Staci's shop took four steps: search the name, open the profile,
 * find the magnifier, pick Shop. Google's answer is sitelinks: the row itself
 * says what is there, one tap lands on it. Six probes on the search relay —
 * one event of each kind is enough to know — and the chips in a fixed order,
 * at most four, only for what is actually there.
 */
export type PersonContentKey = "shop" | "articles" | "recipes" | "music" | "media" | "live" | "repos";

/**
 * The seven probes, in chip order. Recipes are articles wearing zap.cooking's
 * tag, asked for on their own: the newest article of a recipe site can be a
 * newsletter (Zap Cooking, 2026-09-24), and one sample would have hidden the
 * recipes behind it. An author with essays and recipes wears both chips.
 */
export const PERSON_CONTENT_CATEGORIES: readonly { key: PersonContentKey; kinds: readonly number[]; tags?: readonly string[] }[] = [
  { key: "shop", kinds: [30402] },
  { key: "articles", kinds: [30023, 30818] },
  { key: "recipes", kinds: [30023], tags: RECIPE_TAGS },
  { key: "music", kinds: [31337] },
  { key: "media", kinds: [20, 21, 22, 34235, 34236] },
  { key: "live", kinds: [30311] },
  { key: "repos", kinds: [30617] },
];

export const MAX_PERSON_CONTENT_CHIPS = 4;

/**
 * A chip promises something you can act on now. A listing or a stream from
 * 2023 breaks that promise (Vitor's Shop chip, 2026-09-24, led to a shelf
 * nobody could buy from), so Shop and Live go stale after a year. Articles,
 * recipes, music, media and code are evergreen: a 2023 article still reads.
 */
export const STALE_AFTER_SEC: Partial<Record<PersonContentKey, number>> = {
  shop: 365 * 86_400,
  live: 365 * 86_400,
};

/** The search relay refuses a filter without a lens; this one asks for the whole corpus. */
export const PERSON_CONTENT_LENS = "include:spam";

/** The word on the chip, the noun for its label, the tab it opens. */
export const PERSON_CONTENT_WORDS: Record<PersonContentKey, { label: string; noun: string; tab: string }> = {
  shop: { label: "Shop", noun: "shop", tab: "shop" },
  articles: { label: "Articles", noun: "articles", tab: "articles" },
  recipes: { label: "Recipes", noun: "recipes", tab: "recipes" },
  music: { label: "Music", noun: "music", tab: "music" },
  media: { label: "Media", noun: "media", tab: "media" },
  live: { label: "Live", noun: "live streams", tab: "live" },
  repos: { label: "Code", noun: "code", tab: "repos" },
};

export interface PersonContentChip {
  key: PersonContentKey;
  label: string;
  tab: string;
  /** A stream on air this minute — the chip wears a red dot. */
  liveNow: boolean;
}

export interface PersonContent {
  chips: PersonContentChip[];
}

export const NO_PERSON_CONTENT: PersonContent = Object.freeze({ chips: [] }) as PersonContent;

/** Six filters for one REQ: the newest event of each category, under the lens. */
export function personContentFilters(pubkey: string): Filter[] {
  return PERSON_CONTENT_CATEGORIES.map((c) => ({ kinds: [...c.kinds], authors: [pubkey], limit: 1, search: PERSON_CONTENT_LENS, ...(c.tags ? { "#t": [...c.tags] } : {}) }));
}

const chipFor = (key: PersonContentKey, liveNow = false): PersonContentChip => ({ key, label: PERSON_CONTENT_WORDS[key].label, tab: PERSON_CONTENT_WORDS[key].tab, liveNow });

/** Ordered, capped chips from whatever the probe returned. Kinds outside the table are ignored. */
export function categoriesOf(events: MinimalEvent[], nowSec: number = Math.floor(Date.now() / 1000)): PersonContentChip[] {
  const chips: PersonContentChip[] = [];
  const isArticle = (e: MinimalEvent) => e.kind === 30023 || e.kind === 30818;
  const isRecipe = (e: MinimalEvent) => e.kind === 30023 && publishedOnZapCooking(e);
  for (const category of PERSON_CONTENT_CATEGORIES) {
    let sample: MinimalEvent | undefined;
    // Articles are the essays; recipes are their own answer. The relay's
    // article probe may itself return a recipe, which counts for Recipes.
    if (category.key === "articles") sample = events.find((e) => isArticle(e) && !isRecipe(e));
    else if (category.key === "recipes") sample = events.find(isRecipe);
    else sample = events.find((e) => category.kinds.includes(e.kind));
    if (!sample) continue;
    const staleAfter = STALE_AFTER_SEC[category.key];
    if (staleAfter !== undefined && nowSec - sample.created_at > staleAfter) continue;
    if (category.key === "live") chips.push(chipFor("live", liveStateOf({ ...sample, content: sample.content ?? "" }, nowSec) === "live"));
    else chips.push(chipFor(category.key));
    if (chips.length === MAX_PERSON_CONTENT_CHIPS) break;
  }
  return chips;
}

/** "Staci's shop", "Zap Cooking's recipes", "Staci's live streams". */
export function chipAriaLabel(name: string, chip: PersonContentChip): string {
  return `${name}'s ${PERSON_CONTENT_WORDS[chip.key].noun}`;
}

/** The words people type for a category: "staci shop", "vitor articles", "zap cooking recipes". */
const CATEGORY_WORDS: Record<string, PersonContentKey> = {
  shop: "shop", store: "shop", products: "shop", listings: "shop",
  articles: "articles", article: "articles", writing: "articles", posts: "articles", blog: "articles",
  recipes: "recipes", recipe: "recipes",
  music: "music", songs: "music", tracks: "music",
  media: "media", photos: "media", pictures: "media", pics: "media", videos: "media", video: "media",
  live: "live", stream: "live", streams: "live", streaming: "live",
  code: "repos", repos: "repos", repo: "repos", github: "repos",
};

/**
 * "staci shop" is a person and a category — Google reads "nike shoes" the same
 * way. The name to look up and the category the intent row lands on; null when
 * the words do not end in a category word, or nothing precedes it.
 */
export function searchIntent(query: string): { name: string; key: PersonContentKey } | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const key = CATEGORY_WORDS[words[words.length - 1].toLowerCase()];
  if (!key) return null;
  return { name: words.slice(0, -1).join(" "), key };
}

/**
 * The intent row's target: "staci shop" and a suggested person whose chips say shop —
 * the first such person in the list, with the chip to land on. Null when nobody
 * suggested has that category: a row that only says no would be noise.
 */
export function intentTarget<P extends { pubkey: string }>(
  intent: { name: string; key: PersonContentKey } | null,
  people: readonly P[],
  content: Map<string, PersonContent | undefined>,
): { person: P; chip: PersonContentChip } | null {
  if (!intent) return null;
  for (const person of people) {
    const chip = content.get(person.pubkey)?.chips.find((c) => c.key === intent.key);
    if (chip) return { person, chip };
  }
  return null;
}
