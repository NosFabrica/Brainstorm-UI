/**
 * A person's videos as tiles: the profile page's Videos block, and "More
 * videos" under a video. Each tile is the poster with a play mark (VideoTile),
 * the title, and when the video was published. A restored Vine's `created_at`
 * is the day it was imported, so the date is `published_at` when the event
 * gives a believable one.
 *
 * The frame follows the videos: upright shorts stand upright and square Vines
 * are square, four to a row, and wide videos stay wide, two to a row. A set of
 * mixed shapes shares one square frame, so a row still lines up. The poster is
 * fitted inside its frame, so nothing is cut whichever frame that is. What a
 * tile does is the caller's: `onOpen` for a tap that plays the video where it
 * is, or `hrefOf` to make each tile a link to the video's page.
 */
import { ago } from "@/lib/ago";
import { extractVideoPoster, extractVideoUrls } from "@/lib/noteContent";
import type { MinimalEvent } from "@/lib/noteRefs";
import { readVideo, type Video } from "@/lib/nip71";
import { videoShapeOf, type VideoShape } from "@/lib/videoFrame";
import { VideoTile } from "@/components/share/VideoTile";
import { EmojiText } from "@/components/ui/custom-emoji";

export interface VideoItem {
  event: MinimalEvent;
  title: string;
  url?: string;
  poster?: string;
  video: Video;
}

/** What a tile shows of a video event, or null when the event has neither a video nor a poster. */
export function videoItemOf(event: MinimalEvent): VideoItem | null {
  const tag = (k: string) => event.tags.find((t) => t[0] === k)?.[1];
  const url = extractVideoUrls(event.content ?? "", event.tags)[0] ?? tag("url");
  const poster = extractVideoPoster(event.content ?? "", event.tags);
  if (!url && !poster) return null;
  return { event, title: tag("title") || "", url, poster, video: readVideo(event) };
}

const COLUMNS: Record<VideoShape, string> = {
  portrait: "grid-cols-2 sm:grid-cols-4",
  square: "grid-cols-2 sm:grid-cols-4",
  landscape: "grid-cols-1 sm:grid-cols-2",
};

/** One or the other: a tile is a button that plays the video where it is, or a link to its page. */
type TileAction =
  | { onOpen: (video: VideoItem) => void; hrefOf?: undefined }
  | { hrefOf: (video: VideoItem) => string; onOpen?: undefined };

export function VideoGrid({ videos, onOpen, hrefOf }: { videos: VideoItem[] } & TileAction) {
  // A video that does not say its size is drawn wide, as it is on its own page.
  const shapes = new Set(videos.map((v) => videoShapeOf(v.video.dim) ?? "landscape"));
  const frame: VideoShape = shapes.size === 1 ? [...shapes][0] : "square";
  return (
    <div className={`grid gap-3 ${COLUMNS[frame]}`} data-testid="video-grid">
      {videos.map((v) => (
        <div
          key={v.event.id}
          className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-slate-800"
          data-testid="video-grid-item"
        >
          <VideoTile
            poster={v.poster}
            url={v.url}
            title={v.title}
            warning={v.video.contentWarning}
            shape={frame}
            onOpen={onOpen && (() => onOpen(v))}
            href={hrefOf?.(v)}
          />
          <div className="flex-1 bg-white px-3 py-2 dark:bg-slate-900">
            {v.title && (
              <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                <EmojiText text={v.title} tags={v.event} />
              </p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="video-tile-date">
              {ago(v.video.publishedAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
