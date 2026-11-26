import { useMemo } from "react";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { useDictionaryEntries } from "@/hooks/useDictionaryEntries";
import type { DictionaryEntry } from "@/services/dictionary";

export interface UserDictionarySummary {
  entries: DictionaryEntry[];
  /** Concepts the user, or their Assistant, already holds a copy of. */
  held: number;
  /** Concepts the app offers. */
  total: number;
}

/**
 * One user's Dictionary as admin sees it, from the relays through the
 * EventStore — the same read as their own Settings tab
 * (hooks/useDictionaryEntries), so the two can't disagree. `enabled` lets a
 * menu ask only once it's opened. After a publish from the server, read it
 * again with `readAgain(DICTIONARY_READS)` (lib/readGeneration).
 */
export function useUserDictionary(pubkey: string, taPubkey: string | null, enabled = true) {
  const { shown, known } = useDictionaryConcepts();
  const reader = useMemo(() => ({ pubkey, taPubkey }), [pubkey, taPubkey]);
  // Which concepts they hold needs headers and copies, never items.
  const read = useDictionaryEntries(reader, shown, {
    enabled: enabled && known,
    prefix: "admin/dictionary",
    window: { minMs: 60_000 },
  });
  const data = useMemo<UserDictionarySummary | undefined>(
    () =>
      read.entries && {
        entries: read.entries,
        held: read.entries.filter((e) => e.inDictionary).length,
        total: shown.length,
      },
    [read.entries, shown.length],
  );
  return { data, isPending: !data, isError: false };
}
