/**
 * The files an event carries, on its page, each drawn as what it is (lib/mediaKind
 * `mediaItemsOf`): a picture as a picture, with the publisher's `alt` under it and
 * its `dim` holding the frame before it loads; a video as a player; a sound as
 * the shared audio player — never as a broken picture. The page's fallback for
 * a kind with no hero of its own (a kind-20 picture post among them), and a
 * media file's preview (FileHero).
 *
 * Media its creator marked sensitive (NIP-36) is one cover until the reader
 * asks, then all of it shows and focus moves to it. A sound is never covered —
 * there is nothing to see — but plays without its art meanwhile. Beside the
 * post's words (a SensitiveRevealScope), the post asks once: when its words
 * already drew the cover, the files wait under a quiet tile and show with them.
 */
import { useEffect, useRef } from "react";
import type { MinimalEvent } from "@/lib/noteRefs";
import { mediaPosterOf, type MediaItem } from "@/lib/mediaKind";
import { contentWarningOf } from "@/lib/nip36";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import { useLightbox } from "@/components/share/Lightbox";
import {
  SensitiveCover,
  SensitiveTile,
  useSensitiveReveal,
  type SensitiveSubject,
} from "@/components/share/SensitiveMedia";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { EmojiText } from "@/components/ui/custom-emoji";

const FRAME = "max-h-[36rem] w-full rounded-xl border border-slate-200 dark:border-slate-800";

/** The cover's words for what it hides: one kind of media, or a mix. */
function subjectOf(items: MediaItem[]): SensitiveSubject {
  const kinds = new Set(items.map((i) => i.kind));
  if (kinds.size === 1 && kinds.has("photo")) return "photo";
  if (kinds.size === 1 && kinds.has("video")) return "video";
  return "media";
}

export function EventMedia({ event, items }: { event: MinimalEvent; items: MediaItem[] }) {
  const speed = useConnectionSpeed();
  const openLightbox = useLightbox();
  const warning = contentWarningOf(event);
  // What a cover hides: the pictures and clips. A sound has nothing to see.
  const visual = items.filter((i) => i.kind !== "audio");
  // The callers key this on the event, so a reveal never carries to another one.
  const reveal = useSensitiveReveal(!!warning && visual.length > 0);
  const covered = !!warning && !reveal.shown;
  const frameRef = useRef<HTMLDivElement>(null);
  const focusOnShow = !!warning && reveal.shown && reveal.leads && visual.length > 0;
  useEffect(() => {
    if (focusOnShow) frameRef.current?.focus();
  }, [focusOnShow]);
  if (items.length === 0) return null;

  // The lightbox carousels through the pictures alone.
  const images = items.filter((i) => i.kind === "photo").map((i) => i.url);
  const content = event.content.trim();
  const title = event.tags.find((t) => t[0] === "title")?.[1]?.trim();
  const poster = mediaPosterOf(event) ?? undefined;
  const audioRow = (item: MediaItem) => (
    <div key={item.url} className="mb-2" data-testid="event-media-audio">
      <EmbeddedTrackCard
        id={`event:${event.id}:${item.url}`}
        title={item.alt || title || "Audio"}
        // Art its creator marked sensitive is not drawn, nor handed to the player bar, until asked for.
        cover={!covered && poster !== item.url ? poster : undefined}
        audio={item.url}
        // Its imeta's `duration`: the player says it without loading the file to ask.
        durationSec={item.durationSec}
      />
    </div>
  );

  if (covered) {
    // In the shape the first picture or clip will take, when its `dim` says it: showing it moves nothing below.
    const sized = visual[0]?.dim;
    const frame = {
      style: sized ? { aspectRatio: `${sized.w} / ${sized.h}` } : undefined,
      className: `mb-2 ${sized ? "" : "aspect-video"} ${FRAME}`,
    };
    return (
      <div data-testid="event-media-items">
        {visual.length > 0 &&
          (reveal.leads ? (
            <SensitiveCover
              reason={warning?.reason}
              onShow={reveal.show}
              subject={subjectOf(visual)}
              count={visual.length}
              style={frame.style}
              className={frame.className}
            />
          ) : (
            <div style={frame.style} className={`overflow-hidden ${frame.className}`}>
              <SensitiveTile className="h-full w-full" />
            </div>
          ))}
        {items.filter((i) => i.kind === "audio").map(audioRow)}
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      tabIndex={focusOnShow ? -1 : undefined}
      className="focus:outline-none"
      data-testid="event-media-items"
    >
      {items.map((item) => {
        const ratio = item.dim ? { aspectRatio: `${item.dim.w} / ${item.dim.h}` } : undefined;
        if (item.kind === "video")
          return (
            <video
              key={item.url}
              src={item.url}
              // Its own still (imeta `image`), else the event's when this is its one file.
              poster={item.poster ?? (items.length === 1 ? poster : undefined)}
              controls
              preload={videoPreload(speed)}
              style={ratio}
              className={`mb-2 bg-black ${FRAME}`}
            />
          );
        if (item.kind === "audio") return audioRow(item);
        // The alt is said under the picture unless it only repeats the post's words.
        const caption = item.alt && item.alt !== content && item.alt !== title ? item.alt : null;
        return (
          <figure key={item.url} className="mb-2">
            <img
              src={item.url}
              alt={item.alt ?? ""}
              loading="lazy"
              decoding="async"
              style={ratio}
              onClick={() => openLightbox(images, Math.max(0, images.indexOf(item.url)))}
              className={`cursor-zoom-in bg-slate-50 object-contain dark:bg-slate-900 ${FRAME}`}
            />
            {caption && (
              <figcaption className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="event-media-alt">
                <EmojiText text={caption} tags={event} />
              </figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}
