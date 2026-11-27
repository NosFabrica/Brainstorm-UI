import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { type SortState, type SortKey } from "./rosterShared";

/** Same affordance as the Users tab's SortHeader: label + direction chevrons. */
export function BillingSortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      className="flex items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider transition-colors hover:text-slate-800 dark:hover:text-slate-200"
      onClick={() => onSort(sortKey)}
      data-testid={`sort-billing-${sortKey}`}
    >
      {label}
      {active ? (
        sort!.dir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}
