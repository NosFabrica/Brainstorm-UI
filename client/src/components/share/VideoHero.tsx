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
 * A short (22 / 34236) loops, and starts by itself, muted, once it is in
 * view: the reader turns the sound on with the player's own controls. It
 * waits for a press instead when the device asks for less motion or is on a
 * slow or data-saving connection. A full-length video always waits. A video
 * its creator marked sensitive is covered until the reader asks for it: no
 * player and no poster are in the page before that, and once shown it waits
 * for a press too.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { extractVideoPoster, extractVideoUrls } from "@/lib/noteContent";
import type { MinimalEvent } from "@/lib/noteRefs";
import { SHORT_VIDEO_KINDS, readVideo, type Video } from "@/lib/nip71";
import { DivineWordmark, brandForHost } from "@/lib/brands";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import { useAutoplayInView } from "@/lib/feedVideo";
import { parseNip05 } from "@/lib/nip05";
import { profileIdentifier } from "@/lib/shareId";
import { videoShapeOf } from "@/lib/videoFrame";
import { useNip05 } from "@/hooks/useNip05";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { Nip05Handle } from "@/components/Nip05Check";
import { ReadingText } from "@/components/share/ReadingText";
import { SensitiveCover } from "@/components/share/SensitiveMedia";
import { useShareNav } from "@/components/share/ShareNavContext";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";

/** Upright for a portrait short, square for a square one (a Vine), wide for the rest or when the imeta gives no `dim`. */
function frameClass(dim: Video["dim"]): string {
  const shape = videoShapeOf(dim);
  if (shape === "square") return "aspect-square w-full max-w-[36rem]";
  return shape === "portrait" ? "aspect-[9/16] max-h-[36rem]" : "aspect-video w-full";
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

/**
 * The page's own player. One per video file (keyed by its address), so the
 * in-view watch starts over when the page turns to another video, and a newer
 * version of the event with the same file leaves the player as it is. It is
 * the page's lead (lib/feedVideo): a clip in a reply does not start over it.
 *
 * The watch begins once, when the device allows it: as the video appears, or a
 * moment later (a browser's first reading of the connection can be wrong on a
 * cold load) if the reader has not started the video themselves by then. The
 * video is muted at that moment and never again, and the watch is not taken
 * back: a connection that changes afterwards cannot mute or start a video the
 * reader has set as they want it. If the device stops allowing it later
 * (reduced motion or a data saver turned on) what is playing is left alone,
 * and the watch starts nothing while that lasts.
 */
function HeroPlayer({
  src,
  poster,
  label,
  loop,
  autoplay,
  takeFocus,
}: {
  src: string;
  poster?: string;
  label?: string;
  loop: boolean;
  autoplay: boolean;
  takeFocus: boolean;
}) {
  const speed = useConnectionSpeed();
  const player = useRef<HTMLVideoElement>(null);
  // Off to on, once.
  const [watched, setWatched] = useState(autoplay);
  useEffect(() => {
    const el = player.current;
    if (autoplay && !watched && el && el.paused && el.currentTime === 0) setWatched(true);
  }, [autoplay, watched]);
  // After "Show video" focus follows to the video: the button that had it is gone.
  useEffect(() => {
    if (takeFocus) player.current?.focus();
  }, [takeFocus]);
  // Muted on the element itself, so the browser lets it start (React's `muted`
  // attribute is unreliable for this). Once, as the watch begins: the sound is
  // the reader's to set from then on, with the controls.
  useEffect(() => {
    if (watched && player.current) player.current.muted = true;
  }, [watched]);
  // The device's wish now, for a watch already begun.
  const held = useRef(!autoplay);
  useEffect(() => {
    held.current = !autoplay;
  }, [autoplay]);
  useAutoplayInView(player, watched, true, held);
  return (
    <video
      ref={player}
      tabIndex={0}
      src={src}
      poster={poster}
      controls
      playsInline
      loop={loop}
      preload={videoPreload(speed)}
      aria-label={label}
      className="h-full w-full object-contain"
      data-testid="video-hero-player"
    />
  );
}

export function VideoHero({ event, nip05 }: { event: MinimalEvent; nip05?: string | null }) {
  const speed = useConnectionSpeed();
  const reduce = usePrefersReducedMotion();
  const requestNav = useShareNav();
  const video = useMemo(() => readVideo(event), [event]);
  // Shown once the reader asks, for this visit and this video only: a
  // different event drawn in the same place asks again.
  const [shownId, setShownId] = useState<string | null>(null);
  if (shownId !== null && shownId !== event.id) setShownId(null);
  const shown = shownId === event.id;
  const short = SHORT_VIDEO_KINDS.has(event.kind);
  // A flagged video never starts by itself, even once shown: the reader pressed
  // a button to see it, and it waits for the next press.
  const autoplay = short && !video.contentWarning && !reduce && speed === "normal";
  // The creator's page on Divine, and their handle there once its domain
  // confirms it (a kind-0 `nip05` alone is a claim anyone can copy). Only a
  // handle on divine.video: beside Divine's links any other would read as
  // Divine's word, and the byline already marks it.
  const creatorNpub = video.divineUrl ? profileIdentifier(event.pubkey) : "";
  const divineHandle =
    video.divineUrl && brandForHost(parseNip05(nip05)?.domain)?.name === "Divine" ? nip05 : undefined;
  const handleVerified = useNip05(divineHandle, event.pubkey) === "verified";
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
          <HeroPlayer
            key={url}
            src={url}
            poster={poster}
            label={video.alt || title || undefined}
            loop={short}
            autoplay={autoplay}
            takeFocus={shown}
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
          {/* In words: the wordmark is drawn once, on the link beside it. */}
          {creatorNpub && (
            <a
              href={`https://divine.video/profile/${creatorNpub}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-[13px] font-medium text-slate-600 hover:underline dark:text-slate-300"
              data-testid="video-hero-divine-creator"
            >
              Creator on Divine
            </a>
          )}
          {handleVerified && (
            <Nip05Handle
              nip05={divineHandle}
              pubkey={event.pubkey}
              className="inline-flex min-w-0 items-center gap-1 text-[13px] text-slate-500 dark:text-slate-400"
              iconClassName="h-3.5 w-3.5 shrink-0 text-sky-500"
              testId="video-hero-handle"
            />
          )}
        </div>
      )}
    </div>
  );
}
