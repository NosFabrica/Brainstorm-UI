/**
 * Which tabs a results page offers, and in what order, from how many results each holds for the
 * words (services/search's countTabs). A tab with nothing to show is a door to "Nothing found":
 * "bars in funchal" offers no People tab, and the More menu holds only what the words find.
 *
 * One-sided on purpose: a tab hides only when it is KNOWN to hold nothing. An unknown count, the
 * tab the reader is on, Top and All always show. Some tabs show more than the relay's answer for
 * their own kinds, and hide only when everything they draw on is known to be empty: People leads
 * with the people on a tag the words name; Media keeps the notes that carry a picture and leads
 * with a named person's own things, and a person is named only by a profile the words match; Music
 * draws on Wavlake, the Podcast Index and the people tagged Musician as well, which no count
 * covers, so it never hides.
 */
import type { SearchTab } from "@/services/search";

export type TabCounts = Partial<Record<SearchTab, number | null>>;

export interface TabEvidence {
  counts: TabCounts;
  /** The words name a tag, whose people can lead People. Undefined until known. */
  tagNamed?: boolean;
}

const known = (n: number | null | undefined): n is number => typeof n === "number";

/** Whether `tab` holds anything for the words: true, false, or null when not known. */
export function tabHolds(tab: SearchTab, { counts, tagNamed }: TabEvidence): boolean | null {
  if (tab === "top" || tab === "all") return true;
  const own = counts[tab];
  if (!known(own)) return null;
  if (own > 0) return true;
  if (tab === "people") return tagNamed === undefined ? null : tagNamed;
  if (tab === "music") return null;
  if (tab === "media") {
    const { notes, people } = counts;
    if (!known(notes) || !known(people)) return null;
    return notes > 0 || people > 0 ? null : false;
  }
  return false;
}

/** Whether the page offers `tab`: always when it is the one being read, else unless it holds nothing. */
export function offersTab(tab: SearchTab, active: boolean, evidence: TabEvidence): boolean {
  return active || tabHolds(tab, evidence) !== false;
}

/**
 * The tabs, most results first; an unknown count after the known ones, each keeping its place
 * among its equals. For the More menu's groups, where "ten GitHub accounts and two Facebook
 * profiles" should read GitHub first — not for the pinned row, where raw counts would put Notes,
 * the largest corpus, first for nearly every search.
 */
export function byCount<T extends { key: SearchTab }>(tabs: readonly T[], counts: TabCounts): T[] {
  const n = (t: T) => counts[t.key] ?? -1;
  return [...tabs].sort((a, b) => n(b) - n(a));
}
