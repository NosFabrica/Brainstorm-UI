import { Tag, ArrowRight } from "lucide-react";
import { UnverifiedTagChip } from "@/components/search/UnverifiedTagChip";
import type { TagSummary } from "@/services/tags";

/**
 * A tag match in the search dropdown — "people the network says are X".
 *
 * Deliberately built to the same shape as `TopicSuggestionRow` (icon tile,
 * primary line, secondary line, trailing arrow) so a dropdown that mixes
 * people, topics and tags reads as one list rather than three widgets.
 *
 * The distinction from a topic matters and the secondary line carries it: `#x`
 * is a hashtag someone typed into their own post, while a tag is other people
 * vouching for who you are. Same visual weight, different claim.
 */
export function TagSuggestionRow({
  tag,
  active = false,
  onSelect,
  testId = "tag-suggestion",
}: {
  tag: TagSummary;
  active?: boolean;
  onSelect?: () => void;
  testId?: string;
}) {
  const people =
    tag.people === 1 ? "1 person" : `${tag.people} people`;

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? "bg-slate-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
      data-testid={testId}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-accent/15 text-brand-accent">
        <Tag className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{tag.name}</p>
          {/* You typed this name, so we show the tag — but we say what we
              don't know about it rather than letting the list imply we
              vouched for it. */}
          {tag.unverified && <UnverifiedTagChip className="shrink-0" />}
        </div>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{people} tagged this</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
    </button>
  );
}

/** Where a tag suggestion goes. Returns "" when the author pubkey won't encode. */
export function tagSuggestionPath(tag: TagSummary, npubFor: (pk: string) => string): string {
  try {
    return `/tags/${npubFor(tag.authorPubkey)}/${tag.slug}`;
  } catch {
    return "";
  }
}
