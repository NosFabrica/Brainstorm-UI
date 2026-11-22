import { useCallback, useMemo } from "react";
import { useAddressedEvents } from "@/hooks/useAddressedEvents";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { pluralLabel } from "@/lib/allCategories";
import { headerNames, parseCoordinate } from "@/lib/dlistFields";
import { kindTypeLabel } from "@/lib/kindLabel";
import { fetchEventsByIds } from "@/services/nostr";

const HEX = /^[0-9a-f]{64}$/;

/**
 * What each content list's tag was applied to, by name (ADR `trusted-lists/0002` D2, D5): an
 * event kind as this app names it ("Notes", "Photos"), a DList by its header's plural ("Books").
 * The server titles its lists in its own words (D4); this card speaks the app's. Every header the
 * run names is asked for at once, from the store first (ADR 0005). Until a header is found, or if
 * it can't be: its `d`, as a tag's tab names a list meanwhile, else its id's start.
 */
export function useTaggingTargetNames(targets: (string | null | undefined)[]): (target: string) => string {
  const key = JSON.stringify([...new Set(targets.filter((t): t is string => !!t))].sort());
  const { coords, ids } = useMemo(() => {
    const all = JSON.parse(key) as string[];
    return { coords: all.filter((t) => parseCoordinate(t)), ids: all.filter((t) => HEX.test(t)) };
  }, [key]);
  const byCoord = useAddressedEvents(coords);
  const idFilters = useMemo(() => (ids.length ? [{ ids }] : null), [ids]);
  const byId = useStoreEvents(ids.length ? `tagging-target-headers:${ids.join(",")}` : null, idFilters, () =>
    fetchEventsByIds(ids),
  );
  return useCallback(
    (target: string) => {
      if (/^\d+$/.test(target)) return pluralLabel(kindTypeLabel(Number(target)));
      const coord = parseCoordinate(target);
      const header = coord ? byCoord.get(target) : byId.events.find((e) => e.id === target);
      if (header) return headerNames(header).plural || target;
      return coord ? coord.d : `${target.slice(0, 8)}…`;
    },
    [byCoord, byId.events],
  );
}
