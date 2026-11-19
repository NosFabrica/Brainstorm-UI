import { useState } from "react";
import { Link } from "wouter";
import { Chip } from "@/components/ui/chip";
import { TagPersonButton } from "@/components/share/TagPersonButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProfileTags } from "@/hooks/useTags";
import { npubFromPubkey } from "@/lib/shareId";
import { corroborations, onlySelfDeclared } from "@/lib/tagCounts";
import { ONLY_YOU_SEE_IT, onlyViewerSees } from "@/components/share/tagCopy";

/**
 * "Tagged as": the network's tags on the public profile, and the way to add
 * one. Distinct from the owner's own "What you do" role chips: those were
 * self-declared, these are what *other* people say, counted from the trust
 * perspective.
 *
 * The same row a post has (NoteTagChips): label, chips, then the dashed "Tag
 * this profile" button for a viewer who can sign. With nothing to show and no
 * way to add, it renders nothing; no skeleton.
 *
 * Each chip links to its tag page (`/tags/:author/:slug`) — the list of everyone
 * carrying it, which is what makes a tag legible as a list rather than a label.
 */
/**
 * How many tags the row carries before the rest go behind "+N more". The row
 * sits in the identity block, above the facts a visitor came for, so it shows
 * the best-supported few (the service sorts them: counted first, most vouched
 * first) and opens the rest in place. Six fill one line of a desktop profile;
 * on a phone a chip takes about a third of a line, so four keep it to two.
 */
const SHOWN = { wide: 6, phone: 4 };

export function ProfileTagChips({
  pubkey,
  canTag = false,
  isOwner = false,
  legacyRoles,
}: {
  pubkey: string | undefined;
  /** The viewer is signed in AND holds a signer — gates the tag button and the owner's Manage link. */
  canTag?: boolean;
  /** Viewing their own profile. */
  isOwner?: boolean;
  /** What the owner listed under the retired "What you do", offered in the picker (TagPersonButton). */
  legacyRoles?: string[];
}) {
  const { data } = useProfileTags(pubkey);
  const tags = data?.tags ?? [];
  const [expanded, setExpanded] = useState(false);
  const limit = useIsMobile() ? SHOWN.phone : SHOWN.wide;
  // Never behind "more": a tag of the viewer's own, or one still publishing. It is the chip
  // they look for, and hidden it reads as "it didn't work".
  const collapsed = tags.filter((tag, i) => i < limit || !!tag.myStance || !!tag.pending);
  // Hiding one tag behind a button the size of a tag saves nothing.
  const hidden = tags.length - collapsed.length > 1 ? tags.length - collapsed.length : 0;
  const shown = expanded || !hidden ? tags : collapsed;
  const tagButton =
    canTag && pubkey ? <TagPersonButton pubkey={pubkey} isOwner={isOwner} legacyRoles={legacyRoles} /> : null;

  if (!tags.length && !tagButton) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="share-tags">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Tagged as
      </span>
      {shown.map((tag) => {
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
        const who = onlyViewerSees(tag)
          ? ONLY_YOU_SEE_IT
          : onlySelfDeclared(tag)
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
        const pendingNote = tag.pending ? " · Publishing…" : "";
        // Floor B: after you take your own tag back it must stay visible and
        // honest rather than vanishing. Uncounted tags render faded.
        const faded = !tag.counted;
        let authorNpub = "";
        try {
          authorNpub = npubFromPubkey(tag.authorPubkey);
        } catch {
          /* unlinkable */
        }

        const chip = (
          <Chip
            key={tag.key}
            tone={onlySelfDeclared(tag) ? "slate" : tag.myStance === "apply" ? "accent" : "brand"}
            title={(tag.description ? `${who} — ${tag.description}` : who) + stanceNote + pendingNote}
            data-testid="share-tag-chip"
            data-self-declared={onlySelfDeclared(tag) ? "true" : undefined}
            data-counted={tag.counted ? "true" : "false"}
            data-pending={tag.pending ? "true" : undefined}
            className={
              [
                authorNpub ? "transition-opacity hover:opacity-80" : "",
                faded ? "opacity-50" : "",
                // Not yet on the relays: a little lighter, until they answer.
                tag.pending ? "opacity-60" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          >
            {tag.name}
            {others > 1 && <span className="tabular-nums opacity-60">{others}</span>}
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
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="rounded-full px-1.5 py-0.5 text-xs font-semibold text-brand-link underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid="share-tags-more"
        >
          {expanded ? "Show less" : `+${hidden} more`}
        </button>
      )}
      {tagButton}
      {/* Owner-only shortcut to the one place that lists every tag on them AND
          everything they've said about others. Not on someone else's profile —
          there's nothing of yours to manage there. */}
      {isOwner && canTag && tags.length > 0 && (
        <Link
          href="/tags/mine"
          className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-brand-primary dark:text-slate-500"
          data-testid="share-tags-manage"
        >
          Manage
        </Link>
      )}
    </div>
  );
}
