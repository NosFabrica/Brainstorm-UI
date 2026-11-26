import { NoteContent } from "@/components/share/NoteContent";
import { HighlightAttribution, HighlightQuote, HighlightSourceLine } from "@/components/share/HighlightQuote";
import { useRefEvent } from "@/hooks/useRefEvent";
import type { Highlight } from "@/lib/nip84";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * A quoted NIP-84 highlight: what its highlighter said (`comment`), the passage
 * marked, then where it is from — the article or note by `a`/`e`, the page by
 * its `source` `r` (never a `mention` one), a work by its `i` or text `r` — and
 * whose it is (`p` with its role). Its source is looked up only when the card is
 * not itself nested: one level, never a stack.
 */
export function EmbeddedHighlight({
  event,
  highlight,
  nested,
}: {
  event: MinimalEvent;
  highlight: Highlight;
  nested: boolean;
}) {
  const { event: sourceEvent } = useRefEvent(nested ? null : highlight.source.ref);
  return (
    <div data-testid="embedded-highlight">
      {highlight.comment && (
        <div className="mb-1.5 line-clamp-3 text-[14px]" data-testid="embedded-highlight-comment">
          <NoteContent content={highlight.comment} compact tags={event.tags} />
        </div>
      )}
      <HighlightQuote lines={highlight.comment ? 3 : 4} testId="embedded-highlight-passage">
        {highlight.passage}
      </HighlightQuote>
      <HighlightSourceLine source={highlight.source} sourceEvent={sourceEvent} testId="embedded-highlight-source" />
      <HighlightAttribution
        attributions={highlight.attributions}
        except={sourceEvent?.pubkey}
        className="mt-1"
        testId="embedded-highlight-attribution"
      />
    </div>
  );
}
