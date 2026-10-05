import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  askLists,
  designationFor,
  designationKey,
  listsAskKey,
  listsFilter,
  listsStatusOf,
  type UserLists,
} from "@/services/trustLists";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useTrustProviderList } from "@/hooks/useTrustProviderStatus";

/**
 * Whether the user has Trusted Lists their 10040 doesn't point to yet — the
 * onboarding flow asks them to publish their Treasure Map again when it's
 * "missing". Only once they have an assistant (`taPubkey`).
 *
 * The designation (/setup) is HTTP; the 10040 and the lists come from the store,
 * so a 10040 that now names them reads "declared" the moment it is published.
 */
export function useTrustListsStatus(
  pubkey: string | null | undefined,
  taPubkey: string | null | undefined,
): { data: UserLists | undefined } {
  const enabled = !!pubkey && !!taPubkey;
  const designation = useQuery({
    queryKey: designationKey(pubkey ?? "", taPubkey ?? ""),
    queryFn: () => designationFor(pubkey!, taPubkey!),
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
  const d = designation.data ?? null;
  const declaration = useTrustProviderList(enabled ? pubkey : null);
  const filters = useMemo(() => (d ? [listsFilter(d)] : null), [d]);
  const lists = useStoreEvents(d ? listsAskKey(d) : null, filters, () => askLists(d!));

  if (!enabled || designation.isPending) return { data: undefined };
  if (!d) return { data: { status: "none", designation: null } };
  if (!declaration.event && !declaration.settled) return { data: undefined };
  const status = listsStatusOf(declaration.event, d, lists.events);
  // "declared" needs only the 10040; anything else waits for the lists ask.
  if (status !== "declared" && !lists.settled) return { data: undefined };
  return { data: { status, designation: d } };
}
