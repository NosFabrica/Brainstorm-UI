/**
 * The notes a note quotes — by `q` tag or an nevent in its text — as
 * events with their authors, so a compact card can show the quoted note
 * itself where the note's full page already does. "↳ quoted note" in a
 * list told a reader nothing (Benjamin, 2026-09-24).
 *
 * Live from the store: one ask per set of ids per window.
 */
import { useMemo } from "react";
import { analyzeNote, type MinimalEvent } from "@/lib/noteRefs";
import { fetchEventsByIds } from "@/services/nostr";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useStoreEvents } from "@/hooks/useStoreEvents";

export type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };
/** The quoted note, its author, and the people it mentions — so a name never shows as a key. */
export type QuotedNote = { event: MinimalEvent; author?: ProfileLite; profiles: Map<string, ProfileLite> };

const peopleOf = (e: MinimalEvent) => {
  const refs = analyzeNote(e);
  return [e.pubkey, ...refs.mentionPubkeys, ...refs.replyToPubkeys];
};

export function useQuotedNotes(ids: string[]): { notes: QuotedNote[]; ids: ReadonlySet<string> } {
  const key = ids.join(",");
  const filters = useMemo(() => (key ? [{ ids: key.split(",") }] : null), [key]);
  const quoted = useStoreEvents(key ? `quoted-notes:${key}` : null, filters, () => fetchEventsByIds(key.split(",")));
  const events = quoted.events as MinimalEvent[];
  const profiles = useLiveProfiles([...new Set(events.flatMap(peopleOf))]) as Map<string, ProfileLite>;
  return useMemo(
    () => ({
      notes: events.map((event) => ({ event, author: profiles.get(event.pubkey), profiles })),
      ids: new Set(events.map((e) => e.id)),
    }),
    [events, profiles],
  );
}
