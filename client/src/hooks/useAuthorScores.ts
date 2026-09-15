import { useEffect, useRef, useState } from "react";
import { __resetTrustSignals, hasSettledTrustSignals, lookupTrustSignals, settledTrustSignals } from "@/services/trustSignals";

/**
 * House-influence scores for a list of authors, for surfaces that show faces
 * without fetching trust (dashboard feed, article rows, reply-target chips).
 *
 * Backed by the shared Trust signals memo (services/trustSignals): every surface
 * shares one cache, lookups are batched, and a pubkey is fetched once per
 * session. House POV: the request is unauthenticated, so rings work logged out.
 */
export function useAuthorScores(pubkeys: string[]): (pk: string) => number | null | undefined {
  const [, setVersion] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const todo = Array.from(new Set(pubkeys)).filter((pk) => pk && !hasSettledTrustSignals(pk));
    if (todo.length) {
      void Promise.allSettled(todo.map(lookupTrustSignals)).then(() => {
        if (alive.current) setVersion((v) => v + 1);
      });
    }
    return () => { alive.current = false; };
  }, [pubkeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (pk) => settledTrustSignals(pk)?.influence;
}

/** Test seam: forget every author's signals. */
export const __resetAuthorSignals = __resetTrustSignals;
