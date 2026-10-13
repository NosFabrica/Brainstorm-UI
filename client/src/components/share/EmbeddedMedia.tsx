/**
 * The media a quoted event IS, inside the note card that quotes it: a video
 * event's poster and player, a picture post's pictures, a voice message's
 * player. Built from the pieces the Media tab's card plays them with
 * (FeedVideo, MediaImg, EmbeddedTrackCard), and covered the same way when
 * their creator marked them sensitive (lib/nip36): nothing of a flagged
 * video or picture loads until the reader asks for it.
 *
 * The caller keys each on the event, so a reveal never carries to another one.
 */
import { useMemo, useState } from "react";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { FeedVideo, feedVideoFrame } from "@/components/share/FeedVideo";
import { useLightbox } from "@/components/share/Lightbox";
import { SensitiveCover, SensitiveTile } from "@/components/share/SensitiveMedia";
import { EmojiText } from "@/components/ui/custom-emoji";
import { MediaImg } from "@/components/ui/media-img";
import { embedAudioUrl, embedPictures, taggedVideoUrl } from "@/lib/embedShape";
import { kindLabel } from "@/lib/kindLabel";
import { mediaPosterOf } from "@/lib/mediaKind";
import { contentWarningOf } from "@/lib/nip36";
import { SHORT_VIDEO_KINDS, readVideo } from "@/lib/nip71";
import type { MinimalEvent } from "@/lib/noteRefs";

/** How many pictures a quote shows; the rest are counted on the last. */
const PICTURES_SHOWN = 4;

const tagVal = (event: MinimalEvent, name: string) => event.tags.find((t) => t[0] === name)?.[1]?.trim() || undefined;

/** The words that go with the media: its title, else its text without the links (the media is the link). */
function captionOf(event: MinimalEvent): string {
  return (tagVal(event, "title") ?? event.content ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function Caption({ event }: { event: MinimalEvent }) {
  const caption = captionOf(event);
  if (!caption) return null;
  return (
    <p
      className="line-clamp-3 break-words text-[14px] text-slate-800 dark:text-slate-200"
      data-testid="embedded-caption"
    >
      <EmojiText text={caption} tags={event} />
    </p>
  );
}

/** A NIP-71 video (or a video file) whose tags name its file: the poster, then the player. */
export function EmbeddedVideo({ event }: { event: MinimalEvent }) {
  const url = taggedVideoUrl(event);
  const poster = mediaPosterOf(event);
  const warning = contentWarningOf(event);
  const [shown, setShown] = useState(false);
  const dim = useMemo(() => readVideo(event).dim, [event]);
  // The cover stands in the frame the player will take, so "Show video" moves nothing under it.
  const frame = feedVideoFrame(dim);
  if (!url) return null;
  return (
    <div data-testid="embedded-video">
      <Caption event={event} />
      {warning && !shown ? (
        frame ? (
          <div
            className={`mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 ${frame.className}`}
            style={frame.style}
          >
            <SensitiveCover reason={warning.reason} onShow={() => setShown(true)} className="h-full w-full" />
          </div>
        ) : (
          <SensitiveCover
            reason={warning.reason}
            onShow={() => setShown(true)}
            className="mt-2 aspect-video w-full rounded-xl border border-slate-200 dark:border-slate-800"
          />
        )
      ) : (
        <FeedVideo
          src={url}
          poster={poster ?? undefined}
          autoFocus={shown}
          dim={dim}
          loop={SHORT_VIDEO_KINDS.has(event.kind)}
        />
      )}
    </div>
  );
}

/**
 * A picture post (kind 20) or an image file (1063): its pictures, one large
 * or up to four in a grid. In a card that opens on a click (`opensThread`)
 * a picture is a thumbnail whose click opens the post; otherwise it opens the
 * lightbox. A flagged picture is a "Sensitive" tile until it is asked for.
 */
export function EmbeddedPictures({ event, opensThread = false }: { event: MinimalEvent; opensThread?: boolean }) {
  const urls = useMemo(() => embedPictures(event), [event]);
  const warning = contentWarningOf(event);
  const [shown, setShown] = useState(false);
  const openLightbox = useLightbox();
  const covered = !!warning && !shown;
  const tiles = urls.slice(0, PICTURES_SHOWN);
  const more = urls.length - tiles.length;
  const single = tiles.length === 1;
  return (
    <div data-testid="embedded-pictures">
      <Caption event={event} />
      <div className={`mt-2 grid gap-1 overflow-hidden rounded-xl ${single ? "grid-cols-1" : "grid-cols-2"}`}>
        {tiles.map((url, i) => {
          const box = `relative overflow-hidden border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 ${single ? "aspect-[16/10] max-h-80 rounded-xl" : "aspect-square"}`;
          if (covered)
            return (
              <button
                key={url}
                type="button"
                className={box}
                onClick={() => setShown(true)}
                aria-label={warning?.reason ? `Show sensitive picture: ${warning.reason}` : "Show sensitive picture"}
                data-testid="embedded-picture-sensitive"
              >
                <SensitiveTile className="absolute inset-0" />
              </button>
            );
          return (
            <div
              key={url}
              className={box}
              {...(opensThread
                ? {}
                : {
                    "data-noopen": true,
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      openLightbox(urls, i);
                    },
                  })}
            >
              <MediaImg
                src={url}
                preset="media_640"
                alt=""
                loading="lazy"
                className={`h-full w-full object-cover ${opensThread ? "" : "cursor-zoom-in"}`}
                data-testid="embedded-picture"
              />
              {more > 0 && i === tiles.length - 1 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">
                  +{more}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A voice message or an audio file: one player row. */
export function EmbeddedAudio({ event, artist, href }: { event: MinimalEvent; artist?: string; href?: string }) {
  const audio = embedAudioUrl(event);
  if (!audio) return null;
  return (
    <div className="mt-1" data-noopen data-testid="embedded-audio">
      <EmbeddedTrackCard
        id={`embed:${event.id}`}
        title={tagVal(event, "title") ?? kindLabel(event)}
        artist={artist}
        cover={tagVal(event, "image")}
        audio={audio}
        href={href}
      />
    </div>
  );
}
