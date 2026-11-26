import type { AdminBillingDivergenceReport, AdminBillingSubscription } from "@/services/api";
import { DIVERGENCE_META, groupSignups, type SignupHandle } from "./divergenceSections";

/**
 * The tab's numbers. Entitled = active or trial; ending = a cancellation is
 * scheduled but the paid period still runs; faults = the fault tier's counts
 * (the record tier is for knowing, not a number to worry about).
 */
export function rosterStats(
  items: readonly AdminBillingSubscription[],
  divergence: AdminBillingDivergenceReport,
  /** The signups' Flash ids by event id (subscriptionIdsByEventId). */
  handlesByEventId: ReadonlyMap<number, SignupHandle>,
) {
  return {
    active: items.filter((x) => x.flash_status === "active" || x.flash_status === "trial").length,
    past_due: items.filter((x) => x.flash_status === "past_due").length,
    pending: items.filter((x) => x.flash_status === "pending").length,
    ending: items.filter(
      (x) => !!x.cancel_effective_date && (x.flash_status === "active" || x.flash_status === "trial"),
    ).length,
    // Fault-tier counts, minus the exhausted events that are the same signups
    // already counted above — the sections overlap on purpose; the tile mustn't.
    faults:
      Object.entries(divergence).reduce(
        (n, [kind, section]) =>
          n +
          (section && kind in DIVERGENCE_META && DIVERGENCE_META[kind as keyof typeof DIVERGENCE_META].tier === "fault"
            ? section.count
            : 0),
        0,
      ) -
      (divergence.exhausted_events?.rows ?? []).filter(
        (r) => typeof (r as { id?: unknown }).id === "number" && handlesByEventId.has((r as { id: number }).id),
      ).length,
  };
}

/** The deliveries the report lists for a signup being dismissed — a floor for the dialog's count. */
export function dismissDeliveryCount(divergence: AdminBillingDivergenceReport, subscriptionId: string | null): number {
  return subscriptionId
    ? (groupSignups(divergence.unresolved_signups?.rows ?? []).find((g) => g.subscriptionId === subscriptionId)
        ?.deliveries.length ?? 1)
    : 1;
}
