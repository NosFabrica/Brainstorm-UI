import { useEffect, useState } from "react";
import { fetchPersonEndorsements, type PersonEndorsements } from "@/services/endorsements";

/**
 * A person's "Followed by …" line for a component — one server call per
 * person and Perspective per session, shared by every card and panel that
 * asks (the useAppEndorsements discipline). Pass `null` to ask for nothing.
 */
const cache = new Map<string, Promise<PersonEndorsements>>();
const settled = new Map<string, PersonEndorsements>();

function lookup(pubkey: string, personal: boolean): Promise<PersonEndorsements> {
  const key = `${pubkey}|${personal ? "me" : "house"}`;
  let p = cache.get(key);
  if (!p) {
    p = fetchPersonEndorsements(pubkey, { personal }).then((e) => {
      settled.set(key, e);
      return e;
    });
    cache.set(key, p);
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
  return key ? settled.get(key) ?? null : null;
}

/** After the viewer writes or removes a review: forget what we held about this
 *  person so the next surface that asks refetches (both Perspectives). */
export function forgetPersonEndorsements(pubkey: string): void {
  for (const suffix of ["me", "house"]) {
    cache.delete(`${pubkey}|${suffix}`);
    settled.delete(`${pubkey}|${suffix}`);
  }
}

/** Test seam. */
export function __resetPersonEndorsementsCache(): void {
  cache.clear();
  settled.clear();
}
