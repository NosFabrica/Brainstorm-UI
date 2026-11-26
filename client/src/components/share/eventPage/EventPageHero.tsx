/**
 * The event itself, on its page: the hero lib/kindSurfaces chose for it, or
 * the generic page — its media and words, or its structural card when it has
 * no words to read. One component per hero id; the registry decides which.
 */
import type { ReactNode } from "react";
import type { EventHeroId, PageSurface } from "@/lib/kindSurfaces";
import type { MinimalEvent } from "@/lib/noteRefs";
import { CHAT_KINDS } from "@/lib/chatMessage";
import { contentWarningOf } from "@/lib/nip36";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { NoteContent } from "@/components/share/NoteContent";
import { AppHero } from "@/components/share/AppHero";
import { FileHero } from "@/components/share/FileHero";
import { RepoHero } from "@/components/share/RepoHero";
import { GitItemHero } from "@/components/share/GitItemHero";
import { GitReplyHero, GitStatusHero, RepoStateHero } from "@/components/share/GitEventHero";
import { ReleaseHero } from "@/components/share/ReleaseHero";
import { FollowSetHero } from "@/components/share/FollowSetHero";
import { TrustedListHero } from "@/components/share/TrustedListHero";
import { ItemListHero } from "@/components/share/ItemListHero";
import { DesignationHero } from "@/components/share/DesignationHero";
import { StructuralHero } from "@/components/share/StructuralHero";
import { DListHero } from "@/components/share/DListHero";
import { DListHeaderHero } from "@/components/share/DListHeaderHero";
import { AudioHero } from "@/components/share/AudioHero";
import { EventMedia } from "@/components/share/EventMedia";
import { SensitiveRevealScope } from "@/components/share/SensitiveMedia";
import { EmojiText } from "@/components/ui/custom-emoji";
import { ListingHero } from "@/components/share/ListingHero";
import { ThingHero } from "@/components/share/things";
import { ActivityHero } from "@/components/share/activity";
import { EventHero } from "@/components/share/EventHero";
import { VideoHero } from "@/components/share/VideoHero";
import { HighlightHero } from "@/components/share/HighlightQuote";
import { LiveHero } from "@/components/share/LiveHero";
import { MeetingHero } from "@/components/share/MeetingHero";
import { RelayListHero } from "@/components/share/RelayListHero";
import { UserStatusHero } from "@/components/share/UserStatusHero";
import { WebBookmarkHero } from "@/components/share/WebBookmarkHero";
import { ChatContextLine } from "@/components/share/ChatContext";
import type { EventPageMedia } from "./useEventMedia";

type ProfileLite = { display_name?: string; name?: string; picture?: string; nip05?: string; website?: string };

export interface EventPageHeroProps {
  note: MinimalEvent;
  surface: Pick<PageSurface, "hero" | "structural">;
  /** The signer's profile, and the name the page calls them. */
  profile: ProfileLite;
  authorName: string;
  /** What the note's words quote and mention, for the note card. */
  profiles: Map<string, ProfileLite>;
  eventsById: Map<string, MinimalEvent>;
  addrByCoord: Map<string, MinimalEvent>;
  relayHints: string[];
  media: EventPageMedia;
  /**
   * An item of a Dictionary concept, drawn by tier three (docs/adr/0007): its page
   * (ItemPage) plugs in from above, as tier two never imports it.
   */
  itemPage: ReactNode;
}

/** Each hero, drawn: the components the registry's ids name. */
const HEROES: Record<EventHeroId, (p: EventPageHeroProps) => ReactNode> = {
  dlist: ({ note }) => <DListHero event={note} />,
  // Any other list's header: the list and its items, its tags behind "Advanced view".
  "dlist-header": ({ note }) => <DListHeaderHero event={note} />,
  // An item of a Dictionary concept: its concept's own page (ADR 0007), else drawn from its definition (ADR 0004).
  "dictionary-item": ({ itemPage }) => itemPage,
  "git-item": ({ note, profile }) => (
    <GitItemHero
      event={note}
      author={{
        name: profile.name,
        displayName: profile.display_name,
        bot: (profile as { bot?: boolean }).bot === true,
      }}
    />
  ),
  live: ({ note }) => <LiveHero event={note} />,
  // A NIP-53 meeting space or a meeting in one: its state, its way in, its people and their roles.
  meeting: ({ note }) => <MeetingHero event={note} />,
  "relay-list": ({ note }) => <RelayListHero event={note} />,
  "user-status": ({ note }) => <UserStatusHero event={note} />,
  "web-bookmark": ({ note }) => <WebBookmarkHero event={note} />,
  app: ({ note }) => <AppHero event={note} />,
  // Any file: an installer offered for download, a picture, video or sound drawn as what it is.
  file: ({ note }) => <FileHero event={note} />,
  repo: ({ note }) => <RepoHero event={note} />,
  // A NIP-34 status: what it set, on which issue, patch or PR.
  "git-status": ({ note }) => <GitStatusHero event={note} />,
  "repo-state": ({ note }) => <RepoStateHero event={note} />,
  // A reply from before NIP-34 moved replies to NIP-22 comments.
  "git-reply": ({ note }) => <GitReplyHero event={note} />,
  release: ({ note }) => <ReleaseHero event={note} />,
  "follow-set": ({ note }) => <FollowSetHero event={note} />,
  "trusted-list": ({ note }) => <TrustedListHero event={note} />,
  designation: ({ note }) => <DesignationHero event={note} />,
  // Bookmarks, bookmark sets, curation sets, pins: the things it holds.
  "item-list": ({ note }) => <ItemListHero event={note} />,
  // A track, a podcast episode or trailer, a voice message, an audio header.
  audio: ({ note }) => <AudioHero event={note} />,
  listing: ({ note, authorName }) => <ListingHero event={note} sellerName={authorName} />,
  calendar: ({ note }) => <EventHero event={note} />,
  // Zaps, reactions, deletions, reports, labels, votes, RSVPs, follows, trust scores.
  // Keyed by the event: a reveal or an open fold is that event's, never the next one's.
  activity: ({ note }) => <ActivityHero key={note.id} event={note} />,
  // Communities, fundraisers, reviews, shops, apps, calendars,
  // badges, emoji packs, playlists, lessons, torrents (lib/thing).
  thing: ({ note }) => <ThingHero event={note} />,
  video: ({ note, profile }) => <VideoHero event={note} nip05={profile.nip05} />,
  // A NIP-84 highlight: the passage marked in its paragraph, and the text it is from.
  highlight: ({ note }) => <HighlightHero event={note} />,
  note: ({ note, profiles, eventsById, addrByCoord, relayHints, media }) => (
    <SensitiveRevealScope key={note.id}>
      {CHAT_KINDS.has(note.kind) && <ChatContextLine event={note} className="mb-3" />}
      <ShareNoteCard
        event={note}
        profiles={profiles}
        eventsById={eventsById}
        addrByCoord={addrByCoord}
        forceExpanded
        reading
        relayHints={relayHints}
      />
      {/* A file only its imeta names (a comment's voice clip): the text never draws it. */}
      {media.imetaOnly.length > 0 && (
        <div className="mt-3">
          <EventMedia key={note.id} event={note} items={media.imetaOnly} />
        </div>
      )}
    </SensitiveRevealScope>
  ),
};

export function EventPageHero(props: EventPageHeroProps) {
  const { note, surface, profile, profiles, media } = props;
  if (surface.hero) return <>{HEROES[surface.hero](props)}</>;
  // No content to read — none, or ciphertext, or JSON: a structural event, its meaning in its tags.
  if (surface.structural) return <StructuralHero event={note} />;
  return (
    <div data-testid="event-media">
      {media.title && (
        <h1
          className="mb-3 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="event-media-title"
        >
          <EmojiText text={media.title} tags={note} />
        </h1>
      )}
      <SensitiveRevealScope key={note.id}>
        <EventMedia event={note} items={media.items} />
        {note.content?.trim() && (
          <div className="mt-1">
            <NoteContent
              key={note.id}
              content={note.content}
              reading
              profiles={profiles}
              linkCard
              tags={note.tags}
              authorName={profile.display_name || profile.name}
              embedThings
              contentWarning={contentWarningOf(note)}
              skipUrls={media.urls}
            />
          </div>
        )}
      </SensitiveRevealScope>
    </div>
  );
}
