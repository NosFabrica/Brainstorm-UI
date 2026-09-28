import { ArrowRight } from "lucide-react";
import { PERSON_CONTENT_ICONS } from "@/components/search/PersonContentChips";
import { chipAriaLabel, type PersonContentChip } from "@/lib/personContent";

/**
 * "staci shop" → one row, first: "Staci's shop →", landing on the search
 * scoped to that person on that tab. Google reads "nike shoes" the same way.
 * Built to the shape of the other suggestion rows (tile, primary line,
 * secondary line, trailing arrow), so the dropdown stays one list.
 */
export function IntentSuggestionRow({ name, chip, onSelect, testId = "intent-suggestion" }: { name: string; chip: PersonContentChip; onSelect: () => void; testId?: string }) {
  const Icon = PERSON_CONTENT_ICONS[chip.key];
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
      data-testid={testId}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{chipAriaLabel(name, chip)}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">Only {name}'s {chip.label.toLowerCase()}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
    </button>
  );
}
