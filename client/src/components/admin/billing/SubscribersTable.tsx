import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { ScrollableTable } from "@/components/admin/ScrollableTable";
import { type AdminBillingSubscription } from "@/services/api";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { BillingSortHeader } from "./BillingSortHeader";
import { SubscriberRow } from "./SubscriberRow";
import { type SortState, type ProfileBits, FLASH_DASHBOARD_URL, th, thLast, type SortKey } from "./rosterShared";

/** What a roster row's menu and dialogs do, wired by the tab. */
export type SubscriberRowActions = Pick<
  ComponentProps<typeof SubscriberRow>,
  "onBlock" | "onUnblock" | "onResync" | "onViewFlashRecord" | "onCancel" | "onPause" | "onResume"
>;

/**
 * The subscriber roster — attributed by construction (pubkey-keyed): the
 * table, its pager, and the way out to the Flash dashboard.
 */
export function SubscribersTable({
  items,
  filtered,
  matched,
  total,
  outOf,
  filtering,
  page,
  setPage,
  pages,
  sort,
  toggleSort,
  profiles,
  serviceNames,
  busyKeys,
  rowActions,
}: {
  /** The server's page. */
  items: AdminBillingSubscription[];
  /** The rows on screen. */
  filtered: AdminBillingSubscription[];
  /** Everyone the search and filters match. */
  matched: AdminBillingSubscription[];
  total: number;
  outOf: number;
  filtering: boolean;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  pages: number;
  sort: SortState;
  toggleSort: (key: SortKey) => void;
  profiles: Map<string, ProfileBits>;
  serviceNames: Map<string, string>;
  busyKeys: ReadonlySet<string>;
  rowActions: SubscriberRowActions;
}) {
  return (
    <div>
      {items.length === 0 ? (
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-empty">
          No subscribers yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-subscribers-no-match">
          No subscribers match your filters.
        </p>
      ) : (
        <div>
          <ScrollableTable>
            <table
              className="w-full min-w-[860px] border-collapse border border-slate-200 text-left dark:border-slate-800"
              data-testid="table-billing-subscribers"
            >
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
                  <th className={th}>
                    <BillingSortHeader label="Subscriber" sortKey="subscriber" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className={th}>
                    <BillingSortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className={th}>
                    <BillingSortHeader label="Service" sortKey="service" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className={th}>
                    <BillingSortHeader label="Tier" sortKey="scheduling" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className={th}>
                    <BillingSortHeader label="Source" sortKey="source" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className={th}>
                    <BillingSortHeader label="Period" sortKey="period" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className={th}>Interval</th>
                  <th className={th}>Cycle</th>
                  <th className={th}>
                    <BillingSortHeader label="Next bill" sortKey="nextbill" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className={th}>
                    <BillingSortHeader label="Last synced" sortKey="synced" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className={thLast}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <SubscriberRow
                    key={s.pubkey}
                    s={s}
                    profile={profiles.get(s.pubkey)}
                    serviceNames={serviceNames}
                    busy={busyKeys.has(s.pubkey)}
                    {...rowActions}
                  />
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          {pages > 1 && (
            <div
              className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400"
              data-testid="billing-pager"
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                data-testid="billing-pager-prev"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <span className="tabular-nums">
                Page {page} of {pages} · {filtering ? `${matched.length} of ${outOf}` : total} subscribers
              </span>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                data-testid="billing-pager-next"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
      <a
        href={FLASH_DASHBOARD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-link hover:underline"
        data-testid="link-flash-dashboard"
      >
        Invoices, refunds and management live in the Flash dashboard
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
