/**
 * The tile, the title and one grey line — what a list item looks like where
 * it's one line among others: a row of the search popup (DListSuggestionRow)
 * and a row of its list (DListItemRow). One piece so the two can't drift;
 * each says what goes on the grey line. The popup's starts with what the
 * item is, because the popup mixes kinds; a list's is the summary, because
 * every row of it is the same kind.
 */
import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { avatarSrc } from "@/lib/avatarSrc";
import type { ItemPresentation } from "@/lib/itemPresentation";

export function ItemLine({
  shown,
  singular,
  line,
  testId,
}: {
  shown: ItemPresentation;
  /** The concept's singular name, for an item with no title. */
  singular: string;
  line: ReactNode;
  testId: string;
}) {
  const picture = shown.image ?? shown.listImage;
  return (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 ${shown.image ? "rounded-full" : "rounded-lg"}`}
      >
        {picture ? (
          <img
            src={avatarSrc(picture, "sm")}
            alt=""
            className={shown.image ? "h-full w-full object-cover" : "h-5 w-5 object-contain"}
          />
        ) : (
          <BookOpen className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
          data-testid={`${testId}-title`}
        >
          {shown.title ?? <span className="font-normal text-slate-400">Untitled {singular.toLowerCase()}</span>}
        </p>
        {line && (
          <p className="truncate text-xs text-slate-500 dark:text-slate-400" data-testid={`${testId}-line`}>
            {line}
          </p>
        )}
      </div>
    </>
  );
}
