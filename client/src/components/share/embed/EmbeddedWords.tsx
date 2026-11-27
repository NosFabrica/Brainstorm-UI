import { NoteContent } from "@/components/share/NoteContent";
import { LazyPollCard } from "@/components/share/LazyPollCard";
import { WebBookmarkLink } from "@/components/share/WebBookmarkHero";
import { EmojiText } from "@/components/ui/custom-emoji";
import { contentWarningOf, revealKeyOf } from "@/lib/nip36";
import { noteHeadingOf, type MinimalEvent } from "@/lib/noteRefs";
import { POLL_KINDS } from "@/lib/pollKinds";
import type { WebBookmark } from "@/lib/webBookmark";
import { nameIn } from "@/lib/displayName";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

/**
 * A quote that is words: a web bookmark's link first, a NIP-7D thread's title
 * (a note's NIP-14 subject) as its heading, its words — what they link and
 * quote drawn as cards by the card around it, so not again as links here
 * (`embeddedCoords`, `embeddedIds`) — and a poll's options under its question.
 */
export function EmbeddedWords({
  event,
  author,
  profiles,
  href,
  bookmark,
  embeddedCoords,
  embeddedIds,
}: {
  event: MinimalEvent;
  author?: ProfileLite;
  profiles?: Map<string, ProfileLite>;
  href?: string;
  bookmark: WebBookmark | null;
  embeddedCoords: ReadonlySet<string>;
  embeddedIds: ReadonlySet<string>;
}) {
  return (
    <div className="line-clamp-5 text-[14px]">
      {bookmark && <WebBookmarkLink bookmark={bookmark} className="mb-1" />}
      {/* A NIP-7D thread's `title` (a note's NIP-14 subject) heads it, as on its own page. */}
      {noteHeadingOf(event) && (
        <p
          className="mb-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
          data-testid="embedded-heading"
        >
          <EmojiText text={noteHeadingOf(event)!} tags={event} />
        </p>
      )}
      <NoteContent
        key={revealKeyOf(event)}
        content={event.content}
        compact
        profiles={profiles}
        imageOpensThread={!!href}
        tags={event.tags}
        contentWarning={contentWarningOf(event)}
        authorName={nameIn(author)}
        embeddedCoords={embeddedCoords}
        embeddedIds={embeddedIds}
      />
      {/* A poll's options under its question (NIP-88 `option`, a zap poll's `poll_option`): read-only, no tally. */}
      {POLL_KINDS.has(event.kind) && <LazyPollCard event={event} compact />}
    </div>
  );
}
