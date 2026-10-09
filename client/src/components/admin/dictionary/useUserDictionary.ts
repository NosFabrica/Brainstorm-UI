import { useQuery } from "@tanstack/react-query";
import { DICTIONARY_CONCEPTS } from "@/config/dictionary";
import { loadDictionary, type DictionaryEntry } from "@/services/dictionary";

export interface UserDictionarySummary {
  entries: DictionaryEntry[];
  /** Concepts the user, or their Assistant, already holds a copy of. */
  held: number;
  /** Concepts the app offers. */
  total: number;
}

export const userDictionaryKey = (pubkey: string, taPubkey: string | null) =>
  ["admin/dictionary", pubkey, taPubkey ?? ""] as const;

/**
 * One user's Dictionary as admin sees it, straight from the relay — the
 * same read as their own Settings tab (services/dictionary), so the two
 * can't disagree. `enabled` lets a menu ask only once it's opened.
 */
export function useUserDictionary(pubkey: string, taPubkey: string | null, enabled = true) {
  return useQuery({
    queryKey: userDictionaryKey(pubkey, taPubkey),
    queryFn: async (): Promise<UserDictionarySummary> => {
      // Which concepts they hold needs headers and copies, never items.
      const entries = await loadDictionary({ pubkey, taPubkey }, undefined, undefined, { items: false });
      return { entries, held: entries.filter((e) => e.inDictionary).length, total: DICTIONARY_CONCEPTS.length };
    },
    enabled,
    staleTime: 60_000,
    retry: 0,
  });
}
