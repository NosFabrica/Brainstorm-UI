/**
 * List items on the Top page: a search that names a list —
 * "github vcavallo" — shows the items the rest of the words find, above
 * People, as the cards the list's own definition draws (DListItemCard).
 *
 * For everyone, signed in or not (the team, 2026-10-05): the results are the
 * value, while Settings › Dictionary, the page about the lists, stays
 * admin-only. A signed-out visitor reads Brainstorm's definitions (ADR 0004).
 * Which lists are searchable is config (`search` in
 * config/dictionary.config.json); how a list is named and matched is its
 * governing definition (lib/listSearch, ADR 0004). The items are the ones the
 * Dictionary reads, fetched only once the words name their list.
 */
import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { DListItemCard } from "@/components/dictionary/DListItemCard";
import { Section } from "@/components/search/sections";
import { SEARCHABLE_CONCEPTS } from "@/config/dictionary";
import { useConceptItems } from "@/hooks/useConceptItems";
import { useDictionary } from "@/hooks/useDictionary";
import { listQueryOf, matchListItems } from "@/lib/listSearch";
import type { SearchTab } from "@/services/search";

const MAX_ITEMS = 3;

export function ListItemResults({ query, onTabChange }: { query: string; onTabChange: (t: SearchTab) => void }) {
  const dictionary = useDictionary(true, { anonymous: true });

  const searchable = useMemo(
    () => (dictionary.data ?? []).filter((e) => e.resolved && SEARCHABLE_CONCEPTS.includes(e.communityCoordinate)),
    [dictionary.data],
  );
  const asked = useMemo(
    () =>
      listQueryOf(
        query,
        searchable.map((e) => ({
          coordinate: e.communityCoordinate,
          singular: e.resolved!.governing.singular,
          plural: e.resolved!.governing.plural,
        })),
      ),
    [query, searchable],
  );
  const entry = asked ? searchable.find((e) => e.communityCoordinate === asked.coordinate) : undefined;
  const items = useConceptItems(entry, !!entry);

  const definition = entry?.resolved?.governing;
  const found = useMemo(
    () => (asked && definition && items.data ? matchListItems(items.data, definition, asked.words, MAX_ITEMS) : []),
    [asked, definition, items.data],
  );

  if (!definition || found.length === 0) return null;
  return (
    <Section id="list-items" kicker={definition.plural} onTabChange={onTabChange}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="list-item-results">
        {found.map((item) => (
          <DListItemCard key={item.id} event={item as NostrEvent} />
        ))}
      </div>
    </Section>
  );
}
