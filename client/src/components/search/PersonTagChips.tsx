import { Tag } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { tagSuggestionPath } from "@/components/search/TagSuggestionRow";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import type { TagSummary } from "@/services/tags";

/** As many as the search box shows tag rows for. */
const MAX_TAG_CHIPS = 3;

const UNKNOWN_CREATOR =
  "We don't know anything about whoever made this tag. It still works — it just doesn't show up in the browse list.";

/**
 * The tag chips on a person's row in search — the matched tags the network
 * put on them, right-aligned so a list scans. The UI claims nothing about
 * what a tag means: only that a collection exists, how it was formed (the
 * count of people), and where to look deeper (the tag page).
 *
 * The slot is always rendered at row height so a row does not shift when
 * the carriers land. Mousedown is swallowed so the search box keeps focus;
 * the click never reaches the row.
 */
export function PersonTagChips({
  tags,
  className = "",
  onNavigate,
  linkTabIndex,
  testId = "person-tag-chips",
}: {
  /** Undefined while the lookup is out; an empty list when there is nothing to say. */
  tags: readonly TagSummary[] | undefined;
  className?: string;
  /** The surface closes its own panel or sheet. */
  onNavigate?: () => void;
  /** -1 inside listbox rows, where the input owns focus. */
  linkTabIndex?: number;
  testId?: string;
}) {
  const shown = (tags ?? []).slice(0, MAX_TAG_CHIPS);
  return (
    <span
      className={cn("ml-auto inline-flex h-5 shrink-0 items-center justify-end", className)}
      data-state={tags ? "ready" : "pending"}
      data-testid={testId}
    >
      <span
        className={cn(
          "flex items-center justify-end gap-1 transition-opacity duration-200",
          shown.length ? "opacity-100" : "opacity-0",
        )}
      >
        {shown.map((tag) => {
          const people = tag.people === 1 ? "1 person" : `${tag.people} people`;
          const title = tag.unverified ? UNKNOWN_CREATOR : `Tagged ${tag.name} by ${people} · see who else`;
          const href = tagSuggestionPath(tag, npubFromPubkey);
          const chip = (
            <Chip
              tone={tag.unverified ? "slate" : "brand"}
              size="sm"
              icon={Tag}
              className="cursor-pointer whitespace-nowrap transition-colors hover:border-indigo-200 hover:bg-indigo-50 active:bg-indigo-100 dark:hover:border-indigo-500/25 dark:hover:bg-indigo-500/10 dark:active:bg-indigo-500/20"
            >
              {tag.name}
            </Chip>
          );
          if (!href) {
            return (
              <span key={tag.key} title={title} data-testid={`person-tag-chip-${tag.slug}`}>
                {chip}
              </span>
            );
          }
          return (
            <Link
              key={tag.key}
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
              data-unverified={tag.unverified ? "true" : undefined}
              data-testid={`person-tag-chip-${tag.slug}`}
            >
              {chip}
            </Link>
          );
        })}
      </span>
    </span>
  );
}
