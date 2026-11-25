/**
 * What stands between a list draft (hooks/useReplaceableListDraft) and an edit:
 * the list still loading, a read nobody answered, or a newer version that
 * arrived while it was being edited. Nothing when it is free to edit.
 */
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReplaceableListDraft } from "@/hooks/useReplaceableListDraft";

export function ListDraftNotice({
  draft,
  testId = "list-draft-notice",
}: {
  draft: Pick<ReplaceableListDraft<unknown>, "status" | "stale" | "retry" | "discard">;
  testId?: string;
}) {
  if (draft.status === "loading")
    return (
      <span className="flex items-center gap-2 text-xs text-slate-500" data-testid={`${testId}-loading`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up your list…
      </span>
    );
  if (draft.status === "unreadable")
    return (
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-700 dark:text-amber-300"
        data-testid={`${testId}-unreadable`}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Your relays didn&rsquo;t answer, so your current list can&rsquo;t be changed yet.
        <button type="button" onClick={draft.retry} className="font-semibold text-brand-link hover:underline">
          Try again
        </button>
      </p>
    );
  if (draft.stale)
    return (
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-800 dark:text-amber-200"
        data-testid={`${testId}-stale`}
      >
        A newer version arrived while you were editing. Load it, then make your change again: nothing was published.
        <button type="button" onClick={draft.discard} className="font-semibold text-brand-link hover:underline">
          Load the newer version
        </button>
      </p>
    );
  return null;
}
