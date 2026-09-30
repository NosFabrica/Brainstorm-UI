import { Tag } from "lucide-react";
import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { tagSuggestionPath } from "@/components/search/TagSuggestionRow";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { tagChipId, type TagChip } from "@/lib/tagCarrierPeople";

/** As many as the search box shows tag rows for. */
const MAX_TAG_CHIPS = 3;

const UNKNOWN_CREATOR =
  "We don't know anything about whoever made this tag. It still works — it just doesn't show up in the browse list.";

/**
 * The tag chips on a person's row in search — the tags the network put on
 * them, right-aligned so a list scans. The tag the words matched is loud
 * (brand); the person's other tags are quiet (slate), so every row says
 * who this is without shouting. The UI claims nothing about what a tag
 * means: only that a collection exists, how it was formed (the count), and
 * where to look deeper (the tag page).
 *
 * The slot is always rendered at row height so a row does not shift when
 * the carriers land. Mousedown is swallowed so the search box keeps focus;
 * the click never reaches the row.
 */
export function PersonTagChips({
  tags,
  emphasis,
  max = MAX_TAG_CHIPS,
  className = "",
  onNavigate,
  linkTabIndex,
  testId = "person-tag-chips",
}: {
  /** Undefined while the lookup is out; an empty list when there is nothing to say. */
  tags: readonly TagChip[] | undefined;
  /** The tags to say loudly, by `tagChipId`; unset, every chip is loud. */
  emphasis?: ReadonlySet<string>;
  /** How many to show at most — a narrow row (the typeahead) takes fewer than a card. */
  max?: number;
  className?: string;
  /** The surface closes its own panel or sheet. */
  onNavigate?: () => void;
  /** -1 inside listbox rows, where the input owns focus. */
  linkTabIndex?: number;
  testId?: string;
}) {
  const loud = (tag: TagChip) => !emphasis || emphasis.has(tagChipId(tag));
  const shown = [...(tags ?? [])]
    .sort((a, b) => Number(loud(b)) - Number(loud(a)))
    .slice(0, Math.min(max, MAX_TAG_CHIPS));
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
        {shown.map((tag, i) => {
          // A phone row has room for one; the rest wait for a wider screen.
          const phoneHidden = i > 0 ? "hidden sm:inline-flex" : "";
          const people = tag.people === 1 ? "1 person" : `${tag.people ?? 0} people`;
          const title = tag.unverified ? UNKNOWN_CREATOR : `Tagged ${tag.name} by ${people} · see who else`;
          const href = tagSuggestionPath(tag, npubFromPubkey);
          const isLoud = loud(tag) && !tag.unverified;
          const chip = (
            <Chip
              tone={isLoud ? "brand" : "slate"}
              size="sm"
              icon={Tag}
              className="cursor-pointer whitespace-nowrap transition-colors hover:border-indigo-200 hover:bg-indigo-50 active:bg-indigo-100 dark:hover:border-indigo-500/25 dark:hover:bg-indigo-500/10 dark:active:bg-indigo-500/20"
            >
              {tag.name}
            </Chip>
          );
          if (!href) {
            return (
              <span
                key={tag.key}
                title={title}
                className={phoneHidden}
                data-emphasis={isLoud ? "loud" : "quiet"}
                data-testid={`person-tag-chip-${tag.slug}`}
              >
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
              className={cn(
                "rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
                phoneHidden,
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate?.();
              }}
              data-unverified={tag.unverified ? "true" : undefined}
              data-emphasis={isLoud ? "loud" : "quiet"}
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
