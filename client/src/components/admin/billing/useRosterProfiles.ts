import { fetchProfileMap } from "@/services/nostr";
import { useEffect, useRef, useState } from "react";
import { type ProfileBits } from "./rosterShared";
import { nameIn } from "@/lib/displayName";

/**
 * Kind-0 enrichment for the roster, same seam the scheduling admin uses
 * (usePolicyMembers): render immediately with npubs, fill names/avatars in
 * as profiles arrive. Best-effort — a relay miss just leaves the npub.
 *
 * Each person is asked for once: the list grows as the report, a page or the
 * attribute picker brings people in, and re-asking everyone already shown on
 * every such change fetched the whole roster again.
 */
export function useRosterProfiles(pubkeys: string[]): Map<string, ProfileBits> {
  const [profiles, setProfiles] = useState<Map<string, ProfileBits>>(new Map());
  const asked = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const key = Array.from(new Set(pubkeys)).sort().join(",");
  useEffect(() => {
    const targets = (key ? key.split(",") : []).filter((pk) => !asked.current.has(pk));
    if (!targets.length) return;
    for (const pk of targets) asked.current.add(pk);
    (async () => {
      try {
        const map = await fetchProfileMap(targets);
        // Not dropped when the list changes meanwhile: these people were asked
        // for once and only once, so their answer is the one there will be.
        if (!alive.current) return;
        setProfiles((prev) => {
          const next = new Map(prev);
          for (const pk of targets) {
            const c = map.get(pk);
            if (c) next.set(pk, { name: nameIn(c), picture: c.picture });
          }
          return next;
        });
      } catch {
        /* best-effort — npubs stay */
      }
    })();
  }, [key]);
  return profiles;
}
