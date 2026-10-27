import { useCallback, useMemo } from "react";
import { nameOf as profileName, type Profiles } from "@/components/messages/people";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useMyAssistants } from "@/hooks/useMyAssistants";
import { designatedManager, managerOptions, type ManagerOption } from "@/lib/managedDictionary";
import { orderRows } from "@/lib/myAssistants";

export interface DictionaryManagers {
  /** The picker's choices (lib/managedDictionary); empty until `settled`. */
  options: ManagerOption[];
  /** Every option's pubkey, sorted: whose copies the Dictionary reads. Null until `settled`. */
  pubkeys: string[] | null;
  /** The Assistants and the Treasure Map have both answered, so the default won't change under the reader. */
  settled: boolean;
  profiles: Profiles;
  nameOf: (pubkey: string) => string;
}

/**
 * Who may manage the reader's Dictionary, for Settings › Dictionary's
 * "Managed by": the reader, their Assistants (hooks/useMyAssistants: everyone
 * they've tagged one, and the one Brainstorm hosts for them), and whoever
 * their Treasure Map gives Concept headers to. Nothing is offered until both
 * the taggings and the Map have answered, so the page settles on its default
 * once rather than switching Dictionaries as they arrive.
 */
export function useDictionaryManagers(me: string | null): DictionaryManagers {
  const mine = useMyAssistants(me);
  const designated = useMemo(() => designatedManager(mine.map), [mine.map]);
  const settled = !!me && mine.settled && mine.mapStatus !== "loading";

  const people = useMemo(
    () => [...new Set([...(me ? [me] : []), ...mine.rows.map((r) => r.pubkey), ...(designated ? [designated] : [])])],
    [me, mine.rows, designated],
  );
  const profiles = useLiveProfiles(people);
  const nameOf = useCallback((pubkey: string) => profileName(pubkey, profiles), [profiles]);

  const options = useMemo(
    () =>
      me && settled
        ? managerOptions({
            me,
            assistants: orderRows(mine.rows, nameOf).map((r) => r.pubkey),
            local: mine.rows.find((r) => r.local)?.pubkey ?? null,
            designated,
          })
        : [],
    [me, settled, mine.rows, nameOf, designated],
  );
  // Sorted, so names arriving (which reorder the picker) don't read the Dictionary again.
  const pubkeys = useMemo(() => (settled ? options.map((o) => o.pubkey).sort() : null), [settled, options]);

  return { options, pubkeys, settled, profiles, nameOf };
}
