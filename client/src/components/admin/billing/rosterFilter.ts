import { type AdminBillingSubscription } from "@/services/api";
import { type SortState, type ProfileBits, shortNpub } from "./rosterShared";

/** Search matches who they are (name/npub/pubkey) or what they're granted; filters are exact. */
export function filterAndSort(
  items: AdminBillingSubscription[],
  profiles: Map<string, ProfileBits>,
  search: string,
  statusFilter: string,
  sourceFilter: string,
  serviceFilter: string,
  /** Flash service per subscriber: undefined while the record is still loading, null when Flash has none. */
  serviceOf: Map<string, string | null | undefined>,
  serviceLabelOf: (serviceId: string | null | undefined) => string,
  sort: SortState,
): AdminBillingSubscription[] {
  const q = search.trim().toLowerCase();
  let out = items.filter((s) => {
    if (statusFilter !== "all" && s.flash_status !== statusFilter) return false;
    if (sourceFilter !== "all" && s.scheduling_source !== sourceFilter) return false;
    // A row whose service is unknown is not known to be on the chosen one.
    if (serviceFilter !== "all" && serviceOf.get(s.pubkey) !== serviceFilter) return false;
    if (!q) return true;
    const name = profiles.get(s.pubkey)?.name?.toLowerCase() ?? "";
    const scheduling = (s.granted_scheduling_name ?? s.scheduling_name ?? "").toLowerCase();
    return (
      name.includes(q) ||
      shortNpub(s.pubkey).full.toLowerCase().includes(q) ||
      s.pubkey.toLowerCase().includes(q) ||
      scheduling.includes(q) ||
      serviceLabelOf(serviceOf.get(s.pubkey)).toLowerCase().includes(q)
    );
  });
  if (sort) {
    const value = (s: AdminBillingSubscription): string => {
      switch (sort.key) {
        case "subscriber":
          return (profiles.get(s.pubkey)?.name ?? shortNpub(s.pubkey).full).toLowerCase();
        case "status":
          return s.flash_status;
        case "service":
          return serviceLabelOf(serviceOf.get(s.pubkey)).toLowerCase();
        case "scheduling":
          return (s.granted_scheduling_name ?? s.scheduling_name ?? "").toLowerCase();
        case "source":
          return s.scheduling_source;
        // ISO timestamps sort correctly as strings; a missing date ("") sinks
        // to the bottom whichever way the column sorts (`missingLast` below).
        case "period":
          return s.current_period_end ?? "";
        case "nextbill":
          return s.next_billing_date ?? "";
        case "synced":
          return s.last_synced_at ?? "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    const missingLast = sort.key === "period" || sort.key === "nextbill" || sort.key === "synced";
    out = [...out].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (missingLast && !va !== !vb) return va ? -1 : 1;
      return va.localeCompare(vb) * dir;
    });
  }
  return out;
}
