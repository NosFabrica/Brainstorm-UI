import { useMemo } from "react";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import type { NetworkReach } from "@/lib/clientFilters";

/**
 * The people the viewer follows — the set behind the `reach:follows` filter,
 * read from their own kind-3. Signed out there is no "you": empty and ready.
 */
const EMPTY: NetworkReach = { direct: new Set(), ready: true };

export function useNetworkReach(pubkey?: string | null): NetworkReach {
  const contacts = useStoreReplaceable(3, pubkey, () => fetchContactList(pubkey!).catch(() => null));
  const direct = useMemo(() => getFollowedPubkeys((contacts.event as never) ?? null), [contacts.event]);
  if (!pubkey) return EMPTY;
  return contacts.settled ? { direct, ready: true } : { direct: new Set(), ready: false };
}
