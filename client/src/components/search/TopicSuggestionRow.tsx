import { Hash, ArrowRight } from "lucide-react";

/**
 * The single dropdown row shown when a search query starts with `#`. Renders as
 * a "go to this topic" action (→ `/t/<tag>`), mirroring the profile-suggestion
 * row layout (icon tile + primary + secondary line) so the dropdown stays
 * aligned. An empty tag (just `#`) shows a muted hint instead of a dead row.
 * Shared by the landing search box and the public-page HeaderSearchBox.
 */
export function TopicSuggestionRow({
  tag,
  active = false,
  onSelect,
  testId = "topic-suggestion",
}: {
  tag: string;
  active?: boolean;
  onSelect?: () => void;
  testId?: string;
}) {
  if (!tag) {
    return (
      <div className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500" data-testid={`${testId}-hint`}>
        Type a topic, e.g. <span className="font-mono text-slate-500 dark:text-slate-400">#bitcoin</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? "bg-slate-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
      data-testid={testId}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
        <Hash className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">#{tag}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">Trusted posts and articles on this topic</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
    </button>
  );
}
