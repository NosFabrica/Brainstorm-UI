import { useEffect, useState } from "react";
import { fetchPersonEndorsements, type PersonEndorsements } from "@/services/endorsements";
import { onAccountChange } from "@/lib/accountScoped";
import { capMap } from "@/lib/boundedMap";

/**
 * A person's "Followed by …" line for a component — one server call per
 * person and Perspective per session, shared by every card and panel that
 * asks (the useAppEndorsements discipline). Pass `null` to ask for nothing.
 *
 * "me" is the Active Account's network, so both maps are forgotten when the
 * Active Account changes (lib/accountScoped), and an answer still in flight
 * for the previous one is not kept. Capped, oldest first, for a tab left open.
 */
const cache = new Map<string, Promise<PersonEndorsements>>();
const settled = new Map<string, PersonEndorsements>();
const MAX_PEOPLE = 1000;
/** Bumped on each reset, so an answer for the previous viewer is not kept. */
let generation = 0;

function lookup(pubkey: string, personal: boolean): Promise<PersonEndorsements> {
  const key = `${pubkey}|${personal ? "me" : "house"}`;
  let p = cache.get(key);
  if (!p) {
    const asked = generation;
    p = fetchPersonEndorsements(pubkey, { personal }).then((e) => {
      if (asked === generation) {
        settled.set(key, e);
        capMap(settled, MAX_PEOPLE);
      }
      return e;
    });
    cache.set(key, p);
    capMap(cache, MAX_PEOPLE);
  }
  return p;
}

export function usePersonEndorsements(pubkey: string | null, personal: boolean): PersonEndorsements | null {
  const key = pubkey ? `${pubkey}|${personal ? "me" : "house"}` : null;
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!pubkey || !key || settled.has(key)) return;
    let alive = true;
    void lookup(pubkey, personal).then(() => {
      if (alive) setVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [key, pubkey, personal]);
  return key ? (settled.get(key) ?? null) : null;
}

/** After the viewer writes or removes a review: forget what we held about this
 *  person so the next surface that asks refetches (both Perspectives). */
export function forgetPersonEndorsements(pubkey: string): void {
  for (const suffix of ["me", "house"]) {
    cache.delete(`${pubkey}|${suffix}`);
    settled.delete(`${pubkey}|${suffix}`);
  }
}

/** Forget everything (another viewer); also the test seam. */
export function __resetPersonEndorsementsCache(): void {
  generation++;
  cache.clear();
  settled.clear();
}

onAccountChange(__resetPersonEndorsementsCache);
