import { useEffect, useState } from "react";
import { fetchProfileMap } from "@/services/nostr";

export type ProfileBits = { name?: string; picture?: string };

/**
 * Kind-0 enrichment for admin tables: hand it the pubkeys on screen, render
 * immediately with npubs, and names/avatars fill in as profiles arrive.
 * Best-effort — a relay miss just leaves the npub. (Same semantics as the
 * scheduling admin's usePolicyMembers enrichment, extracted for reuse.)
 */
export function useProfileBits(pubkeys: (string | null | undefined)[]): Map<string, ProfileBits> {
  const [profiles, setProfiles] = useState<Map<string, ProfileBits>>(new Map());
  const key = pubkeys.filter((p): p is string => !!p).join(",");
  useEffect(() => {
    const targets = key ? key.split(",") : [];
    if (!targets.length) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await fetchProfileMap(targets);
        if (cancelled) return;
        setProfiles((prev) => {
          const next = new Map(prev);
          for (const pk of targets) {
            const c = map.get(pk);
            if (c) next.set(pk, { name: c.display_name || c.name, picture: c.picture });
          }
          return next;
        });
      } catch {
        /* best-effort — npubs stay */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return profiles;
}
