import { useEffect, useRef, useState } from "react";
import { __resetHouseSignals, hasSettledHouseSignals, lookupHouseSignals, settledHouseSignals } from "@/lib/houseSignals";

/**
 * House-influence scores for a list of authors, for surfaces that show faces
 * without fetching trust (dashboard feed, article rows, reply-target chips).
 *
 * Backed by the shared house-signals memo (lib/houseSignals): every surface
 * shares one cache, lookups are batched, and a pubkey is fetched once per
 * session. House POV: the request is unauthenticated, so rings work logged out.
 */
export function useAuthorScores(pubkeys: string[]): (pk: string) => number | null | undefined {
  const [, setVersion] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const todo = Array.from(new Set(pubkeys)).filter((pk) => pk && !hasSettledHouseSignals(pk));
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
