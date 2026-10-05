import { useMemo } from "react";
import {
  fetchContactList,
  fetchMyReport,
  getFollowedPubkeys,
  myReportFrom,
  type MyReport,
} from "@/services/socialActions";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";

/** Whether `target`'s own contact list includes `me`, live from the store. */
export function useTheyFollowMe(me: string | undefined, target: string | undefined) {
  const enabled = !!me && !!target && me !== target;
  const contacts = useStoreReplaceable(3, enabled ? target : null, () => fetchContactList(target!));
  const followsMe = useMemo(
    () => !!contacts.event && getFollowedPubkeys(contacts.event as never).has(me!),
    [contacts.event, me],
  );
  return { followsMe, loading: contacts.loading };
}

/**
 * My own report on `target`, live from the store: a report I publish shows at
 * once (it lands in the store), and an unreport's deletion removes it.
 */
export function useMyReport(me: string | undefined, target: string | undefined): MyReport | null {
  const enabled = !!me && !!target && me !== target;
  const filters = useMemo(
    () => (enabled ? [{ kinds: [1984], authors: [me!], "#p": [target!] }] : null),
    [enabled, me, target],
  );
  const reports = useStoreEvents(
    enabled ? `my-report:${me}:${target}` : null,
    filters,
    // Fills the store; the report is read back from it.
    async () => void (await fetchMyReport(target!)),
  );
  return useMemo(() => (enabled ? myReportFrom(reports.events, target!) : null), [enabled, reports.events, target]);
}
