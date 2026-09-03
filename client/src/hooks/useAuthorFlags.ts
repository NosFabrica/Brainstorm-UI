import { useEffect, useRef, useState } from "react";
import { hasSettledHouseSignals, lookupHouseSignals, settledHouseSignals } from "@/lib/houseSignals";

/**
 * Whether the network has FLAGGED each author — verified reporters past the
 * server's threshold, house Perspective — read off the same overview the
 * tier rings already fetch, so the chip costs nothing extra. `undefined`
 * until the answer lands: an unanswered lookup must never read as "clean".
 */
const MAX_FETCH_PER_CALL = 60;

export function useAuthorFlags(pubkeys: string[]): (pk: string) => boolean | undefined {
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
  return (pk) => settledHouseSignals(pk)?.flagged;
}
