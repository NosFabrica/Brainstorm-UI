import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type AdminBillingSubscription } from "@/services/api";
import { XCircle } from "lucide-react";
import { sourceLabel, statusLabel } from "./billingEventCopy";

/**
 * The roster's header, the User Database's so the two rosters read as one
 * system: the name, then count · page · source, with the search and filters
 * beside them.
 */
export function BillingRosterHeader({
  items,
  total,
  matched,
  outOf,
  page,
  pages,
  filtering,
  partial,
  statuses,
  sources,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  sourceFilter,
  setSourceFilter,
  serviceFilter,
  setServiceFilter,
  serviceOptions,
}: {
  items: AdminBillingSubscription[];
  total: number;
  matched: AdminBillingSubscription[];
  outOf: number;
  page: number;
  pages: number;
  filtering: boolean;
  /** Filtering while not every page is in yet. */
  partial: boolean;
  statuses: string[];
  sources: string[];
  search: string;
  setSearch: (text: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  sourceFilter: string;
  setSourceFilter: (value: string) => void;
  serviceFilter: string;
  setServiceFilter: (value: string) => void;
  serviceOptions: { id: string; label: string }[];
}) {
  return (
    <div
      className="flex flex-col gap-3 border-b border-brand-accent/10 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      data-testid="billing-roster-header"
    >
      <div>
        <h3
          className="text-sm font-bold text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Billing
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {(filtering ? matched.length : total).toLocaleString()}{" "}
            {(filtering ? matched.length : total) === 1 ? "subscriber" : "subscribers"}
            {filtering ? (partial ? " on this page (reading every page…)" : " match") : ""}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">|</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            Page {page} of {pages}
          </span>
        </div>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <input
              type="text"
              placeholder="Search name, npub, tier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-1.5 pr-7 text-xs focus:border-brand-accent/40 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 dark:border-slate-800 dark:bg-slate-900/80"
              data-testid="input-billing-search"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                data-testid="button-billing-clear-search"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {serviceOptions.length > 1 && (
            <div
              role="group"
              aria-label="Flash service"
              className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white/80 p-0.5 dark:border-slate-800 dark:bg-slate-900/80"
              data-testid="billing-service-filter"
            >
              {[{ id: "all", label: "All services" }, ...serviceOptions].map((opt) => {
                const pressed = serviceFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setServiceFilter(opt.id)}
                    className={`h-7 rounded-lg px-2.5 text-xs font-medium transition-colors ${pressed ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                    data-testid={`billing-service-filter-${opt.id}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="h-8 w-32 rounded-xl border-slate-200 text-xs dark:border-slate-800"
              data-testid="select-billing-status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger
              className="h-8 w-32 rounded-xl border-slate-200 text-xs dark:border-slate-800"
              data-testid="select-billing-source"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {sourceLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtering && (
            <span className="text-xs text-slate-400 dark:text-slate-500" data-testid="billing-filter-count">
              {matched.length} of {outOf}
              {partial ? " on this page" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
