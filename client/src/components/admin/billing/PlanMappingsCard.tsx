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
import { formatMinor, formatPeriod } from "./planCopy";
import { PlanMappingFormDialog } from "./PlanMappingFormDialog";

const PLANS_KEY = ["/api/admin/billing/plans"];
const POLICIES_KEY = ["/api/admin/scheduling"];

type DialogState =
  | { mode: "create"; plan?: undefined }
  | { mode: "edit"; plan: AdminBillingPlanMapping };

/**
 * Plan copy, exactly as it was typed.
 *
 * React escapes these, and that is the point: an admin who types `<b>` gets
 * `<b>` on the pricing page. Nothing here reaches for dangerouslySetInnerHTML —
 * stored markup on a public page is stored XSS.
 */
function CopyLines({
  label,
  lines,
  testId,
}: {
  label: string;
  lines: string[] | null;
  testId: string;
}) {
  if (!lines?.length) return null;
  return (
    <div data-testid={testId}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <ul className="mt-0.5 space-y-0.5">
        {lines.map((line, i) => (
          <li key={i} className="text-xs text-slate-600 dark:text-slate-300">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanRow({
  plan,
  policyName,
  onEdit,
}: {
  plan: AdminBillingPlanMapping;
  policyName: string;
  onEdit: (plan: AdminBillingPlanMapping) => void;
}) {
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
            <Chip tone="slate" size="sm">
              order {plan.sort_order}
            </Chip>
          </div>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
            {formatMinor(plan.amount_minor, plan.currency)}{" "}
            <span className="text-slate-500 dark:text-slate-400">
              · {formatPeriod(plan.billing_period_unit, plan.billing_period_count)}
            </span>
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400 break-all">
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
      {(plan.blurb || plan.includes?.length || plan.excludes?.length) && (
        <div className="mt-3 space-y-2 border-t border-brand-accent/10 pt-3">
          {plan.blurb && (
            <p className="text-xs text-slate-600 dark:text-slate-300" data-testid={`billing-plan-blurb-${plan.id}`}>
              {plan.blurb}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CopyLines label="Includes" lines={plan.includes} testId={`billing-plan-includes-${plan.id}`} />
            <CopyLines label="Excludes" lines={plan.excludes} testId={`billing-plan-excludes-${plan.id}`} />
          </div>
        </div>
      )}
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
          Which Flash plan buys which scheduling policy. Price, currency and
          period are transcribed from the Flash dashboard — nothing verifies
          them, so this form is the only way to correct one.
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
