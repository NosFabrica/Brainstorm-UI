import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  parseNoteContent,
  primaryLink,
  extractImageUrls,
  extractNoteTitle,
  toPlayableStreamUrl,
  type NoteToken,
} from "@/lib/noteContent";
import { ReadingText, ReadingLink, addressLink, addressLabel } from "@/components/share/ReadingText";
import { EMBEDDED_THING_KINDS, ThingAddressRef } from "@/components/share/ThingAddressRef";
import { normalizeMarkup } from "@/lib/htmlText";
import { addrCoord, decodeNostrEntity } from "@/lib/noteRefs";
import { useShareNav } from "@/components/share/ShareNavContext";
import { LinkChip, LinkPreviewCard } from "@/components/share/LinkPreview";
import { VideoEmbed, videoEmbedFor } from "@/components/share/VideoEmbed";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { FeedVideo } from "@/components/share/FeedVideo";
import { SensitiveCover, SensitiveTile, useSensitiveReveal } from "@/components/share/SensitiveMedia";
import { withTypedFiles } from "@/lib/mediaKind";
import type { ContentWarning } from "@/lib/nip36";
import { LiveVideoPlayer } from "@/components/share/LiveVideoPlayer";
import { WavlakeTrackCard } from "@/components/share/WavlakeTrackCard";
import { wavlakeTrackId } from "@/lib/wavlake";
import { FountainCard } from "@/components/share/FountainCard";
import { fountainRef } from "@/lib/fountain";
import { ClientLink } from "@/components/share/ClientLink";
import { ProfileMention } from "@/components/share/ProfileMention";
import { clientRef } from "@/lib/clientLinks";
import { useClientLink } from "@/hooks/useClientLink";
import { useLightbox } from "@/components/share/Lightbox";
import { MediaImg } from "@/components/ui/media-img";
import { EmojiText } from "@/components/ui/custom-emoji";

/** Human-readable track name from a raw audio URL. Falls back to "Audio" for
 *  non-descriptive filenames (numeric ids, hashes/uuids) like `…/32939084.mp3`. */
function audioName(url: string): string {
  try {
    const last = (new URL(url).pathname.split("/").pop() || "").replace(/\.[a-z0-9]+$/i, "");
    const decoded = decodeURIComponent(last);
    const bare = decoded.replace(/[\s._-]+/g, "");
    if (!decoded || /^\d+$/.test(bare) || /^[0-9a-f]{16,}$/i.test(bare)) return "Audio";
    return decoded.replace(/[._-]+/g, " ").trim() || "Audio";
  } catch {
    return "Audio";
  }
}

/** Short host label for a media URL (e.g. "podhome.fm"), used as the track's source tag. */
function hostLabel(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * An inline live/HLS stream in a note: our click-to-play HLS player with a LIVE
 * badge. If the stream can't load (dead/geo-blocked), it degrades to a link chip.
 */
function NoteLiveVideo({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <LinkChip url={url} />;
  return (
    <div className="relative mt-2" data-testid="note-live">
      <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
      </span>
      <LiveVideoPlayer src={toPlayableStreamUrl(url)} onError={() => setFailed(true)} />
    </div>
  );
}

const NO_TAGS: string[][] = [];

type ProfileLite = { name?: string; display_name?: string; picture?: string };

/**
 * Renders parsed kind-1 note content: text, links, inline images/video,
 * `nostr:` mentions (resolved to @DisplayName when a profile map is provided),
 * and hashtags. Event references (nevent/note) render as a subtle marker since
 * the quoted note itself is shown as an embedded card by the caller.
 */
export function NoteContent({
  content,
  compact = false,
  reading = false,
  profiles,
  linkCard = false,
  imageOpensThread = false,
  tags = NO_TAGS,
  authorName,
  embeddedIds,
  embeddedCoords,
  embedThings = false,
  contentWarning,
  skipUrls,
}: {
  content: string;
  compact?: boolean;
  /** The note's own page: reader-sized type, real paragraphs and light
   *  markdown (headings, lists, quotes, code, emphasis). Feeds keep the
   *  compact pre-wrapped run. */
  reading?: boolean;
  profiles?: Map<string, ProfileLite>;
  /** Quoted events the card renders in full below — their inline stub would
   *  say "↳ quoted note" above the quote itself, so it leaves the prose. */
  embeddedIds?: ReadonlySet<string>;
  /** Articles (by coordinate) the caller shows as cards: their inline link is not repeated. */
  embeddedCoords?: ReadonlySet<string>;
  /** Draw an `naddr` to a prediction market or ballot as its card (ThingAddressRef).
   *  Top-level notes only — a quoted card's references stay links, one level deep. */
  embedThings?: boolean;
  /** Render a rich preview card for the primary link below the body. */
  linkCard?: boolean;
  /** In a clickable feed card: render images as cropped thumbnails whose click
   *  bubbles up to open the thread (instead of a lightbox). */
  imageOpensThread?: boolean;
  /** The event's tags — its NIP-30 emoji, and the audio player's artwork + title. */
  tags?: string[][];
  /** The note author's display name — shown as the audio player's "artist". */
  authorName?: string;
  /** The event's creator marked it sensitive (lib/nip36), whatever its kind — a note, a
   *  comment, a chat message, a video: each clip in its words is covered until the reader
   *  asks for it. Its pictures are too: one cover asks for them all when there is no clip,
   *  and beside a clip (a video's poster) each is a placeholder the clip's cover reveals. */
  contentWarning?: ContentWarning | null;
  /** Files the page draws beside these words (EventMedia, from the event's imeta): left out
   *  here, so each is drawn — and, when sensitive, covered and asked for — once. */
  skipUrls?: ReadonlySet<string>;
}) {
  // On the event's own page, whatever markup the text came in (HTML, a
  // GitHub comment's stray tags) is cleaned first; feeds keep the raw text.
  const text = useMemo(() => (reading ? normalizeMarkup(content) : content), [reading, content]);
  const tokens = useMemo(() => {
    // A link its imeta types as a picture, a clip or a sound (an extensionless Blossom file) is that file.
    const all = withTypedFiles(parseNoteContent(text), tags);
    return skipUrls?.size
      ? all.filter(
          (t) =>
            !(
              (t.type === "url" || t.type === "image" || t.type === "video" || t.type === "audio") &&
              skipUrls.has(t.value)
            ),
        )
      : all;
  }, [text, skipUrls, tags]);
  // Of several clips shown at once, the first is where focus goes.
  const firstClip = tokens.find((t) => t.type === "video")?.value;
  // A live stream is a clip too: its cover asks for the note's pictures beside it.
  const hasClip = !!firstClip || tokens.some((t) => t.type === "live");
  // Shared metadata for a rich audio/podcast player: the note's own image as
  // artwork and its title/first-line as the track name (falling back per-URL).
  const audioCover = extractImageUrls(text, tags)[0];
  const audioTitle = extractNoteTitle(text, tags);
  const requestNav = useShareNav();
  const openLightbox = useLightbox();
  const [, navigate] = useLocation();
  // The note's primary link gets a rich preview card below the body (not in
  // compact/embedded contexts). Inline URLs stay as compact favicon chips.
  const primaryUrl = primaryLink(tokens);
  // A Primal link names a Nostr entity; the card below is for links that
  // name nothing here. Asked unconditionally — the hook count must not move.
  const primaryRef = primaryUrl ? clientRef(primaryUrl) : null;
  const primaryEntity = useClientLink(primaryRef);
  const primaryIsPlainLink = !primaryRef || (primaryEntity.status === "done" && primaryEntity.entity === null);
  // All image URLs in this note — the set the lightbox carousels through.
  const imageUrls = tokens.filter((t) => t.type === "image").map((t) => (t as { value: string }).value);
  // What a cover would hide: a link drawn as a picture of its own (a YouTube still, a song's or
  // episode's art, a Nostr entity's card), and the primary link's preview picture.
  const degradable = (url: string) =>
    !!(wavlakeTrackId(url) || fountainRef(url) || videoEmbedFor(url) || clientRef(url));
  const showsLinkCard =
    !!primaryUrl &&
    linkCard &&
    primaryIsPlainLink &&
    !wavlakeTrackId(primaryUrl) &&
    !videoEmbedFor(primaryUrl) &&
    !fountainRef(primaryUrl);
  const drawsCover = imageUrls.length > 0 || hasClip;
  // A covered note whose only media are embeds or a link's picture: one "Show media" for them.
  const degradesOnly = !drawsCover && (tokens.some((t) => t.type === "url" && degradable(t.value)) || showsLinkCard);
  // One reveal for the post: beside its files (EventMedia), the first with something to cover asks.
  const reveal = useSensitiveReveal(!!contentWarning && (drawsCover || degradesOnly));
  const sensitiveShown = reveal.shown;
  const covered = !!contentWarning && !sensitiveShown;
  // Where the cover stood, focus goes once it is asked for: the button that had it is gone. A clip
  // focuses itself (FeedVideo); otherwise the first live stream, picture or restored embed.
  const focusIndex =
    !!contentWarning && sensitiveShown && reveal.leads && !firstClip
      ? tokens.findIndex(
          (t) =>
            t.type === "live" ||
            (!hasClip && t.type === "image") ||
            (degradesOnly && t.type === "url" && degradable(t.value)),
        )
      : -1;
  const revealedRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (focusIndex >= 0) revealedRef.current?.focus();
  }, [focusIndex]);
  // A covered note with no clip asks for its pictures on the first one; the rest wait beside it.
  // Beside a cover drawn elsewhere in the post, each waits as a tile.
  const imageCover = covered && !hasClip && reveal.leads ? imageUrls[0] : undefined;
  const clipCover = (key: number | string) =>
    reveal.leads ? (
      <SensitiveCover
        key={key}
        reason={contentWarning?.reason}
        onShow={reveal.show}
        className="mt-2 aspect-video w-full rounded-xl border border-slate-200 dark:border-slate-800"
      />
    ) : (
      <SensitiveTile
        key={key}
        className="mt-2 aspect-video w-full rounded-xl border border-slate-200 dark:border-slate-800"
      />
    );
  /** While covered, a link that would draw a picture (a YouTube still, a song's or episode's art,
   *  a Nostr entity's card) is only a link. */
  const plainLink = (url: string, key: number | string) =>
    reading ? <ReadingLink key={key} url={url} /> : <LinkChip key={key} url={url} />;
  const renderToken = (token: NoteToken, i: number | string): ReactNode => {
    const node = drawToken(token, i);
    // The token the cover stood on: where focus lands once the reader asked.
    return focusIndex >= 0 && token === tokens[focusIndex] ? (
      <span key={i} ref={revealedRef} tabIndex={-1} className="block focus:outline-none" data-testid="note-revealed">
        {node}
      </span>
    ) : (
      node
    );
  };
  const drawToken = (token: NoteToken, i: number | string): ReactNode => {
    switch (token.type) {
      case "text":
        return (
          <span key={i}>
            <EmojiText text={token.value} tags={tags} />
          </span>
        );
      case "url":
        if (covered && degradable(token.value)) return plainLink(token.value, i);
        if (wavlakeTrackId(token.value)) return <WavlakeTrackCard key={i} url={token.value} />;
        if (fountainRef(token.value)) return <FountainCard key={i} url={token.value} />;
        if (videoEmbedFor(token.value)) return <VideoEmbed key={i} url={token.value} />;
        if (clientRef(token.value)) return <ClientLink key={i} url={token.value} />;
        return reading ? <ReadingLink key={i} url={token.value} /> : <LinkChip key={i} url={token.value} />;
      case "audio":
        return (
          <div key={i} className="mt-2">
            <EmbeddedTrackCard
              id={`audio:${token.value}`}
              title={audioTitle || audioName(token.value)}
              artist={authorName}
              // A covered note's picture is not the art of its sound, here or in the player bar.
              cover={covered ? undefined : audioCover}
              audio={token.value}
              sourceLabel={hostLabel(token.value)}
            />
          </div>
        );
      case "image": {
        if (covered)
          return token.value === imageCover ? (
            <SensitiveCover
              key={i}
              reason={contentWarning?.reason}
              onShow={reveal.show}
              subject="photo"
              count={imageUrls.length}
              className="mt-2 aspect-[16/10] max-h-72 w-full rounded-xl border border-slate-200 dark:border-slate-800"
            />
          ) : (
            <SensitiveTile
              key={i}
              className="mt-2 aspect-[16/10] max-h-72 w-full rounded-xl border border-slate-200 dark:border-slate-800"
            />
          );
        const picture = imageOpensThread ? (
          // Clickable feed card: a tidy cropped thumbnail; the click bubbles
          // up to the card and opens the thread (full image + zoom live there).
          // A fixed box, so the card is its final height before the
          // image lands and the rows below it never move.
          <div
            key={i}
            className="mt-2 aspect-[16/10] max-h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
          >
            <MediaImg
              src={token.value}
              preset="media_640"
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <MediaImg
            key={i}
            src={token.value}
            preset="media_1280"
            alt=""
            loading="lazy"
            data-noopen
            onClick={(e) => {
              e.stopPropagation();
              openLightbox(imageUrls, Math.max(0, imageUrls.indexOf(token.value)));
            }}
            className={`mt-2 w-full cursor-zoom-in rounded-xl border border-slate-200 bg-slate-50 object-contain dark:border-slate-800 dark:bg-slate-900 ${compact ? "max-h-[28rem]" : "max-h-[34rem]"}`}
          />
        );
        return picture;
      }
      case "video":
        if (covered) return clipCover(i);
        return (
          <FeedVideo
            key={i}
            src={token.value}
            autoFocus={!!contentWarning && sensitiveShown && reveal.leads && token.value === firstClip}
          />
        );
      case "live":
        if (covered) return clipCover(i);
        return <NoteLiveVideo key={i} url={token.value} />;
      case "mention": {
        const { pubkey, id, address } = decodeNostrEntity(token.bech32);
        if (address) {
          // Shown as a card by the caller? Then the card IS the link.
          if (embeddedCoords?.has(addrCoord(address))) return null;
          if (embedThings && EMBEDDED_THING_KINDS.has(address.kind))
            return <ThingAddressRef key={i} address={address} bech32={token.bech32} url={token.url} />;
          const other = reading ? addressLink(token.bech32, i, token.url) : null;
          if (other) return other;
          // Links to its on-site page (/e/ renders every kind); an article
          // is also embedded as a card below.
          return (
            <button
              key={i}
              type="button"
              onClick={() => navigate(`/e/${token.bech32}`)}
              className="font-medium text-brand-link hover:underline"
            >
              {addressLabel(token.bech32)}
            </button>
          );
        }
        if (pubkey) {
          const prof = profiles?.get(pubkey);
          return (
            <ProfileMention
              key={i}
              npub={token.bech32}
              name={prof?.display_name || prof?.name}
              picture={prof?.picture}
            />
          );
        }
        if (id) {
          // Embedded as a card below? Then the card IS the quote.
          if (embeddedIds?.has(id)) return null;
          // Links to the on-site event page.
          return (
            <button
              key={i}
              type="button"
              onClick={() => navigate(`/e/${token.bech32}`)}
              className="font-medium text-brand-link hover:underline"
            >
              ↳ quoted note
            </button>
          );
        }
        return (
          <span key={i} className="font-medium text-brand-link">
            @{token.bech32.slice(0, 10)}…
          </span>
        );
      }
      case "hashtag":
        return (
          <button
            key={i}
            type="button"
            // Isolated, so "#Bitcoin" keeps its # in front inside an
            // Arabic sentence (and "#البيتكوين" inside an English one).
            dir="auto"
            onClick={() => requestNav({ kind: "hashtag", target: token.value, label: token.value })}
            className="font-medium text-brand-link hover:underline"
          >
            {token.value}
          </button>
        );
      default:
        return null;
    }
  };
  const linkCardNode =
    showsLinkCard && primaryUrl ? (
      <LinkPreviewCard
        url={primaryUrl}
        showImage={!covered && !tokens.some((t) => t.type === "image" || t.type === "video")}
        sensitive={covered}
        context={text}
      />
    ) : null;
  // The one way to ask for what the cover degraded, when no picture or clip drew a cover.
  const showMedia =
    covered && degradesOnly && reveal.leads ? (
      <SensitiveCover
        reason={contentWarning?.reason}
        onShow={reveal.show}
        subject="media"
        className="mt-2 w-full whitespace-normal rounded-xl border border-slate-200 dark:border-slate-800"
      />
    ) : null;
  const after =
    linkCardNode || showMedia ? (
      <>
        {linkCardNode}
        {showMedia}
      </>
    ) : null;

  if (reading) {
    return (
      <ReadingText
        tokens={tokens}
        source={text}
        tags={tags}
        size="post"
        renderToken={renderToken}
        after={after}
        testId="note-reading"
      />
    );
  }

  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
      {tokens.map((token, i) => renderToken(token, i))}
      {after}
    </div>
  );
}
