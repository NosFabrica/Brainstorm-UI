import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount, formatBillingInterval } from "@/lib/plans";
import { apiClient, type FlashPlanItem } from "@/services/api";

export const FLASH_SERVICES_KEY = ["admin-billing-flash-services"] as const;
export const flashPlansKey = (serviceId: string) => ["admin-billing-flash-plans", serviceId] as const;

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30 disabled:opacity-60";

/** "Priority · $2.00 per month", the way the pricing page will say it. */
export function flashPlanLabel(p: FlashPlanItem): string {
  const price = typeof p.amount_minor === "number" ? formatAmount(p.amount_minor, p.currency) : null;
  const interval = formatBillingInterval(p.billing_interval);
  return [p.name, price ? `${price}${interval ? ` ${interval}` : ""}` : null].filter(Boolean).join(" · ");
}

/**
 * Which Flash plan a mapping names — chosen from Flash's own list, read live
 * through the server, so a mapping can no longer be mistyped. The service
 * selects itself when the account has only one; a plan already claimed by
 * another mapping, or one Flash no longer offers, is still listed but says so.
 *
 * When Flash's list cannot be read the picker degrades to the two id fields
 * it replaced, with the reason beside them — an admin holding ids from the
 * Flash dashboard is never locked out by an outage.
 */
export function FlashPlanPicker({
  serviceId,
  planId,
  ownPlanId,
  onChange,
  errors,
}: {
  serviceId: string;
  planId: string;
  /** The plan this mapping already claims (an edit), which is never "taken". */
  ownPlanId?: string;
  onChange: (next: { serviceId: string; planId: string }) => void;
  errors?: { service?: string; plan?: string };
}) {
  const services = useQuery({
    queryKey: FLASH_SERVICES_KEY,
    queryFn: () => apiClient.getAdminBillingFlashServices(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const plans = useQuery({
    queryKey: flashPlansKey(serviceId),
    queryFn: () => apiClient.getAdminBillingFlashServicePlans(serviceId),
    enabled: services.isSuccess && !!serviceId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // One service on the account: nothing to choose, so choose it.
  const soleService = services.data?.length === 1 ? services.data[0] : null;
  useEffect(() => {
    if (!serviceId && soleService) onChange({ serviceId: soleService.id, planId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, soleService?.id]);

  if (services.isError) {
    const reason = (services.error as Error)?.message ?? "";
    return (
      <div className="space-y-3">
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="plan-picker-fallback">
          Flash's plan list couldn't be read{reason ? ` (${reason})` : ""}, so paste the ids from the Flash dashboard.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="plan-service-id">Flash service id</Label>
            <Input
              id="plan-service-id"
              value={serviceId}
              onChange={(e) => onChange({ serviceId: e.target.value, planId })}
              className="font-mono text-xs"
              data-testid="input-plan-service-id"
            />
            {errors?.service && <p className="mt-1 text-xs text-red-500">{errors.service}</p>}
          </div>
          <div>
            <Label htmlFor="plan-plan-id">Flash plan id</Label>
            <Input
              id="plan-plan-id"
              value={planId}
              onChange={(e) => onChange({ serviceId, planId: e.target.value })}
              className="font-mono text-xs"
              data-testid="input-plan-plan-id"
            />
            {errors?.plan && <p className="mt-1 text-xs text-red-500">{errors.plan}</p>}
          </div>
        </div>
      </div>
    );
  }

  const serviceList = services.data ?? [];
  const serviceKnown = !serviceId || serviceList.some((s) => s.id === serviceId);
  const planList = [...(plans.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const chosen = planList.find((p) => p.id === planId) ?? null;
  const planKnown = !planId || !!chosen || plans.isPending;
  // A plan another mapping claims is taken; the one this mapping already
  // claims is its own, however Flash marks it.
  const takenElsewhere = (p: FlashPlanItem) => p.mapping_id != null && p.id !== ownPlanId;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="plan-service">Flash service</Label>
          <select
            id="plan-service"
            className={SELECT_CLASS}
            value={serviceId}
            disabled={services.isPending}
            onChange={(e) => onChange({ serviceId: e.target.value, planId: "" })}
            data-testid="select-plan-service"
          >
            {services.isPending && <option value="">Reading Flash…</option>}
            {!services.isPending && !serviceId && <option value="">Choose a service…</option>}
            {!serviceKnown && <option value={serviceId}>{serviceId} — not on this Flash account</option>}
            {serviceList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {errors?.service && <p className="mt-1 text-xs text-red-500">{errors.service}</p>}
        </div>
        <div>
          <Label htmlFor="plan-flash-plan">Flash plan</Label>
          <select
            id="plan-flash-plan"
            className={SELECT_CLASS}
            value={planId}
            disabled={!serviceId || plans.isPending}
            onChange={(e) => onChange({ serviceId, planId: e.target.value })}
            data-testid="select-plan-flash-plan"
          >
            {!serviceId && <option value="">Choose a service first</option>}
            {serviceId && plans.isPending && <option value="">Reading Flash…</option>}
            {serviceId && !plans.isPending && !planId && <option value="">Choose a plan…</option>}
            {!planKnown && <option value={planId}>{planId} — not in Flash's list</option>}
            {planList.map((p) => (
              <option key={p.id} value={p.id}>
                {flashPlanLabel(p)}
                {p.status !== "active" ? " · not offered by Flash" : ""}
                {takenElsewhere(p) ? " · already mapped" : ""}
              </option>
            ))}
          </select>
          {errors?.plan && <p className="mt-1 text-xs text-red-500">{errors.plan}</p>}
        </div>
      </div>

      {plans.isError && (
        <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="plan-picker-plans-error">
          Couldn't read this service's plans: {(plans.error as Error)?.message}
        </p>
      )}
      {plans.isPending && serviceId && (
        <p className="inline-flex items-center gap-1 text-[11px] text-slate-400" aria-label="Reading Flash">
          <Loader2 className="h-3 w-3 animate-spin" />
        </p>
      )}

      {chosen && (
        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400" data-testid="plan-picker-facts">
          <p>
            Flash lists it as <span className="font-medium text-slate-700 dark:text-slate-200">{chosen.status}</span>
            {chosen.description ? ` · ${chosen.description}` : ""}
            {chosen.signup_url && (
              <>
                {" · "}
                <a href={chosen.signup_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand-link hover:underline">
                  signup page <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </p>
          {chosen.status !== "active" && (
            <p className="text-amber-600 dark:text-amber-400" data-testid="plan-picker-inactive-warning">
              Flash isn't offering this plan right now, so nobody can buy it until it is active in Flash.
            </p>
          )}
          {takenElsewhere(chosen) && (
            <p className="text-amber-600 dark:text-amber-400" data-testid="plan-picker-taken-warning">
              Already mapped (#{chosen.mapping_id}). One plan can only grant one policy; edit that mapping instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
