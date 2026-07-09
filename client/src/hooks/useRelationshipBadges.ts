import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSocialActions } from "@/hooks/useSocialActions";
import {
  fetchContactList,
  getFollowedPubkeys,
  fetchMyReport,
  type MyReport,
} from "@/services/socialActions";

export interface RelationshipBadges {
  /** Logged in, target resolved, and not the viewer's own profile. */
  enabled: boolean;
  /** The viewer follows the target (their kind-3 contact list). */
  isFollowing: boolean;
  /** The viewer has muted the target (their kind-10000 mute list). */
  isMuted: boolean;
  /** The target follows the viewer back (target's kind-3 contains my pubkey). */
  followsYou: boolean;
  /** The viewer's own NIP-56 report on the target, or null. */
  report: MyReport | null;
  /** Relationship signals still resolving — hide badges to avoid flicker. */
  loading: boolean;
}

/**
 * Read-only relationship state between the logged-in viewer and `targetPubkey`:
 * do I follow / mute / report them, and do they follow me. Powers the at-a-glance
 * badges on the public /p page (actions themselves stay on /profile/).
 *
 * Query keys deliberately match ProfilePage's inline queries
 * (["they-follow-me", …] / ["my-report", …]) so /p ↔ /profile share one cache.
 */
export function useRelationshipBadges(targetPubkey: string | undefined): RelationshipBadges {
  const [currentUser] = useCurrentUser();
  const myPubkey = currentUser?.pubkey;
  const social = useSocialActions(myPubkey);

  const enabled = !!myPubkey && !!targetPubkey && myPubkey !== targetPubkey;

  const followsYouQuery = useQuery({
    queryKey: ["they-follow-me", myPubkey, targetPubkey],
    queryFn: async () => getFollowedPubkeys(await fetchContactList(targetPubkey!)).has(myPubkey!),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const myReportQuery = useQuery({
    queryKey: ["my-report", myPubkey, targetPubkey],
    queryFn: () => fetchMyReport(targetPubkey!),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    enabled,
    isFollowing: enabled && social.isFollowing(targetPubkey!),
    isMuted: enabled && social.isMuted(targetPubkey!),
    followsYou: followsYouQuery.data === true,
    report: myReportQuery.data ?? null,
    loading: enabled && (social.listsLoading || followsYouQuery.isLoading),
  };
}
