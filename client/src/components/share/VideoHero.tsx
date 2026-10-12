/**
 * A NIP-71 video event (kinds 21 / 22, and the addressable 34235 / 34236 —
 * Divine publishes shorts as 34236) as the post page's hero: the video with
 * native controls and its poster, in the shape the imeta says it is, then
 * title, the facts its own tags give (length, a restored Vine's loops and
 * likes), summary, hashtags and the way to it on Divine. When it was posted
 * is the page byline's to say (EventScreen). The URL often carries no file
 * extension — the imeta's `m video/*` is what makes it a video, not the
 * URL's tail.
 *
 * A short (22 / 34236) loops. Nothing starts by itself on this page. A video
 * its creator marked sensitive is covered until the reader asks for it: no
 * player and no poster are in the page before that.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { extractVideoPoster, extractVideoUrls } from "@/lib/noteContent";
import type { MinimalEvent } from "@/lib/noteRefs";
import { SHORT_VIDEO_KINDS, readVideo, type Video } from "@/lib/nip71";
import { DivineWordmark } from "@/lib/brands";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import { ReadingText } from "@/components/share/ReadingText";
import { SensitiveCover } from "@/components/share/SensitiveMedia";
import { useShareNav } from "@/components/share/ShareNavContext";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";

/** Upright for a portrait short, square for a square one (a Vine), wide for the rest or when the imeta gives no `dim`. */
function frameClass(dim: Video["dim"]): string {
  if (!dim) return "aspect-video w-full";
  const { width, height } = dim;
  if (Math.abs(width - height) / Math.max(width, height) <= 0.05) return "aspect-square w-full max-w-[36rem]";
  return height > width ? "aspect-[9/16] max-h-[36rem]" : "aspect-video w-full";
}

/** "6s" for a short; "1:05" from a minute up. */
function lengthOf(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const two = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

const counted = (n: number, one: string, many: string) =>
  `${new Intl.NumberFormat().format(n)} ${n === 1 ? one : many}`;

/** Hashtags written out in the words, lowercase: the chips leave these out. */
const hashtagsIn = (text: string) =>
  new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()));

/** A row or two of chips; an event can carry dozens of `t` tags. */
const MAX_HASHTAGS = 12;

export function VideoHero({ event }: { event: MinimalEvent }) {
  const speed = useConnectionSpeed();
  const requestNav = useShareNav();
  const video = useMemo(() => readVideo(event), [event]);
  // Shown once the reader asks, for this visit and this video only: a
  // different event drawn in the same place asks again. Focus follows to the
  // video: the button that had it is gone.
  const [shownId, setShownId] = useState<string | null>(null);
  if (shownId !== null && shownId !== event.id) setShownId(null);
  const shown = shownId === event.id;
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (shown) player.current?.focus();
  }, [shown]);
  const tag = (k: string) => event.tags.find((t) => t[0] === k)?.[1];
  const url = extractVideoUrls(event.content ?? "", event.tags)[0] ?? tag("url");
  const poster = extractVideoPoster(event.content ?? "", event.tags);
  const title = tag("title") || "";
  const covered = !!video.contentWarning && !shown;
  const facts = [
    video.durationSeconds ? lengthOf(video.durationSeconds) : "",
    video.vine?.loops !== undefined ? counted(video.vine.loops, "loop", "loops") : "",
    video.vine?.likes !== undefined ? counted(video.vine.likes, "like", "likes") : "",
  ].filter(Boolean);
  const written = hashtagsIn(`${title}\n${video.description ?? ""}`);
  const hashtags = video.hashtags.filter((t) => !written.has(t)).slice(0, MAX_HASHTAGS);

  return (
    <div data-testid="video-hero">
      <div
        className={`mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-black dark:border-slate-800 ${frameClass(video.dim)}`}
        data-testid="video-hero-frame"
      >
        {covered ? (
          <SensitiveCover
            reason={video.contentWarning?.reason}
            onShow={() => setShownId(event.id)}
            className="h-full w-full"
          />
        ) : url ? (
          <video
            ref={player}
            tabIndex={0}
            src={url}
            poster={poster}
            controls
            playsInline
            loop={SHORT_VIDEO_KINDS.has(event.kind)}
            preload={videoPreload(speed)}
            aria-label={video.alt || title || undefined}
            className="h-full w-full object-contain"
            data-testid="video-hero-player"
          />
        ) : poster ? (
          <img src={poster} alt="" className="h-full w-full object-contain" />
        ) : null}
      </div>
      {title && (
        <h1
          className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="video-hero-title"
        >
          <EmojiText text={title} tags={event} />
        </h1>
      )}
      {(facts.length > 0 || video.vine) && (
        <p
          className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400"
          data-testid="video-hero-facts"
        >
          {facts.length > 0 && <span>{facts.join(" · ")}</span>}
          {video.vine && (
            <Chip tone="slate" size="sm" data-testid="video-hero-vine">
              Classic Vine
            </Chip>
          )}
        </p>
      )}
      {video.description && <ReadingText text={video.description} tags={event.tags} className="mt-3" />}
      {hashtags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="video-hero-hashtags">
          {hashtags.map((t) => (
            <button
              key={t}
              type="button"
              dir="auto"
              onClick={() => requestNav({ kind: "hashtag", target: `#${t}`, label: `#${t}` })}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
              data-testid="video-hero-hashtag"
            >
              <Chip tone="slate" className="transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">
                #{t}
              </Chip>
            </button>
          ))}
        </div>
      )}
      {(video.capture || video.divineUrl) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Divine's check on how the video was recorded. Squared and iconed, so it never reads as the author's trust tier. */}
          {video.capture && (
            <Chip
              tone="slate"
              icon={video.capture === "mobile" ? Smartphone : Monitor}
              className="rounded-md"
              title="Divine's own capture check, not a Brainstorm trust score"
              data-testid="video-hero-capture"
            >
              {video.capture === "mobile" ? "Recorded in the Divine app" : "Recorded in Divine on the web"}
            </Chip>
          )}
          {video.divineUrl && (
            <a
              href={video.divineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-[13px] font-medium text-slate-600 hover:underline dark:text-slate-300"
              data-testid="video-hero-divine"
            >
              Watch on {/* The partner's own mark, with its x-height of clear space. */}
              <span className="inline-flex items-center px-1 py-0.5">
                <DivineWordmark />
              </span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
