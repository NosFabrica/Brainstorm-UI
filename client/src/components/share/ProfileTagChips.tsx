import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { useProfileTags } from "@/hooks/useTags";
import { TagPersonButton } from "@/components/share/TagPersonButton";
import { npubFromPubkey } from "@/lib/shareId";

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
 * Each chip links to its tag page (`/tags/:author/:slug`) — the list of everyone
 * carrying it, which is what makes a tag legible as a list rather than a label.
 */
export function ProfileTagChips({
  pubkey,
  canTag = false,
  isOwner = false,
}: {
  pubkey: string | undefined;
  /** The viewer is signed in AND holds a signer. Shows "Add a tag". */
  canTag?: boolean;
  /** Viewing their own profile — changes wording only, not permission. */
  isOwner?: boolean;
}) {
  const { data } = useProfileTags(pubkey);
  const tags = data?.tags ?? [];

  // Someone who can tag but sees no tags yet still needs the way in — otherwise
  // the feature is invisible to exactly the people who'd start using it.
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
        // Say so when the viewer has pushed back, otherwise a tag they disagreed
        // with looks identical to one they never touched.
        const stanceNote = tag.myStance === "dispute" ? " · you disagreed" : "";
        let authorNpub = "";
        try { authorNpub = npubFromPubkey(tag.authorPubkey); } catch { /* unlinkable */ }

        const chip = (
          <Chip
            key={tag.key}
            tone={tag.myStance === "apply" ? "accent" : "brand"}
            title={(tag.description ? `${who} — ${tag.description}` : who) + stanceNote}
            data-testid="share-tag-chip"
            className={authorNpub ? "transition-opacity hover:opacity-80" : undefined}
          >
            {tag.name}
            {tag.applications > 1 && (
              <span className="opacity-60 tabular-nums">{tag.applications}</span>
            )}
          </Chip>
        );

        // A tag whose author pubkey won't encode has no page to open, so it
        // stays a plain chip rather than a link that goes nowhere.
        return authorNpub ? (
          <Link key={tag.key} href={`/tags/${authorNpub}/${tag.slug}`}>
            {chip}
          </Link>
        ) : (
          chip
        );
      })}
      {canTag && pubkey && <TagPersonButton pubkey={pubkey} isOwner={isOwner} />}
    </div>
  );
}
