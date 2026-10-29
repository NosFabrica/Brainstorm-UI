/**
 * The Top page's sections in the order the evidence puts them. What the
 * words asked for leads (a kind they name, a list, a `kind:` token, a kind
 * whose title they mostly cover); People lead only when the words read as a
 * person; the middle sections rank by what came back; the weakest matches
 * and Media close the page. Nothing holds a fixed band — a kind added
 * tomorrow takes the place its evidence earns, and a ranker that reads the
 * query better only changes the evidence, never this.
 */
export type TopSection =
  | "kinds-lead"
  | "lists"
  | "kind"
  | "kinds-follow"
  | "latest"
  | "people"
  | "articles"
  | "shop"
  | "listen"
  | "happening"
  | "kinds-late"
  | "media";

export type RankedSection = "articles" | "shop" | "listen" | "happening";

export interface TopEvidence {
  /** The words read as a person: a handle, a key, or an account the handles point at. */
  personQuery: boolean;
  /** What each section came back with; a section not named counts as 0. */
  counts: Partial<Record<RankedSection | "people" | "latest" | "media", number>>;
}

/** The sections the words asked for, in the order their asks rank. */
const ASKED: readonly TopSection[] = ["kinds-lead", "lists", "kind", "kinds-follow", "latest"];
/** The sections that rank by what came back, in the order ties keep. */
const RANKED: readonly RankedSection[] = ["articles", "shop", "listen", "happening"];
/** The close: what only shares a word with the search, and media. */
const CLOSE: readonly TopSection[] = ["kinds-late", "media"];

export function orderTopSections({ personQuery, counts }: TopEvidence): TopSection[] {
  const count = (s: RankedSection) => counts[s] ?? 0;
  const ranked = [...RANKED].sort((a, b) => count(b) - count(a));
  return personQuery ? ["people", ...ASKED, ...ranked, ...CLOSE] : [...ASKED, "people", ...ranked, ...CLOSE];
}
