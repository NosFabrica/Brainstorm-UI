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
  // A cover is a portrait tile, as on a shelf; a face or a logo is round.
  const portrait = !!shown.image && shown.imageShape === "portrait";
  // A list's logo sits on white in both themes: logos are drawn for a white ground, and many carry one.
  return (
    <>
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden text-slate-400 dark:text-slate-500 ${
          portrait
            ? "h-10 w-7 rounded-sm shadow-sm ring-1 ring-black/10 dark:ring-white/10"
            : `h-8 w-8 ${shown.image ? "rounded-full" : "rounded-lg"}`
        } ${!shown.image && shown.listImage ? "bg-white" : "bg-slate-100 dark:bg-slate-800"}`}
        data-shape={portrait ? "portrait" : undefined}
        data-testid={`${testId}-tile`}
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
