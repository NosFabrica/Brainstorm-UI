import { useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  AdminBillingPlanMapping,
  CreateAdminBillingPlanBody,
  SchedulingItem,
  UpdateAdminBillingPlanBody,
} from "@/services/api";

const schema = z.object({
  flash_service_id: z.string().min(1, "Flash service id is required"),
  flash_plan_id: z.string().min(1, "Flash plan id is required"),
  scheduling_id: z.number().int().positive("Choose what this plan grants"),
  is_active: z.boolean(),
});

type Body = z.infer<typeof schema>;

export interface PlanMappingFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initial?: AdminBillingPlanMapping;
  policies: SchedulingItem[];
  submitting?: boolean;
  /** The server's word when it refuses — including the 409 that names the way out. */
  serverError?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    body: CreateAdminBillingPlanBody | UpdateAdminBillingPlanBody,
  ) => void | Promise<void>;
}

/**
 * The form for one Flash plan → entitlement mapping.
 *
 * Two decisions, because two decisions is all a mapping is: which scheduling
 * policy buying this plan grants, and whether we sell it. Price, currency,
 * period, ordering and copy used to be here — transcribed by hand, unverified
 * by anything, and wrong on staging for weeks. They are read from Flash now,
 * and a field that only edits a copy of somebody else's answer is worse than
 * no field: it implies the edit will be honoured.
 *
 * An edit still sends only what actually changed. A PATCH writes every field it
 * includes, and an untouched form is how a staging scheduling policy ended up
 * named "string" with a zero cadence.
 */
export function PlanMappingFormDialog({
  open,
  mode,
  initial,
  policies,
  submitting,
  serverError,
  onOpenChange,
  onSubmit,
}: PlanMappingFormDialogProps) {
  const seed: Omit<AdminBillingPlanMapping, "id"> = initial ?? {
    flash_service_id: "",
    flash_plan_id: "",
    scheduling_id: policies[0]?.id ?? 0,
    is_active: true,
  };

  const [serviceId, setServiceId] = useState(seed.flash_service_id);
  const [planId, setPlanId] = useState(seed.flash_plan_id);
  const [schedulingId, setSchedulingId] = useState(String(seed.scheduling_id));
  const [isActive, setIsActive] = useState(seed.is_active);
  const [errors, setErrors] = useState<Partial<Record<keyof Body, string>>>({});

  function buildBody(): Body {
    return {
      flash_service_id: serviceId.trim(),
      flash_plan_id: planId.trim(),
      scheduling_id: Number(schedulingId),
      is_active: isActive,
    };
  }

  /** Only what the admin actually changed. Everything else is left unsent. */
  function changedFields(body: Body): UpdateAdminBillingPlanBody {
    if (!initial) return body;
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(body) as Array<keyof Body>) {
      if (body[key] !== initial[key]) diff[key] = body[key];
    }
    return diff as UpdateAdminBillingPlanBody;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(buildBody());
    if (!parsed.success) {
      const next: Partial<Record<keyof Body, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Body;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(mode === "edit" ? changedFields(parsed.data) : parsed.data);
  }

  const grantsNonPublic =
    policies.find((p) => String(p.id) === schedulingId)?.is_public === false;

  const reidentifying =
    mode === "edit" &&
    !!initial &&
    (serviceId.trim() !== initial.flash_service_id || planId.trim() !== initial.flash_plan_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        data-testid="dialog-plan-mapping-form"
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New plan mapping" : "Edit plan mapping"}
          </DialogTitle>
          <DialogDescription>
            Which Flash plan this is, and which scheduling policy buying it grants.
            Price, period and copy come from Flash.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plan-service-id">Flash service id</Label>
              <Input
                id="plan-service-id"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                data-testid="input-plan-service-id"
              />
              {errors.flash_service_id && (
                <p className="mt-1 text-xs text-red-500">{errors.flash_service_id}</p>
              )}
            </div>
            <div>
              <Label htmlFor="plan-plan-id">Flash plan id</Label>
              <Input
                id="plan-plan-id"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                data-testid="input-plan-plan-id"
              />
              {errors.flash_plan_id && (
                <p className="mt-1 text-xs text-red-500">{errors.flash_plan_id}</p>
              )}
            </div>
          </div>
          {reidentifying && (
            <p className="text-xs text-amber-500" data-testid="plan-mapping-reidentify-warning">
              Changing the Flash ids re-points this mapping at a different plan.
              It is allowed only while nobody has bought it — once someone has,
              the server refuses, because it would retroactively change what
              they bought.
            </p>
          )}

          <div>
            <Label htmlFor="plan-scheduling">Grants</Label>
            <select
              id="plan-scheduling"
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
              value={schedulingId}
              onChange={(e) => setSchedulingId(e.target.value)}
              data-testid="select-plan-scheduling"
            >
              {policies.length === 0 && <option value="0">No scheduling policies yet</option>}
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_public === false ? " (not public)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The policy a subscriber is put on. It is their tier, and the
              cadence the pricing page quotes.
            </p>
            {grantsNonPublic && (
              <p className="mt-1 text-xs text-amber-500" data-testid="plan-mapping-nonpublic-warning">
                This policy isn't public, so the plan won't appear on the pricing
                page however it is priced. Make the policy public on the
                Scheduling tab first.
              </p>
            )}
            {errors.scheduling_id && (
              <p className="mt-1 text-xs text-red-500">{errors.scheduling_id}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="plan-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              data-testid="checkbox-plan-active"
            />
            <Label htmlFor="plan-active">For sale</Label>
          </div>
          <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
            Ours, not Flash's: their plan status says whether they offer it, this
            says whether we sell it. Off withdraws it from the pricing page;
            existing subscribers keep what they have and keep renewing.
          </p>

          {serverError && (
            <Alert variant="destructive" data-testid="plan-mapping-server-error">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-plan-mapping-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} data-testid="button-plan-mapping-submit">
              {mode === "create" ? "Create mapping" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
