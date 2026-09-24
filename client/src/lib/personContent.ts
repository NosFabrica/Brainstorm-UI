import type { Filter } from "nostr-tools";
import type { MinimalEvent } from "@/lib/noteRefs";
import { publishedOnZapCooking } from "@/lib/sourceApp";
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

/** The six probes, in chip order. Recipes is not probed: it is an article wearing zap.cooking's tag. */
export const PERSON_CONTENT_CATEGORIES: readonly { key: Exclude<PersonContentKey, "recipes">; kinds: readonly number[] }[] = [
  { key: "shop", kinds: [30402] },
  { key: "articles", kinds: [30023, 30818] },
  { key: "music", kinds: [31337] },
  { key: "media", kinds: [20, 21, 22, 34235, 34236] },
  { key: "live", kinds: [30311] },
  { key: "repos", kinds: [30617] },
];

export const MAX_PERSON_CONTENT_CHIPS = 4;

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
  return PERSON_CONTENT_CATEGORIES.map((c) => ({ kinds: [...c.kinds], authors: [pubkey], limit: 1, search: PERSON_CONTENT_LENS }));
}

const chipFor = (key: PersonContentKey, liveNow = false): PersonContentChip => ({ key, label: PERSON_CONTENT_WORDS[key].label, tab: PERSON_CONTENT_WORDS[key].tab, liveNow });

/** Ordered, capped chips from whatever the probe returned. Kinds outside the table are ignored. */
export function categoriesOf(events: MinimalEvent[], nowSec: number = Math.floor(Date.now() / 1000)): PersonContentChip[] {
  const chips: PersonContentChip[] = [];
  for (const category of PERSON_CONTENT_CATEGORIES) {
    const sample = events.find((e) => category.kinds.includes(e.kind));
    if (!sample) continue;
    if (category.key === "articles") chips.push(chipFor(publishedOnZapCooking(sample) ? "recipes" : "articles"));
    else if (category.key === "live") chips.push(chipFor("live", liveStateOf({ ...sample, content: sample.content ?? "" }, nowSec) === "live"));
    else chips.push(chipFor(category.key));
    if (chips.length === MAX_PERSON_CONTENT_CHIPS) break;
  }
  return chips;
}

/** "Staci's shop", "Zap Cooking's recipes", "Staci's live streams". */
export function chipAriaLabel(name: string, chip: PersonContentChip): string {
  return `${name}'s ${PERSON_CONTENT_WORDS[chip.key].noun}`;
}
