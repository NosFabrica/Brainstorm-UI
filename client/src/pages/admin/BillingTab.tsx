import { AdminBillingCards } from "@/components/admin/billing/AdminBillingCards";
import { PlanMappingsCard } from "@/components/admin/billing/PlanMappingsCard";

/** The Billing tab: the subscriber roster and the plan mappings. */
export function BillingTab() {
  return (
    <div className="grid grid-cols-1 gap-6" data-testid="panel-billing">
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
        data-testid="card-billing-subscribers"
      >
        {/* The header is the roster's own — count, page, source and the
            controls — the User Database's anatomy. */}
        <AdminBillingCards active />
      </div>
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
        data-testid="card-billing-plans"
      >
        {/* The header is the card's own — its sentence once, New mapping beside it. */}
        <PlanMappingsCard active />
      </div>
    </div>
  );
}
