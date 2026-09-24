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
import type { MinimalEvent } from "@/lib/noteRefs";
import { fetchEventsByIds, fetchProfileMap } from "@/services/nostr";

export type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };
export type QuotedNote = { event: MinimalEvent; author?: ProfileLite };

const settled = new Map<string, QuotedNote | null>();
const pending = new Map<string, Promise<void>>();

function resolve(ids: string[]): Promise<void> {
  const key = ids.join(",");
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const p = fetchEventsByIds(ids)
    .catch(() => [])
    .then(async (events) => {
      const authors = [...new Set(events.map((e) => e.pubkey))];
      const profiles = authors.length ? await fetchProfileMap(authors).catch(() => new Map()) : new Map();
      for (const id of ids) {
        const event = events.find((e) => e.id === id);
        settled.set(id, event ? { event: event as MinimalEvent, author: profiles.get(event.pubkey) as ProfileLite | undefined } : null);
      }
    });
  pending.set(key, p);
  return p;
}

function known(ids: string[]): { notes: QuotedNote[]; ids: ReadonlySet<string> } {
  const notes: QuotedNote[] = [];
  const found = new Set<string>();
  for (const id of ids) {
    const q = settled.get(id);
    if (q) {
      notes.push(q);
      found.add(id);
    }
  }
  return { notes, ids: found };
}

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
  return known(ids);
}

/** Test seam. */
export function __resetQuotedNotes(): void {
  settled.clear();
  pending.clear();
}
