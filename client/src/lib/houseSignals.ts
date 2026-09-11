import { apiClient } from "@/services/api";

/**
 * Session-level memo of the house overview's ambient signals per author —
 * the score the tier rings read and whether the network has flagged the
 * account. There is no backend batch endpoint (the recorded ask), so this is
 * the discipline every face-bearing surface shares: one request per pubkey
 * per session, concurrent lookups dedupe, and the two hooks that read it
 * (useAuthorScores, useAuthorFlags) never cost a second request between them.
 */
export interface HouseSignals {
  influence: number | null;
  flagged: boolean;
}

const cache = new Map<string, Promise<HouseSignals>>();
const settled = new Map<string, HouseSignals>();

export function lookupHouseSignals(pubkey: string): Promise<HouseSignals> {
  let p = cache.get(pubkey);
  if (!p) {
    p = apiClient
      .getHouseSignals(pubkey)
      .catch((): HouseSignals => ({ influence: null, flagged: false }))
      .then((s) => {
        const v: HouseSignals = {
          influence: typeof s?.influence === "number" && Number.isFinite(s.influence) ? s.influence : null,
          flagged: s?.flagged === true,
        };
        settled.set(pubkey, v);
        return v;
      });
    cache.set(pubkey, p);
  }
  return p;
}

/** What we already know, synchronously; undefined until the lookup lands. */
export function settledHouseSignals(pubkey: string): HouseSignals | undefined {
  return settled.get(pubkey);
}

export function hasSettledHouseSignals(pubkey: string): boolean {
  return settled.has(pubkey);
}

/** Test seam. */
export function __resetHouseSignals(): void {
  cache.clear();
  settled.clear();
}
