import { useCallback, useEffect, useState } from "react";
import {
  __resetTrustSignals,
  hasSettledTrustSignals,
  lookupTrustSignals,
  settledTrustSignals,
} from "@/services/trustSignals";

const MAX_RETRIES = 2;
const RETRY_MS = 5000;

/**
 * House-influence scores for a list of authors, for surfaces that show faces
 * without fetching trust (dashboard feed, article rows, reply-target chips).
 *
 * Backed by the shared Trust signals memo (services/trustSignals): every surface
 * shares one cache, lookups are batched, and a pubkey is fetched once per
 * session. House POV: the request is unauthenticated, so rings work logged out.
 */
export function useAuthorScores(
  pubkeys: string[],
  opts?: { now?: boolean },
): (pk: string) => number | null | undefined {
  const now = !!opts?.now;
  const [version, setVersion] = useState(0);
  // A failed request settles nobody (services/trustSignals), so their faces
  // stay "loading", not "unrated"; ask again a few times before leaving them.
  const [attempt, setAttempt] = useState(0);
  const key = pubkeys.join(",");
  useEffect(() => setAttempt(0), [key]);
  useEffect(() => {
    // Per run: a superseded run neither re-renders nor leaves a retry behind
    // (the next run awaits the same pending lookups).
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const todo = Array.from(new Set(pubkeys)).filter((pk) => pk && !hasSettledTrustSignals(pk));
    if (todo.length) {
      void Promise.allSettled(todo.map((pk) => lookupTrustSignals(pk, { now }))).then(() => {
        if (cancelled) return;
        setVersion((v) => v + 1);
        if (attempt < MAX_RETRIES && todo.some((pk) => !hasSettledTrustSignals(pk))) {
          retry = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
        }
      });
    }
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [key, now, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  // One identity per batch of scores landing, not per render: a reader handed
  // to memoised rows (search cards, comment rows) would otherwise redraw every
  // row on every parent render. A new score still yields a new function, so
  // anything keyed on it reads the new numbers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((pk: string) => settledTrustSignals(pk)?.influence, [version]);
}

/** Test seam: forget every author's signals. */
export const __resetAuthorSignals = __resetTrustSignals;
