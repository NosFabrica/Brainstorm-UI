import { AdminSupportCards } from "@/components/admin/support/AdminSupportCards";

/** The Support tab: paid users' priority tickets. */
export function SupportTab() {
  return (
    <div className="grid grid-cols-1 gap-6" data-testid="panel-support">
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm dark:shadow-none"
        data-testid="card-support-tickets"
      >
        <div className="border-b border-brand-accent/10 px-5 py-4">
          <h3
            className="text-sm font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Priority Support
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tickets from paid users — reply here; the in-app thread is the source of truth
          </p>
        </div>
        <div className="px-5 py-4">
          <AdminSupportCards active />
        </div>
      </div>
    </div>
  );
}
