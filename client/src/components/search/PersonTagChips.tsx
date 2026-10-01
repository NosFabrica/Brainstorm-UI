import { Tag } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { tagSuggestionPath } from "@/components/search/TagSuggestionRow";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import type { TagChip } from "@/lib/tagCarrierPeople";

/**
 * The tag pill on a person's row in search — the one tag the words matched,
 * right-aligned so a list scans. One pill, one colour: a row says why this
 * person is here and nothing else about tags. Their other tags, who made a
 * tag and how tagging is counted belong to the profile and the tag page,
 * where there is room to explain them. The UI claims nothing about what a tag
 * means: only that a collection exists, how it was formed (the count), and
 * where to look deeper (the tag page).
 *
 * The slot is always rendered at row height so a row does not shift when
 * the carriers land. Mousedown is swallowed so the search box keeps focus;
 * the click never reaches the row.
 */
export function PersonTagChips({
  tag,
  pending = false,
  className = "",
  onNavigate,
  linkTabIndex,
  testId = "person-tag-chips",
}: {
  /** The matched tag this person carries, if any. */
  tag: TagChip | undefined;
  /** The lookup is still out: the slot waits. */
  pending?: boolean;
  className?: string;
  /** The surface closes its own panel or sheet. */
  onNavigate?: () => void;
  /** -1 inside listbox rows, where the input owns focus. */
  linkTabIndex?: number;
  testId?: string;
}) {
  const href = tag ? tagSuggestionPath(tag, npubFromPubkey) : "";
  const people = tag?.people === 1 ? "1 person" : `${tag?.people ?? 0} people`;
  const title = tag ? `Tagged ${tag.name} by ${people} · see who else` : undefined;
  const chip = tag && (
    <Chip
      tone="brand"
      size="sm"
      icon={Tag}
      className="cursor-pointer whitespace-nowrap transition-colors hover:border-indigo-200 hover:bg-indigo-50 active:bg-indigo-100 dark:hover:border-indigo-500/25 dark:hover:bg-indigo-500/10 dark:active:bg-indigo-500/20"
    >
      {tag.name}
    </Chip>
  );
  return (
    <span
      className={cn("ml-auto inline-flex h-5 shrink-0 items-center justify-end", className)}
      data-state={pending ? "pending" : "ready"}
      data-testid={testId}
    >
      <span
        className={cn(
          "flex items-center justify-end transition-opacity duration-200",
          tag ? "opacity-100" : "opacity-0",
        )}
      >
        {tag &&
          (href ? (
            <Link
              href={href}
              title={title}
              aria-label={`Tagged ${tag.name}`}
              tabIndex={linkTabIndex}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate?.();
              }}
              data-testid={`person-tag-chip-${tag.slug}`}
            >
              {chip}
            </Link>
          ) : (
            <span title={title} data-testid={`person-tag-chip-${tag.slug}`}>
              {chip}
            </span>
          ))}
      </span>
    </span>
  );
}
