import { Trash2 } from "lucide-react";

/**
 * The one piece of a page that is deliberately not asking for attention.
 *
 * Where a post deleted by overwriting would have been — a quoted note, an
 * embedded article, the page at its own link — this says what happened and
 * nothing else: the card's frame at a whisper (dashed hairline, no fill to
 * speak of), a small icon, one grey sentence. No image, no button, no link.
 * Deletion is not an error and not a warning. Named when we know who.
 */
export function DeletedStub({ who, className = "", testId = "deleted-stub" }: { who?: string | null; className?: string; testId?: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400 ${className}`}
      data-testid={testId}
    >
      <Trash2 className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <span>{who ? `${who} deleted this post.` : "This post was deleted by its author."}</span>
    </div>
  );
}
