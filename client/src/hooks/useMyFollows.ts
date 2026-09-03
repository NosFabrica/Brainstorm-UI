import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The viewer's own follows, as a set — the local half of every endorsement
 * line ("2 people you follow reviewed this"). It is a fact from their kind-3,
 * not a score, so it applies whenever someone is signed in, whichever
 * Perspective they are looking through. Reads the SAME query useSocialActions
 * writes optimistically, so a fresh follow counts immediately. Signed out:
 * empty and ready.
 */
export function useMyFollows(): { follows: ReadonlySet<string>; ready: boolean; signedIn: boolean } {
  const me = useActiveAccountDisplay()?.pubkey;
  const { data, isPending } = useQuery({
    queryKey: ["nostr-contacts", me],
    queryFn: () => fetchContactList(me!),
    enabled: !!me,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const follows = useMemo(() => (data ? getFollowedPubkeys(data) : EMPTY), [data]);
  return { follows, ready: !me || !isPending, signedIn: !!me };
}
