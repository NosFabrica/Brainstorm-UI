import { useState } from "react";
import { Tag as TagIcon } from "lucide-react";
import { FacetChip, FacetRow } from "@/components/search/sections";
import type { ResultTag } from "@/lib/resultTags";

/** How many of the results' tags show as filters before "more tags". */
const TAG_FILTERS_SHOWN = 6;

/**
 * The tags a page's results carry, most carried first: each a filter over them, one pressed at a
 * time. The pressed one stays in sight wherever the order puts it, and one no loaded row carries
 * (a link can name it) still shows pressed once the tags are in, so it can be let go.
 */
export function TagFacets({
  tags,
  pressed,
  settled,
  onPress,
}: {
  tags: readonly ResultTag[];
  pressed: string | null;
  settled: boolean;
  onPress: (tag: ResultTag | null) => void;
}) {
  const [allShown, setAllShown] = useState(false);
  const first = allShown ? tags : tags.slice(0, TAG_FILTERS_SHOWN);
  const held = tags.find((t) => t.key === pressed);
  const shown = held && !first.includes(held) ? [...first, held] : first;
  const more = allShown ? 0 : tags.length - shown.length;
  if (!shown.length && !pressed) return null;
  return (
    <FacetRow className="mb-2" testId="tag-facets">
      <TagIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      {shown.map((t) => (
        <FacetChip
          key={t.key}
          pressed={pressed === t.key}
          onClick={() => onPress(pressed === t.key ? null : t)}
          testId={`tag-facet-${t.slug}`}
        >
          {t.name}
        </FacetChip>
      ))}
      {pressed && settled && !held && (
        <FacetChip pressed onClick={() => onPress(null)} testId="tag-facet-pressed">
          {pressed.slice(pressed.indexOf("|") + 1)}
        </FacetChip>
      )}
      {more > 0 && (
        <FacetChip pressed={false} onClick={() => setAllShown(true)} testId="tag-facets-more">
          +{more} more
        </FacetChip>
      )}
    </FacetRow>
  );
}
