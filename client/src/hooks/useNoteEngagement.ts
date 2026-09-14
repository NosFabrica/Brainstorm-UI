import { useEffect, useState } from "react";
import { fetchNoteEngagement } from "@/services/search";

/**
 * Zap / reply counts for a list of notes — the home feed's quiet engagement
 * line. Same discipline as useAppEndorsements: a session-level memo (one
 * pair of COUNTs per note, however many rows ask) and an in-flight cap, so a
 * feed of forty rows queues its lookups instead of opening eighty
 * subscriptions at once. Deterministic on purpose — no viewport gating.
 */
export type NoteEngagement = { zaps: number; replies: number };

const MAX_INFLIGHT = 4;
const cache = new Map<string, Promise<NoteEngagement>>();
const settled = new Map<string, NoteEngagement>();
const queue: (() => void)[] = [];
let inflight = 0;

function pump() {
  while (inflight < MAX_INFLIGHT && queue.length) {
    inflight++;
    queue.shift()!();
  }
}

function lookup(id: string): Promise<NoteEngagement> {
  let p = cache.get(id);
  if (!p) {
    p = new Promise<NoteEngagement>((resolve) => {
      queue.push(() => {
        fetchNoteEngagement(id)
          .catch((): NoteEngagement => ({ zaps: 0, replies: 0 }))
          .then((e) => {
            inflight--;
            settled.set(id, e);
            resolve(e);
            pump();
          });
      });
      pump();
    });
    cache.set(id, p);
  }
  return p;
}

/** Counts for the ids that have settled — a lookup function, stable per render. */
export function useNoteEngagement(ids: string[]): (id: string) => NoteEngagement | null {
  const [, setVersion] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    const missing = ids.filter((id) => !settled.has(id));
    if (missing.length === 0) return;
    let alive = true;
    void Promise.all(missing.map(lookup)).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (id: string) => settled.get(id) ?? null;
}

/** Test seam. */
export function __resetNoteEngagementCache(): void {
  cache.clear();
  settled.clear();
  queue.length = 0;
  inflight = 0;
}
