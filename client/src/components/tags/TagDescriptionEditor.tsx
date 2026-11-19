import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { signingProblem } from "@/accounts/signing";
import { useToast } from "@/hooks/use-toast";
import { useEditTagDescription } from "@/hooks/useTags";
import { TAG_DESCRIPTION_MAX } from "@/lib/tagEdit";

/**
 * On a tag's page, for the person who created it: change what the tag means.
 *
 * Only the description. The name is shown and fixed: the tag's address is made
 * from it, and the people carrying the tag agreed to that name, not to a later
 * one. Nobody else is offered this, because nobody else can sign the tag
 * (services/tags `editTagDescription`).
 */
export function TagDescriptionEditor({
  authorPubkey,
  slug,
  name,
  description,
  viewerPubkey,
  className,
}: {
  authorPubkey: string;
  slug: string;
  name: string;
  /** What the tag says now; empty when it has never had one. */
  description: string | undefined;
  viewerPubkey: string | undefined;
  className?: string;
}) {
  const current = description ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const { toast } = useToast();
  const edit = useEditTagDescription(authorPubkey, slug);
  if (!viewerPubkey || viewerPubkey !== authorPubkey) return null;

  if (draft === null)
    return (
      <button
        type="button"
        onClick={() => setDraft(current)}
        className={`inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-brand-primary dark:text-slate-400 ${className ?? ""}`}
        data-testid="tag-description-edit"
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
        {current ? "Edit description" : "Add a description"}
      </button>
    );

  const unchanged = draft.trim() === current.trim();
  const save = async () => {
    try {
      await edit.mutateAsync(draft);
      setDraft(null);
      toast({ title: "Description updated", description: "Anyone who opens this tag sees the new words." });
    } catch (error) {
      const problem = signingProblem(error, "The relays did not take it. Try again in a moment.");
      if (problem) toast({ title: "Couldn't save the description", description: problem, variant: "destructive" });
    }
  };

  return (
    <form
      className={`rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${className ?? ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!unchanged && !edit.isPending) void save();
      }}
      data-testid="tag-description-form"
    >
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-slate-100">{name}</span> · The name can't be changed.
      </p>
      <label className="mt-2 block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Description</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={TAG_DESCRIPTION_MAX}
          placeholder="What does this tag mean?"
          autoFocus
          className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          data-testid="tag-description-field"
        />
      </label>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          {draft.length}/{TAG_DESCRIPTION_MAX}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            data-testid="tag-description-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={unchanged || edit.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="tag-description-save"
          >
            {edit.isPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
            Save
          </button>
        </div>
      </div>
    </form>
  );
}
