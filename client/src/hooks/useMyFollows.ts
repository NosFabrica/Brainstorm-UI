import { useMemo } from "react";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { applyEdits, useListEdits } from "@/lib/listEdits";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * The viewer's own follows, as a set — the local half of every endorsement
 * line ("2 people you follow reviewed this"). It is a fact from their kind-3,
 * not a score, so it applies whenever someone is signed in, whichever
 * Perspective they are looking through. Applies the same pending edits
 * useSocialActions makes, so a fresh follow counts immediately. Signed out:
 * empty and ready.
 */
export function useMyFollows(): { follows: ReadonlySet<string>; ready: boolean; signedIn: boolean } {
  const me = useActiveAccountDisplay()?.pubkey;
  const contacts = useStoreReplaceable(3, me, () => fetchContactList(me!));
  const edits = useListEdits(3, me);
  const follows = useMemo(
    () => (contacts.event || edits.add.size ? applyEdits(getFollowedPubkeys(contacts.event ?? null), edits) : EMPTY),
    [contacts.event, edits],
  );
  return { follows, ready: !me || !contacts.loading, signedIn: !!me };
}
