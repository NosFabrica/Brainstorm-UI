/**
 * How well typed words name a tag, and whether that earns the tag's people
 * the top of the list.
 *
 * Two gates keep this organic rather than a lever: the words must BE the
 * tag's name (a typo forgiven), not merely start or contain it — three
 * letters do not hand a query to a collection — and the collection must
 * carry some weight, or a tag minted yesterday with two friends on it would
 * lead a popular query. A weak match still shows the tag row as the offer
 * and still marks the carriers; it just leaves the relay's order alone.
 */
import type { TagSummary } from "@/services/tags";

/** Fewer trusted people than this and a collection is an offer, not a ranking. */
export const LEAD_MIN_PEOPLE = 3;

/**
 * One typo apart: an insertion, a deletion, a substitution or two swapped
 * neighbours ("humna" → "human"). Anything more is a different word.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff: number[] = [];
    for (let i = 0; i < a.length && diff.length <= 2; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}

const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean);

/** A typed word names a word: as a prefix, or one edit away when long enough to carry a typo. */
const nearly = (typed: string, word: string) =>
  word.startsWith(typed) || (typed.length >= 4 && withinOneEdit(typed, word));

/**
 * Every typed word finds a word of the name: as a prefix ("ven" → "vendor"),
 * or, for a word long enough to carry a typo, one edit away ("verfied").
 */
export function wordsNearlyMatch(query: string, name: string): boolean {
  const nameWords = words(name);
  return words(query).every((w) => nameWords.some((n) => nearly(w, n)));
}

export type TagMatchStrength = "strong" | "weak";

/** Strong: the words are the tag's name, word for word, a typo forgiven. Weak: anything less. */
export function tagMatchStrength(query: string, name: string): TagMatchStrength {
  const q = words(query),
    n = words(name);
  if (q.length !== n.length) return "weak";
  return q.every((w, i) => w === n[i] || (w.length >= 4 && withinOneEdit(w, n[i]))) ? "strong" : "weak";
}

/** The matched tags whose people may lead the list for these words. */
export function leadingTags(tags: readonly TagSummary[], query: string): TagSummary[] {
  return tags.filter((t) => t.people >= LEAD_MIN_PEOPLE && tagMatchStrength(query, t.name) === "strong");
}
