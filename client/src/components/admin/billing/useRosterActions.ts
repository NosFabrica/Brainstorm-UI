import { useToast } from "@/hooks/use-toast";
import { formatBillingDate } from "@/lib/plans";
import {
  apiClient,
  type AdminBillingSubscription,
  type AdminBillingSubscriptionAction,
  type CreateAdminBillingPlanBody,
  type UnmappedPlanRow,
  type UpdateAdminBillingPlanBody,
} from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DIVERGENCE_KEY, POLICIES_KEY, SUBS_KEY, USERS_KEY, PLANS_KEY } from "./queryKeys";
import { entitlementReasonText } from "./rosterShared";

/**
 * The roster's writes: each runs under its row's handle (busy while it goes),
 * says how it went, and re-reads the roster and the report.
 */
export function useRosterActions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // An unmapped plan's fix is a mapping — the form opens prefilled with Flash's ids.
  const [mappingFor, setMappingFor] = useState<UnmappedPlanRow | null>(null);
  const [mappingSubmitting, setMappingSubmitting] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  // Keyed by whatever handle the row has: a pubkey for a subscriber, a Flash
  // subscription id for a signup that named nobody. A set: two rows' actions
  // can run at once, and one finishing must not clear the other's spinner.
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());

  async function runAction(handle: string, fn: () => Promise<void>, failureTitle = "Action failed") {
    setBusyKeys((prev) => new Set(prev).add(handle));
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: SUBS_KEY });
      await queryClient.invalidateQueries({ queryKey: DIVERGENCE_KEY });
    } catch (e) {
      toast({
        title: failureTitle,
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(handle);
        return next;
      });
    }
  }

  async function handleCreateMapping(body: CreateAdminBillingPlanBody | UpdateAdminBillingPlanBody) {
    setMappingSubmitting(true);
    setMappingError(null);
    try {
      await apiClient.createAdminBillingPlan(body as CreateAdminBillingPlanBody);
      await queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      await queryClient.invalidateQueries({ queryKey: DIVERGENCE_KEY });
      setMappingFor(null);
      toast({
        title: "Mapping created",
        description:
          "The plan now grants that policy. The stuck signup replays on the next sweep — or Resync the subscriber to apply it now.",
      });
    } catch (e) {
      setMappingError(e instanceof Error ? e.message : "The server refused the change.");
    } finally {
      setMappingSubmitting(false);
    }
  }

  const handleResync = (s: AdminBillingSubscription) => handleResyncPubkey(s.pubkey);
  const handleResyncPubkey = (pubkey: string) =>
    runAction(pubkey, async () => {
      const out = await apiClient.resyncAdminBillingSubscription(pubkey);
      toast({
        // `applied: false` is a normal answer, not a failure — say which it was
        // rather than leaving the admin to guess from an unchanged row.
        title: out.applied ? "Re-applied from Flash" : "Nothing changed",
        description: entitlementReasonText(out.reason),
      });
    });

  // Drops an admin's override. The server re-reads billing before it answers,
  // so the toast names where they landed — a paying subscriber stays on what
  // they pay for — rather than assuming the default.
  const handleResetPubkey = (pubkey: string) =>
    runAction(
      pubkey,
      async () => {
        const out = await apiClient.clearUserSchedulingOverride(pubkey);
        toast({
          title: "Reset to default",
          description: `Now on ${out.scheduling_name}. Billing decides their tier from here.`,
        });
        // The Users tab and the policies' member lists show the tier too.
        await queryClient.invalidateQueries({ queryKey: USERS_KEY });
        await queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
      },
      "Couldn't reset to default",
    );

  const handleSetBlock = (s: AdminBillingSubscription, blocked: boolean) =>
    runAction(s.pubkey, async () => {
      const out = await apiClient.setAdminBillingBlock(s.pubkey, blocked);
      toast({
        title: blocked ? "Billing blocked" : "Billing unblocked",
        description: blocked
          ? out.revoked
            ? "Their billing-granted tier was taken back. Flash is still charging them — cancel or refund there."
            : "No billing-granted tier to take back. Flash is still charging them — cancel or refund there."
          : "They can be granted again. The next Flash event or a resync applies it.",
      });
    });

  /** Reads `cancellation_scheduled`, never the status — see the type's note. */
  function cancelOutcomeToast(out: AdminBillingSubscriptionAction) {
    if (!out.cancellation_scheduled) {
      toast({
        title: "Nothing was scheduled",
        description:
          "Flash accepted the request but reports no cancellation on this subscription. Check Flash's record before trying again.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: out.cancel_effective_date ? "Cancellation scheduled" : "Subscription cancelled",
      description:
        (out.cancel_effective_date
          ? `Flash still reports them "${out.flash_status}" until it takes effect on ${formatBillingDate(out.cancel_effective_date)} — that is what end-of-period cancellation looks like, not a failure. They keep their tier until then. `
          : "Flash ended it immediately. ") + tierNote(out),
    });
  }

  /**
   * What happened to their tier, which is a separate question from what
   * happened in Flash. `reread_failed` means the write landed and the re-read
   * that follows it did not — saying nothing would leave an operator believing
   * the roster is current when it is a step behind.
   */
  function tierNote(out: AdminBillingSubscriptionAction): string {
    if (out.reason === "reread_failed")
      return "We couldn't re-read them from Flash afterwards, so their tier and the roster are a step behind — resync when Flash is back.";
    return out.applied
      ? "Their tier has been re-read from Flash and updated."
      : "Their tier was left as it was — the roster shows why.";
  }

  const handleCancel = (s: AdminBillingSubscription, reason: string) =>
    runAction(s.pubkey, async () => {
      cancelOutcomeToast(await apiClient.cancelAdminBillingSubscription(s.pubkey, reason));
    });

  const handleSetStatus = (s: AdminBillingSubscription, status: "paused" | "active") =>
    runAction(s.pubkey, async () => {
      const out = await apiClient.setAdminBillingSubscriptionStatus(s.pubkey, status);
      toast({
        title: status === "paused" ? "Subscription paused" : "Subscription resumed",
        description: `Flash reports them "${out.flash_status}". ${tierNote(out)}`,
      });
    });

  /**
   * Attributing can legitimately grant nothing — a blocked user, a
   * subscription that has already lapsed. That is an answer, not a failure, so
   * it is reported as one, with the server's own reason for it.
   */
  // How many stored deliveries a settlement actually closed — the server says,
  // and when it is more than one the admin should hear it (a signup started and
  // then cancelled is two deliveries; one still inside its retry budget was
  // never even listed).
  const settledNote = (n: number | undefined) =>
    typeof n === "number" && n > 1 ? ` ${n} deliveries were settled.` : "";
  const handleAttribute = (subscriptionId: string, pubkey: string) =>
    runAction(
      subscriptionId,
      async () => {
        const out = await apiClient.attributeAdminBillingUnresolved(subscriptionId, pubkey);
        toast({
          title: out.applied ? "Signup attributed" : "Attributed, but nothing was granted",
          description:
            (out.applied
              ? "It now belongs to them and the plan's tier is applied — they're in the roster above."
              : `${out.entitlement_reason ? entitlementReasonText(out.entitlement_reason) : "No tier was applied."} The signup is settled either way, so it leaves this report.`) +
            settledNote(out.events_settled),
        });
      },
      "Nothing was changed",
    );

  const handleDismiss = (subscriptionId: string) =>
    runAction(
      subscriptionId,
      async () => {
        const out = await apiClient.dismissAdminBillingUnresolved(subscriptionId);
        toast({
          title: "Signup dismissed",
          description:
            "Written off as nobody's — nothing was granted and this leaves the report. Flash still holds the payment; cancel or refund there if it needs it." +
            settledNote(out.events_settled),
        });
      },
      "Nothing was changed",
    );

  return {
    mappingFor,
    setMappingFor,
    mappingSubmitting,
    mappingError,
    setMappingError,
    busyKeys,
    handleCreateMapping,
    handleResync,
    handleResyncPubkey,
    handleResetPubkey,
    handleSetBlock,
    handleCancel,
    handleSetStatus,
    handleAttribute,
    handleDismiss,
  };
}
