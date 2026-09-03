import { useEffect, useState } from "react";
import { fetchAppEndorsements, type AppEndorsements } from "@/services/endorsements";

/**
 * An app's endorsements for a component, with the results-page discipline
 * `useAuthorScores` set: a session-level promise memo (one fetch per address
 * and limits, however many cards ask) plus an in-flight cap, so an Apps tab
 * of a hundred hits queues its lookups instead of opening hundreds of
 * subscriptions at once. Deterministic on purpose — no viewport gating, so
 * it behaves the same under test as in a browser.
 */
const MAX_INFLIGHT = 4;
const cache = new Map<string, Promise<AppEndorsements>>();
const settled = new Map<string, AppEndorsements>();
const queue: (() => void)[] = [];
let inflight = 0;

function pump() {
  while (inflight < MAX_INFLIGHT && queue.length) {
    inflight++;
    queue.shift()!();
  }
}

interface Opts {
  publisher: string;
  reviewLimit?: number;
  zapLimit?: number;
}

function lookup(address: string, opts: Opts): Promise<AppEndorsements> {
  const key = `${address}|${opts.reviewLimit ?? 50}|${opts.zapLimit ?? 50}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise<AppEndorsements>((resolve) => {
      queue.push(() => {
        fetchAppEndorsements(address, opts)
          .catch(
            (): AppEndorsements => ({ address, reviews: [], reviewCount: 0, zaps: [], zapCount: 0, collectionCount: 0 }),
          )
          .then((e) => {
            inflight--;
            settled.set(key, e);
            resolve(e);
            pump();
          });
      });
      pump();
    });
    cache.set(key, p);
  }
  return p;
}

export function useAppEndorsements(address: string | null, opts: Opts): AppEndorsements | null {
  const key = address ? `${address}|${opts.reviewLimit ?? 50}|${opts.zapLimit ?? 50}` : null;
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!address || !key || settled.has(key)) return;
    let alive = true;
    void lookup(address, opts).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.publisher]);
  return key ? settled.get(key) ?? null : null;
}

/** Test seam. */
export function __resetAppEndorsementsCache(): void {
  cache.clear();
  settled.clear();
  queue.length = 0;
  inflight = 0;
}
