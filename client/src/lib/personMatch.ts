import { npubFromPubkey } from "@/lib/shareId";

/** What a person can be found by: whatever of their profile has loaded, and always their key. */
export interface MatchablePerson {
  pubkey: string;
  name?: string | null;
  display_name?: string | null;
  nip05?: string | null;
}

/** Lower-cased, accents stripped: "Ødegaard" folds to "odegaard" so either spelling finds it. */
function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .toLowerCase();
}

/**
 * Keyword search through a follow or follower list (issue #310): every word of
 * the query has to appear in the person's display name, name, NIP-05, npub or
 * hex key, case and accents aside. A blank query matches everyone, so the
 * list reads unfiltered until something is typed.
 */
export function personMatches(query: string, person: MatchablePerson): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [person.display_name, person.name, person.nip05, person.pubkey, npubFromPubkey(person.pubkey)]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map(fold);
  return words.every((w) => haystack.some((h) => h.includes(w)));
}
