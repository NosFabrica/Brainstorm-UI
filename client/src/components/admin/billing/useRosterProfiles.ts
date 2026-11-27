import { useMemo } from "react";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { bitsOf } from "../useProfileBits";
import { type ProfileBits } from "./rosterShared";

/**
 * Kind-0 enrichment for the roster, same seam the scheduling admin uses
 * (usePolicyMembers): render immediately with npubs, fill names/avatars in
 * as profiles arrive. Best-effort — a relay miss just leaves the npub.
 *
 * From the EventStore (useLiveProfiles, docs/adr/0005): each person is asked
 * for once per window however the list grows, as the report, a page or the
 * attribute picker brings people in.
 */
export function useRosterProfiles(pubkeys: string[]): Map<string, ProfileBits> {
  const key = Array.from(new Set(pubkeys)).sort().join(",");
  const targets = useMemo(() => (key ? key.split(",") : []), [key]);
  const live = useLiveProfiles(targets);
  return useMemo(() => bitsOf(live), [live]);
}
