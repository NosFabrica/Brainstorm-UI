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
  const status = saleStatus(plan, flash, flashLoaded);
  return (
    <Card className="p-4" data-testid={`billing-plan-${plan.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {policyName}
            </span>
            <Chip tone={status === "for_sale" ? "success" : status === "not_in_flash" ? "warning" : "neutral"} size="sm">
              {status === "for_sale" ? "For sale" : status === "not_in_flash" ? "Not in Flash" : "Withdrawn"}
            </Chip>
          </div>
          {/* What it sells, in Flash's words and price — a mapping is two ids
              nobody can read. When Flash's plan name is the tier's name it is
              said once. A withdrawn mapping says so in grey; only a mapping we
              sell that Flash no longer lists wears the amber line. */}
          {status === "withdrawn" ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid={`billing-plan-flash-${plan.id}`}>
              Withdrawn — not offered on the pricing page.
            </p>
          ) : flash ? (
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200" data-testid={`billing-plan-flash-${plan.id}`}>
              {flash.planName && flash.planName.trim().toLowerCase() !== policyName.trim().toLowerCase() && (
                <span className="font-medium">{flash.planName}{" · "}</span>
              )}
              <span className={flash.planName && flash.planName.trim().toLowerCase() !== policyName.trim().toLowerCase() ? "text-slate-500 dark:text-slate-400" : ""}>
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
 * What a mapping's status actually is. `is_active` is our switch; whether
 * Flash still lists the plan is Flash's. A mapping we sell that Flash no
 * longer lists sells nothing, and must not wear "For sale" — three rows all
 * named "Priority" with the one that sells in the middle was the complaint.
 * Until Flash's list has loaded, our switch is the best word we have.
 */
export type SaleStatus = "for_sale" | "not_in_flash" | "withdrawn";
export function saleStatus(plan: Pick<AdminBillingPlanMapping, "is_active">, flash: BillingPlan | null, flashLoaded: boolean): SaleStatus {
  if (!plan.is_active) return "withdrawn";
  if (flashLoaded && !flash) return "not_in_flash";
  return "for_sale";
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
    <div>
      {/* The card's own header, the User Database's anatomy: the name and its
          one sentence on the left, the action on the right. */}
      <div className="px-3 sm:px-5 py-4 border-b border-brand-accent/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-testid="billing-plans-header">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>Plans on sale</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Which Flash plan buys which tier, and what it costs.{" "}
            <span data-testid="billing-plans-cache-note">
              Prices and copy come from Flash and can take up to ten minutes to update here and on the pricing page.
            </span>
          </p>
        </div>
        <Button size="sm" onClick={openCreate} data-testid="button-new-plan-mapping">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New mapping
        </Button>
      </div>
    <div className="px-3 sm:px-5 py-4 space-y-3">

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
        // What sells first, under its own heading, then what does not — the
        // status is the structure, not something to read off each chip.
        <div className="space-y-4">
          {(
            [
              { key: "selling", label: "Selling now", plans: plans.filter((p) => saleStatus(p, flashByPlanId.get(p.flash_plan_id) ?? null, flashPlansQuery.isSuccess) === "for_sale") },
              { key: "not-selling", label: "Not selling", plans: plans.filter((p) => saleStatus(p, flashByPlanId.get(p.flash_plan_id) ?? null, flashPlansQuery.isSuccess) !== "for_sale") },
            ] as const
          )
            .filter((g) => g.plans.length > 0)
            .map((g) => (
              <div key={g.key} className="space-y-2" data-testid={`billing-plans-group-${g.key}`}>
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {g.label}
                  <Chip tone={g.key === "selling" ? "success" : "neutral"} size="sm">{g.plans.length}</Chip>
                </p>
                {[...g.plans]
                  .sort((a, b) => (policyNames.get(a.scheduling_id) ?? "").localeCompare(policyNames.get(b.scheduling_id) ?? "") || a.id - b.id)
                  .map((plan) => (
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
    </div>
  );
}
