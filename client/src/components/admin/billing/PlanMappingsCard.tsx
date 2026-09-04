import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/hooks/use-toast";
import {
  apiClient,
  type AdminBillingPlanMapping,
  type CreateAdminBillingPlanBody,
  type SchedulingItem,
  type UpdateAdminBillingPlanBody,
} from "@/services/api";
import { PlanMappingFormDialog } from "./PlanMappingFormDialog";
import { fetchPlans, type BillingPlan } from "@/services/subscription";
import { formatAmount, formatBillingInterval } from "@/lib/plans";

import { PLANS_KEY, POLICIES_KEY } from "./queryKeys";

type DialogState =
  | { mode: "create"; plan?: undefined }
  | { mode: "edit"; plan: AdminBillingPlanMapping };

function PlanRow({
  plan,
  policyName,
  flash,
  flashLoaded,
  onEdit,
}: {
  plan: AdminBillingPlanMapping;
  policyName: string;
  /** Flash's own listing for this mapping's plan id, when it still lists one. */
  flash: BillingPlan | null;
  flashLoaded: boolean;
  onEdit: (plan: AdminBillingPlanMapping) => void;
}) {
  const interval = flash ? formatBillingInterval(flash.billingInterval) : null;
  return (
    <Card className="p-4" data-testid={`billing-plan-${plan.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {policyName}
            </span>
            <Chip tone={plan.is_active ? "success" : "neutral"} size="sm">
              {plan.is_active ? "For sale" : "Withdrawn"}
            </Chip>
          </div>
          {/* What it sells, in Flash's words and price — a mapping is two ids
              nobody can read. A plan Flash no longer lists says so rather than
              showing a stale price. */}
          {flash ? (
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200" data-testid={`billing-plan-flash-${plan.id}`}>
              <span className="font-medium">{flash.planName ?? "Unnamed plan"}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {" · "}
                {formatAmount(flash.amountMinor, flash.currency)}
                {interval ? ` ${interval}` : ""}
              </span>
            </p>
          ) : flashLoaded ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400" data-testid={`billing-plan-flash-${plan.id}`}>
              Not in Flash's current list — nothing to sell until it is.
            </p>
          ) : null}
          <p className="mt-1 font-mono text-[11px] text-slate-400 dark:text-slate-500 break-all">
            service {plan.flash_service_id} · plan {plan.flash_plan_id}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEdit(plan)}
          data-testid={`button-edit-plan-${plan.id}`}
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit
        </Button>
      </div>
    </Card>
  );
}

/**
 * The plan-mapping editor: every mapping, what each one grants, and the only
 * way to correct one without curl.
 *
 * Not gated on any mapping existing. A fresh instance with billing enabled and
 * nothing mapped is exactly when this screen is needed, and an empty list that
 * hides its own "add" button is a dead end.
 */
export function PlanMappingsCard({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: PLANS_KEY,
    queryFn: () => apiClient.getAdminBillingPlanMappings(),
    enabled: active,
  });
  // What each mapping grants. Best-effort: a policy we can't name still lists.
  // Flash's public plans list — names and prices for the ids we map.
  const flashPlansQuery = useQuery<BillingPlan[]>({
    queryKey: ["/billing/plans"],
    queryFn: () => fetchPlans(),
    enabled: active,
    staleTime: 60_000,
    retry: 1,
  });
  const flashByPlanId = new Map((flashPlansQuery.data ?? []).filter((p) => p.planId).map((p) => [p.planId as string, p]));
  const policiesQuery = useQuery<SchedulingItem[]>({
    queryKey: POLICIES_KEY,
    queryFn: () => apiClient.getSchedulingPolicies(),
    enabled: active,
  });

  const plans = plansQuery.data ?? [];
  const policies = policiesQuery.data ?? [];
  const policyNames = new Map(policies.map((p) => [p.id, p.name]));

  function openCreate() {
    setServerError(null);
    setDialog({ mode: "create" });
  }

  function openEdit(plan: AdminBillingPlanMapping) {
    setServerError(null);
    setDialog({ mode: "edit", plan });
  }

  async function handleSubmit(
    body: CreateAdminBillingPlanBody | UpdateAdminBillingPlanBody,
  ) {
    if (!dialog) return;
    // An edit with nothing changed is not a PATCH — it is a no-op, and sending
    // one would write back every field the form is holding.
    if (dialog.mode === "edit" && Object.keys(body).length === 0) {
      setDialog(null);
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      if (dialog.mode === "create") {
        await apiClient.createAdminBillingPlan(body as CreateAdminBillingPlanBody);
      } else {
        await apiClient.updateAdminBillingPlan(dialog.plan.id, body);
      }
      await queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      setDialog(null);
      toast({
        title: dialog.mode === "create" ? "Mapping created" : "Mapping updated",
        description: "The pricing page reflects it now.",
      });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "The server refused the change.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Which Flash plan buys which scheduling policy, and whether we sell it.
          Price, period and copy are read from Flash and shown on the pricing
          page — they are not edited here.{" "}
          <span data-testid="billing-plans-cache-note">
            An edit made in Flash can take up to ten minutes to show here and on the pricing page.
          </span>
        </p>
        <Button size="sm" onClick={openCreate} data-testid="button-new-plan-mapping">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New mapping
        </Button>
      </div>

      {plansQuery.isPending ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plan mappings…
        </div>
      ) : plansQuery.isError ? (
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-plans-error">
          Couldn't load plan mappings.
        </p>
      ) : plans.length === 0 ? (
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-plans-empty">
          No Flash plans are mapped yet, so there is nothing on sale. Add one to
          put a policy up for sale.
        </p>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              policyName={policyNames.get(plan.scheduling_id) ?? `policy ${plan.scheduling_id}`}
              flash={flashByPlanId.get(plan.flash_plan_id) ?? null}
              flashLoaded={flashPlansQuery.isSuccess}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {dialog && (
        <PlanMappingFormDialog
          // Remount per target so the form's fields re-seed from that mapping.
          key={dialog.mode === "edit" ? `edit-${dialog.plan.id}` : "create"}
          open
          mode={dialog.mode}
          initial={dialog.plan}
          policies={policies}
          submitting={submitting}
          serverError={serverError}
          onOpenChange={(o) => !o && setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
