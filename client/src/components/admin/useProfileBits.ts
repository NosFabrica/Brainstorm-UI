import { useMemo } from "react";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { nameIn } from "@/lib/displayName";

export type ProfileBits = { name?: string; picture?: string };

/**
 * Kind-0 enrichment for admin tables: hand it the pubkeys on screen, render
 * immediately with npubs, and names/avatars fill in as profiles arrive.
 * Best-effort — a relay miss just leaves the npub. From the EventStore
 * (useLiveProfiles, docs/adr/0005), which asks each person once per window.
 */
export function useProfileBits(pubkeys: (string | null | undefined)[]): Map<string, ProfileBits> {
  const key = pubkeys.filter((p): p is string => !!p).join(",");
  const targets = useMemo(() => (key ? key.split(",") : []), [key]);
  const live = useLiveProfiles(targets);
  return useMemo(() => bitsOf(live), [live]);
}

/** Name and picture of each profile the store holds. */
export function bitsOf(profiles: ReadonlyMap<string, { name?: string; display_name?: string; picture?: string }>) {
  const out = new Map<string, ProfileBits>();
  for (const [pk, c] of profiles) out.set(pk, { name: nameIn(c), picture: c.picture });
  return out;
}
