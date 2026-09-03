import { Chip } from "@/components/ui/chip";

/**
 * The label on a tag whose creator the network has said nothing about.
 *
 * ## Why the wording is what it is
 *
 * The true statement is narrow: we know nothing about whoever *made* this tag.
 * It is NOT "this tag is fake", NOT "these people aren't really this", and NOT
 * "the tag is new" — `lfo`, the tag that prompted this, is one of the most-used
 * on the network. Anything stronger would be us inventing a verdict out of an
 * absence of data.
 *
 * So: "Unknown creator", and the tooltip says the rest in plain words. Kept
 * `slate`, never a warning colour — amber would read as "danger" for what is
 * only "we can't check", and most of what carries this label is perfectly real.
 */
export function UnverifiedTagChip({ className }: { className?: string }) {
  return (
    <Chip
      tone="slate"
      size="sm"
      className={className}
      title="We don't know anything about whoever made this tag. It still works — it just doesn't show up in the browse list."
      data-testid="tag-unverified"
    >
      Unknown creator
    </Chip>
  );
}
