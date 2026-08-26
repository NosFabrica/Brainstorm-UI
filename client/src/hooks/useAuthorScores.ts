import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/services/api";

/**
 * House-influence scores for a list of authors, for surfaces that show faces
 * without fetching trust (dashboard feed, article rows, reply-target chips).
 *
 * There is no backend batch endpoint (the recorded ask), so this is the same
 * discipline `lib/contentSearch.ts` uses: a session-level promise memo — every
 * surface shares one cache, concurrent lookups dedupe, and a pubkey is fetched
 * once per session. House POV on purpose: these are ambient rings, identical
 * for every viewer, and `getHouseInfluence` needs no auth so they work logged
 * out. Fan-out per call is capped; authors beyond the cap simply stay
 * unrated (no ring), which is the honest render.
 */
const cache = new Map<string, Promise<number | null>>();
const settled = new Map<string, number | null>();
const MAX_FETCH_PER_CALL = 60;

function lookup(pubkey: string): Promise<number | null> {
  let p = cache.get(pubkey);
  if (!p) {
    p = apiClient
      .getHouseInfluence(pubkey)
      .catch(() => null)
      .then((s) => {
        const v = typeof s === "number" && Number.isFinite(s) ? s : null;
        settled.set(pubkey, v);
        return v;
      });
    cache.set(pubkey, p);
  }
  return p;
}

export function useAuthorScores(pubkeys: string[]): (pk: string) => number | null | undefined {
  const [, setVersion] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const todo = Array.from(new Set(pubkeys)).filter((pk) => pk && !settled.has(pk)).slice(0, MAX_FETCH_PER_CALL);
    if (todo.length) {
      void Promise.allSettled(todo.map(lookup)).then(() => {
        if (alive.current) setVersion((v) => v + 1);
      });
    }
    return () => { alive.current = false; };
  }, [pubkeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (pk) => settled.get(pk);
}
