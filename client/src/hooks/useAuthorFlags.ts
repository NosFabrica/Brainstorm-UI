import { useEffect, useRef, useState } from "react";
import { hasSettledTrustSignals, lookupTrustSignals, settledTrustSignals } from "@/services/trustSignals";

/**
 * Whether the network has FLAGGED each author — verified reporters past the
 * server's threshold, house Perspective — read off the same Trust signals
 * lookup the tier rings use, so the chip costs nothing extra. `undefined`
 * until the answer lands: an unanswered lookup must never read as "clean".
 */
export function useAuthorFlags(pubkeys: string[]): (pk: string) => boolean | undefined {
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
  return (pk) => settledTrustSignals(pk)?.flagged;
}
