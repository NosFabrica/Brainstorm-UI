/**
 * The notes a note quotes — by `q` tag or an nevent in its text — as
 * events with their authors, so a compact card can show the quoted note
 * itself where the note's full page already does. "↳ quoted note" in a
 * list told a reader nothing (Benjamin, 2026-09-24).
 *
 * Cached for the session by id, like linked articles: a compact card
 * renders in every list on the site, some outside a query provider, so
 * the lookup keeps its own memory and the hook only watches it.
 */
import { useEffect, useState } from "react";
import { analyzeNote, type MinimalEvent } from "@/lib/noteRefs";
import { fetchEventsByIds } from "@/services/nostr";
import { useLiveProfiles } from "@/hooks/useLiveProfile";

export type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };
/** The quoted note, its author, and the people it mentions — so a name never shows as a key. */
export type QuotedNote = { event: MinimalEvent; author?: ProfileLite; profiles: Map<string, ProfileLite> };

const settled = new Map<string, MinimalEvent | null>();
const pending = new Map<string, Promise<void>>();

function resolve(ids: string[]): Promise<void> {
  const key = ids.join(",");
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const p = fetchEventsByIds(ids)
    .catch(() => [])
    .then((events) => {
      for (const id of ids) settled.set(id, (events.find((e) => e.id === id) as MinimalEvent | undefined) ?? null);
    });
  pending.set(key, p);
  return p;
}

const peopleOf = (e: MinimalEvent) => {
  const refs = analyzeNote(e);
  return [e.pubkey, ...refs.mentionPubkeys, ...refs.replyToPubkeys];
};

export function useQuotedNotes(ids: string[]): { notes: QuotedNote[]; ids: ReadonlySet<string> } {
  const key = ids.join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    const missing = ids.filter((id) => !settled.has(id));
    if (missing.length === 0) return;
    let alive = true;
    void resolve(missing).then(() => {
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = ids.map((id) => settled.get(id)).filter((e): e is MinimalEvent => !!e);
  const profiles = useLiveProfiles([...new Set(events.flatMap(peopleOf))]) as Map<string, ProfileLite>;
  const notes = events.map((event) => ({ event, author: profiles.get(event.pubkey), profiles }));
  return { notes, ids: new Set(events.map((e) => e.id)) };
}

/** Test seam. */
export function __resetQuotedNotes(): void {
  settled.clear();
  pending.clear();
}
