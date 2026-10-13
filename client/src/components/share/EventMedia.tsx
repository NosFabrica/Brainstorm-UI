/**
 * The files an event carries, on its page, each drawn as what it is (lib/mediaKind
 * `mediaItemsOf`): a picture as a picture, with the publisher's `alt` under it and
 * its `dim` holding the frame before it loads; a video as a player; a sound as
 * the shared audio player — never as a broken picture. The page's fallback for
 * a kind with no hero of its own (a kind-20 picture post among them), and a
 * media file's preview (FileHero).
 *
 * Media its creator marked sensitive (NIP-36) is one cover until the reader
 * asks, then all of it shows and focus moves to it.
 */
import { useEffect, useRef, useState } from "react";
import type { MinimalEvent } from "@/lib/noteRefs";
import { mediaPosterOf, type MediaItem } from "@/lib/mediaKind";
import { contentWarningOf } from "@/lib/nip36";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import { useLightbox } from "@/components/share/Lightbox";
import { SensitiveCover, type SensitiveSubject } from "@/components/share/SensitiveMedia";
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
  // The callers key this on the event, so a reveal never carries to another one.
  const [shown, setShown] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown) frameRef.current?.focus();
  }, [shown]);
  if (items.length === 0) return null;

  if (warning && !shown) {
    // In the shape the first file will take, when its `dim` says it: showing it moves nothing below.
    const first = items[0];
    const sized = first.kind !== "audio" && first.dim;
    return (
      <SensitiveCover
        reason={warning.reason}
        onShow={() => setShown(true)}
        subject={subjectOf(items)}
        count={items.length}
        style={sized ? { aspectRatio: `${sized.w} / ${sized.h}` } : undefined}
        className={`mb-2 ${sized ? "" : "aspect-video"} ${FRAME}`}
      />
    );
  }

  // The lightbox carousels through the pictures alone.
  const images = items.filter((i) => i.kind === "photo").map((i) => i.url);
  const content = event.content.trim();
  const title = event.tags.find((t) => t[0] === "title")?.[1]?.trim();
  const poster = mediaPosterOf(event) ?? undefined;
  return (
    <div
      ref={frameRef}
      tabIndex={shown ? -1 : undefined}
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
        if (item.kind === "audio")
          return (
            <div key={item.url} className="mb-2" data-testid="event-media-audio">
              <EmbeddedTrackCard
                id={`event:${event.id}:${item.url}`}
                title={item.alt || title || "Audio"}
                cover={poster !== item.url ? poster : undefined}
                audio={item.url}
                // Its imeta's `duration`: the player says it without loading the file to ask.
                durationSec={item.durationSec}
              />
            </div>
          );
        // The alt is said under the picture unless it only repeats the post's words.
        const caption = item.alt && item.alt !== content && item.alt !== title ? item.alt : null;
        return (
          <figure key={item.url} className="mb-2">
            <img
              src={item.url}
              alt={item.alt ?? ""}
              loading="lazy"
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
