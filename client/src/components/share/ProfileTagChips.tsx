import { Chip } from "@/components/ui/chip";
import { useProfileTags } from "@/hooks/useTags";
import { TagYourselfButton } from "@/components/share/TagYourselfButton";

/**
 * Network-attested tags on the public profile — the chip row that fills the slot
 * the hero has been reserving. Distinct from the owner's own "What you do" role
 * chips rendered just below: those are self-declared, these are what *other*
 * people say, counted from the trust perspective.
 *
 * Renders nothing until there's something to show — no skeleton. The hero is
 * already assembling ~25 queries and a placeholder here would just add another
 * shifting block above the bio.
 *
 * Deliberately not clickable yet: a tag chip should open that tag's page, and
 * that page (floor D) isn't built. A chip that looks tappable and isn't is worse
 * than a plain one.
 */
export function ProfileTagChips({
  pubkey,
  canTag = false,
}: {
  pubkey: string | undefined;
  /** The viewer is this profile's owner and can sign. Shows "Add a tag". */
  canTag?: boolean;
}) {
  const { data } = useProfileTags(pubkey);
  const tags = data?.tags ?? [];

  // An owner with no tags yet still needs the way in — otherwise the feature is
  // invisible to exactly the people who'd start using it.
  if (!tags.length && !canTag) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="share-tags">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Known for
      </span>
      {tags.map((tag) => {
        // Plain-language tooltip. The count is how many people vouched, so say
        // that — "3 applications" means nothing to someone who just opened a
        // profile.
        const who =
          tag.applications === 1
            ? "1 person added this"
            : `${tag.applications} people added this`;
        return (
          <Chip
            key={tag.key}
            tone={tag.myStance === "apply" ? "accent" : "brand"}
            title={tag.description ? `${who} — ${tag.description}` : who}
            data-testid="share-tag-chip"
          >
            {tag.name}
            {tag.applications > 1 && (
              <span className="opacity-60 tabular-nums">{tag.applications}</span>
            )}
          </Chip>
        );
      })}
      {canTag && pubkey && <TagYourselfButton pubkey={pubkey} />}
    </div>
  );
}
