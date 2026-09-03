import { useEffect, useRef, useState } from "react";
import { __resetHouseSignals, hasSettledHouseSignals, lookupHouseSignals, settledHouseSignals } from "@/lib/houseSignals";

/**
 * House-influence scores for a list of authors, for surfaces that show faces
 * without fetching trust (dashboard feed, article rows, reply-target chips).
 *
 * Backed by the shared house-signals memo (lib/houseSignals): every surface
 * shares one cache, concurrent lookups dedupe, and a pubkey is fetched once
 * per session. House POV on purpose: these are ambient rings, identical for
 * every viewer, and the overview needs no auth so they work logged out.
 * Fan-out per call is capped; authors beyond the cap simply stay unrated (no
 * ring), which is the honest render.
 */
const MAX_FETCH_PER_CALL = 60;

export function useAuthorScores(pubkeys: string[]): (pk: string) => number | null | undefined {
  const [, setVersion] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const todo = Array.from(new Set(pubkeys)).filter((pk) => pk && !hasSettledHouseSignals(pk)).slice(0, MAX_FETCH_PER_CALL);
    if (todo.length) {
      void Promise.allSettled(todo.map(lookupHouseSignals)).then(() => {
        if (alive.current) setVersion((v) => v + 1);
      });
    }
    return () => { alive.current = false; };
  }, [pubkeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (pk) => settledHouseSignals(pk)?.influence;
}

/** Test seam: forget every author's signals. */
export const __resetAuthorSignals = __resetHouseSignals;
