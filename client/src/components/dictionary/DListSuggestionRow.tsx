/**
 * A list item as a row in the search popup — a destination, like the tag,
 * topic and shop rows (design-system § The search popup). Same shape as
 * those: an icon tile, the item's title, and a grey line whose first word
 * is what it is: "GitHub Account · github.com/vcavallo". The tile and text
 * are ItemLine, shared with the list row.
 *
 * Drawn from the same view as the item's page and card (useItemView). The
 * grey line's second part is the summary, else the item's first link, else
 * the list it belongs to.
 */
import { ArrowRight } from "lucide-react";
import { isReady, useItemView } from "@/hooks/useItemView";
import { ItemLine } from "./ItemLine";

export function DListSuggestionRow({
  event,
  onSelect,
  testId = "dlist-suggestion",
}: {
  event: { id: string; kind: number; pubkey: string; tags: string[][] };
  onSelect?: () => void;
  testId?: string;
}) {
  const view = useItemView(event);
  if (!isReady(view)) return null; // the popup offers destinations it can name, nothing half-read

  const { resolved: r, shown, links } = view;
  const link = links[0];
  const secondary =
    shown.summary ?? (link ? link.href.replace(/^https:\/\//, "").replace(/\/$/, "") : `in ${r.governing.plural}`);
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
      data-testid={testId}
    >
      <ItemLine
        shown={shown}
        singular={r.governing.singular}
        line={`${r.governing.singular} · ${secondary}`}
        testId={testId}
      />
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
    </button>
  );
}
