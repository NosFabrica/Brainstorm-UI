import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { useProfileTags } from "@/hooks/useTags";
import { TagPersonButton } from "@/components/share/TagPersonButton";
import { npubFromPubkey } from "@/lib/shareId";
import { corroborations, onlySelfDeclared } from "@/lib/tagCounts";

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
  legacyRoles = [],
}: {
  pubkey: string | undefined;
  /** The viewer is signed in AND holds a signer. Shows "Add a tag". */
  canTag?: boolean;
  /** Viewing their own profile — changes wording only, not permission. */
  isOwner?: boolean;
  /** Retired self-declared roles, offered back to the owner as tags. */
  legacyRoles?: string[];
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
        // Agreement is the only count on a profile chip. The disagreement
        // number belongs on the tag page, where the subject isn't the headline —
        // a permanent "3 people disagree" badge on someone's face is a
        // pile-on affordance, not information.
        // `applications` counts the subject too (the kit's rule, and what the
        // reference instance shows). The copy has to say how many OTHER people
        // vouched, or a tag someone gave themselves reads as "1 person added
        // this" — true of the number, misleading about the claim.
        const others = corroborations(tag);
        const who = onlySelfDeclared(tag)
          ? "Says this about themselves"
          : others === 1
            ? "1 person added this"
            : `${others} people added this`;
        const notes = [
          // A tag the subject also claims is different from one only others say.
          tag.selfDeclared && others > 0 ? "also says it themselves" : "",
          tag.subjectDisagreed ? "they disagree" : "",
          tag.myStance === "dispute" ? "you disagreed" : "",
        ].filter(Boolean);
        const stanceNote = notes.length ? ` · ${notes.join(" · ")}` : "";
        // Floor B: after you take your own tag back it must stay visible and
        // honest rather than vanishing. Uncounted tags render faded.
        const faded = !tag.counted;
        let authorNpub = "";
        try { authorNpub = npubFromPubkey(tag.authorPubkey); } catch { /* unlinkable */ }

        const chip = (
          <Chip
            key={tag.key}
            tone={onlySelfDeclared(tag) ? "slate" : tag.myStance === "apply" ? "accent" : "brand"}
            title={(tag.description ? `${who} — ${tag.description}` : who) + stanceNote}
            data-testid="share-tag-chip"
            data-self-declared={onlySelfDeclared(tag) ? "true" : undefined}
            data-counted={tag.counted ? "true" : "false"}
            className={[
              authorNpub ? "transition-opacity hover:opacity-80" : "",
              faded ? "opacity-50" : "",
            ].filter(Boolean).join(" ") || undefined}
          >
            {tag.name}
            {others > 1 && (
              <span className="opacity-60 tabular-nums">{others}</span>
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
      {canTag && pubkey && (
        <TagPersonButton pubkey={pubkey} isOwner={isOwner} legacyRoles={legacyRoles} />
      )}
      {/* Owner-only shortcut to the one place that lists every tag on them AND
          everything they've said about others. Not on someone else's profile —
          there's nothing of yours to manage there. */}
      {isOwner && canTag && tags.length > 0 && (
        <Link
          href="/settings?tab=tags"
          className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-brand-primary dark:text-slate-500"
          data-testid="share-tags-manage"
        >
          Manage
        </Link>
      )}
    </div>
  );
}
