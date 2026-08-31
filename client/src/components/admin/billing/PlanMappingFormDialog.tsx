import { useState } from "react";
import { z } from "zod";
import { AlertTriangle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  AdminBillingPlanMapping,
  CreateAdminBillingPlanBody,
  SchedulingItem,
  UpdateAdminBillingPlanBody,
} from "@/services/api";
import { formatMinor, linesToList, listToLines, sameList } from "./planCopy";

/** The server's caps (`schemas.py`), so an over-long line is refused here first. */
const BLURB_MAX = 280;
const COPY_LINE_MAX = 120;
const COPY_LINES_MAX = 20;

/** Suggestions only — the server takes any unit, and "once" is reserved for one-off charges. */
const PERIOD_UNITS = ["day", "week", "month", "year", "once"];

const copyLines = z
  .array(z.string().min(1).max(COPY_LINE_MAX, `Each line must be ${COPY_LINE_MAX} characters or fewer`))
  .max(COPY_LINES_MAX, `At most ${COPY_LINES_MAX} lines`)
  .nullable();

const schema = z
  .object({
    flash_service_id: z.string().min(1, "Flash service id is required"),
    flash_plan_id: z.string().min(1, "Flash plan id is required"),
    scheduling_id: z.number().int().positive("Choose what this plan grants"),
    amount_minor: z
      .number()
      .int("Amount must be a whole number of minor units")
      .min(0, "Amount cannot be negative"),
    currency: z.string().min(1, "Currency is required"),
    billing_period_unit: z.string().max(32, "Unit is too long").nullable(),
    billing_period_count: z
      .number()
      .int("Period count must be a whole number")
      .min(1, "Period count must be at least 1")
      .nullable(),
    sort_order: z.number().int("Order must be a whole number"),
    blurb: z.string().max(BLURB_MAX, `Blurb must be ${BLURB_MAX} characters or fewer`).nullable(),
    includes: copyLines,
    excludes: copyLines,
    is_active: z.boolean(),
  })
  // Unit and count are formatted as a pair; a count alone would read as "every 2".
  .refine((b) => b.billing_period_count === null || b.billing_period_unit !== null, {
    message: "A period count needs a unit",
    path: ["billing_period_unit"],
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
 * Two rules it exists to enforce. Everything here was typed in by hand from the
 * Flash dashboard and nothing can check it, so all of it stays editable and the
 * form says so rather than implying the server knows it to be right. And an
 * edit sends only the fields that actually changed: a PATCH writes every field
 * it includes, and an untouched form is how a staging scheduling policy ended
 * up named "string" with a zero cadence.
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
    amount_minor: 0,
    currency: "USD",
    billing_period_unit: "month",
    billing_period_count: 1,
    sort_order: 0,
    blurb: null,
    includes: null,
    excludes: null,
    is_active: true,
  };

  const [serviceId, setServiceId] = useState(seed.flash_service_id);
  const [planId, setPlanId] = useState(seed.flash_plan_id);
  const [schedulingId, setSchedulingId] = useState(String(seed.scheduling_id));
  const [amount, setAmount] = useState(String(seed.amount_minor));
  const [currency, setCurrency] = useState(seed.currency);
  const [periodUnit, setPeriodUnit] = useState(seed.billing_period_unit ?? "");
  const [periodCount, setPeriodCount] = useState(
    seed.billing_period_count === null ? "" : String(seed.billing_period_count),
  );
  const [sortOrder, setSortOrder] = useState(String(seed.sort_order));
  const [blurb, setBlurb] = useState(seed.blurb ?? "");
  const [includes, setIncludes] = useState(listToLines(seed.includes));
  const [excludes, setExcludes] = useState(listToLines(seed.excludes));
  const [isActive, setIsActive] = useState(seed.is_active);
  const [errors, setErrors] = useState<Partial<Record<keyof Body, string>>>({});

  /** Empty means "not recorded", which is a real value on these columns — hence null, not 0. */
  function optionalNumber(raw: string): number | null {
    return raw.trim() === "" ? null : Number(raw);
  }

  function buildBody(): Body {
    return {
      flash_service_id: serviceId.trim(),
      flash_plan_id: planId.trim(),
      scheduling_id: Number(schedulingId),
      amount_minor: Number(amount),
      currency: currency.trim().toUpperCase(),
      billing_period_unit: periodUnit.trim() === "" ? null : periodUnit.trim(),
      billing_period_count: optionalNumber(periodCount),
      sort_order: Number(sortOrder),
      blurb: blurb.trim() === "" ? null : blurb.trim(),
      includes: linesToList(includes),
      excludes: linesToList(excludes),
      is_active: isActive,
    };
  }

  /** Only what the admin actually changed. Everything else is left unsent. */
  function changedFields(body: Body): UpdateAdminBillingPlanBody {
    if (!initial) return body;
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(body) as Array<keyof Body>) {
      if (key === "includes" || key === "excludes") {
        if (!sameList(body[key], initial[key])) diff[key] = body[key];
      } else if (body[key] !== initial[key]) {
        diff[key] = body[key];
      }
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
          </DialogDescription>
        </DialogHeader>

        <Alert variant="warning" data-testid="plan-mapping-unverified-notice">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Price, currency and billing period are copied by hand from the Flash
            dashboard. Flash gives us no way to read a plan back, so nothing here
            is verified against anything — if these are wrong, only this form
            makes them right.
          </AlertDescription>
        </Alert>

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
              The policy a subscriber is put on. It is their tier — the pricing
              page shows this policy's name.
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plan-amount">Amount (minor units)</Label>
              <Input
                id="plan-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="input-plan-amount"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="plan-amount-preview">
                = {formatMinor(Number(amount), currency)}
              </p>
              {errors.amount_minor && (
                <p className="mt-1 text-xs text-red-500">{errors.amount_minor}</p>
              )}
            </div>
            <div>
              <Label htmlFor="plan-currency">Currency</Label>
              <Input
                id="plan-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                data-testid="input-plan-currency"
              />
              {errors.currency && (
                <p className="mt-1 text-xs text-red-500">{errors.currency}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plan-period-count">Billed every</Label>
              <Input
                id="plan-period-count"
                type="number"
                value={periodCount}
                onChange={(e) => setPeriodCount(e.target.value)}
                placeholder="1"
                data-testid="input-plan-period-count"
              />
              {errors.billing_period_count && (
                <p className="mt-1 text-xs text-red-500">{errors.billing_period_count}</p>
              )}
            </div>
            <div>
              <Label htmlFor="plan-period-unit">Period unit</Label>
              <Input
                id="plan-period-unit"
                list="plan-period-units"
                value={periodUnit}
                onChange={(e) => setPeriodUnit(e.target.value)}
                placeholder="month"
                data-testid="input-plan-period-unit"
              />
              <datalist id="plan-period-units">
                {PERIOD_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              {errors.billing_period_unit && (
                <p className="mt-1 text-xs text-red-500">{errors.billing_period_unit}</p>
              )}
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
            Leave both blank if the period isn't known. "once" with no count is a
            one-off charge.
          </p>

          <div>
            <Label htmlFor="plan-sort-order">Display order</Label>
            <Input
              id="plan-sort-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              data-testid="input-plan-sort-order"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Lowest first on the pricing page, after the free tier.
            </p>
            {errors.sort_order && (
              <p className="mt-1 text-xs text-red-500">{errors.sort_order}</p>
            )}
          </div>

          <div>
            <Label htmlFor="plan-blurb">Blurb</Label>
            <Textarea
              id="plan-blurb"
              rows={2}
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              data-testid="input-plan-blurb"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Plain text, up to {BLURB_MAX} characters. Anything that looks like
              markup is shown as the characters you typed, not rendered.
            </p>
            {errors.blurb && <p className="mt-1 text-xs text-red-500">{errors.blurb}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plan-includes">Includes (one per line)</Label>
              <Textarea
                id="plan-includes"
                rows={4}
                value={includes}
                onChange={(e) => setIncludes(e.target.value)}
                data-testid="input-plan-includes"
              />
              {errors.includes && <p className="mt-1 text-xs text-red-500">{errors.includes}</p>}
            </div>
            <div>
              <Label htmlFor="plan-excludes">Excludes (one per line)</Label>
              <Textarea
                id="plan-excludes"
                rows={4}
                value={excludes}
                onChange={(e) => setExcludes(e.target.value)}
                data-testid="input-plan-excludes"
              />
              {errors.excludes && <p className="mt-1 text-xs text-red-500">{errors.excludes}</p>}
            </div>
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
            Off withdraws it from the pricing page. Existing subscribers keep
            what they have and keep renewing.
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
