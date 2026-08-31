import { useState } from "react";
import { Eye, Loader2, MoreHorizontal, Play, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResyncControl } from "./ResyncControl";

/**
 * The Users tab's per-row actions, folded into one three-dot menu (same
 * affordance as the Billing tab) instead of three inline buttons — the row
 * gets its real estate back. Trigger keeps its existing page-level confirm;
 * Resync keeps its own dialog, mounted OUTSIDE the menu so it survives the
 * menu closing on select.
 */
export function UserActionsMenu({
  pubkey,
  triggering,
  triggerDisabled,
  onTrigger,
  onView,
  testIdSuffix,
}: {
  pubkey: string;
  /** A recompute for this user is in flight — shown, and the item disabled. */
  triggering?: boolean;
  /** e.g. a bulk re-trigger is running; the item disables with the rest. */
  triggerDisabled?: boolean;
  onTrigger: () => void;
  onView: () => void;
  /** Row index or similar, to keep per-row testids unique. */
  testIdSuffix: string | number;
}) {
  const [resyncOpen, setResyncOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="User actions"
            onClick={(e) => e.stopPropagation()}
            data-testid={`user-actions-${testIdSuffix}`}
          >
            {triggering ? <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> : <MoreHorizontal className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Actions</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={triggering || triggerDisabled}
            onSelect={onTrigger}
            data-testid="user-action-trigger"
          >
            <Play className="mr-2 h-3.5 w-3.5" /> {triggering ? "Triggering…" : "Trigger recalculation"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onView} data-testid="user-action-view">
            <Eye className="mr-2 h-3.5 w-3.5" /> View profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setResyncOpen(true)} data-testid="user-action-resync">
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Resync published state…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResyncControl pubkey={pubkey} showTrigger={false} open={resyncOpen} onOpenChange={setResyncOpen} />
    </>
  );
}
