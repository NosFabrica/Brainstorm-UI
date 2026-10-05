import { useState } from "react";
import { BookOpen, Eye, ListChecks, Loader2, MoreHorizontal, Play, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResyncControl } from "./ResyncControl";
import { DictionaryConceptsDialog } from "./dictionary/DictionaryConceptsDialog";
import { useUserDictionary } from "./dictionary/useUserDictionary";

/**
 * The Users tab's per-row actions, folded into one three-dot menu (same
 * affordance as the Billing tab) instead of three inline buttons — the row
 * gets its real estate back. Trigger keeps its existing page-level confirm;
 * Resync and Dictionary keep their own dialogs, mounted OUTSIDE the menu so
 * they survive the menu closing on select.
 *
 * The Dictionary item says how many concepts the user already holds. It
 * reads the relay when the menu opens, not when the row renders — a page of
 * users is one read per menu someone actually opens.
 */
export function UserActionsMenu({
  pubkey,
  triggering,
  triggerDisabled,
  onTrigger,
  onView,
  onPublishTrustedLists,
  dictionary,
  testIdSuffix,
}: {
  pubkey: string;
  /** A recompute for this user is in flight — shown, and the item disabled. */
  triggering?: boolean;
  /** e.g. a bulk re-trigger is running; the item disables with the rest. */
  triggerDisabled?: boolean;
  onTrigger: () => void;
  onView: () => void;
  /** Opens the Trusted Lists tab with this user as the observer (still confirm-first there). */
  onPublishTrustedLists?: () => void;
  /** Offers "Add dictionary concepts…" for this user: their Assistant, and their name for the dialog. */
  dictionary?: { taPubkey: string | null; name: string };
  /** Row index or similar, to keep per-row testids unique. */
  testIdSuffix: string | number;
}) {
  const [resyncOpen, setResyncOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const held = useUserDictionary(pubkey, dictionary?.taPubkey ?? null, !!dictionary && menuOpen);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="User actions"
            onClick={(e) => e.stopPropagation()}
            data-testid={`user-actions-${testIdSuffix}`}
          >
            {triggering ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Actions
          </DropdownMenuLabel>
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
          {onPublishTrustedLists && (
            <DropdownMenuItem onSelect={onPublishTrustedLists} data-testid="user-action-trusted-lists">
              <ListChecks className="mr-2 h-3.5 w-3.5" /> Publish trusted lists…
            </DropdownMenuItem>
          )}
          {dictionary && (
            <DropdownMenuItem onSelect={() => setDictionaryOpen(true)} data-testid="user-action-dictionary">
              <BookOpen className="mr-2 h-3.5 w-3.5" /> Add dictionary concepts…
              <span
                className="ml-auto pl-3 text-[11px] tabular-nums text-slate-400 dark:text-slate-500"
                data-testid="user-action-dictionary-held"
              >
                {held.data ? `${held.data.held}/${held.data.total}` : held.isError ? "?" : "…"}
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setResyncOpen(true)} data-testid="user-action-resync">
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Resync published state…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResyncControl pubkey={pubkey} showTrigger={false} open={resyncOpen} onOpenChange={setResyncOpen} />
      {dictionary && (
        <DictionaryConceptsDialog
          pubkey={pubkey}
          taPubkey={dictionary.taPubkey}
          name={dictionary.name}
          open={dictionaryOpen}
          onOpenChange={setDictionaryOpen}
        />
      )}
    </>
  );
}
