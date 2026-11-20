import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Play } from "lucide-react";
import type { ExplainerVideo as Explainer } from "@/config/explainers";

/**
 * An explainer video (config/explainers), played in the page.
 *
 * It has sound and runs for minutes, so it waits to be asked: the still and a
 * play button until then, and `preload="none"` so a reader who never presses
 * play downloads nothing. From the press on, the browser's own controls take
 * over. Being a native `<video>`, it takes the floor from the music bar like
 * any other (lib/playback).
 *
 * With no file hosted (`src` null) there is nothing to offer, and it renders
 * nothing.
 *
 * `id` makes it a place a link can land (`/how-tags-work#watch`). The app
 * scrolls every route change to the top (App `ScrollToTop`), so arriving with
 * that hash scrolls here itself, a frame later.
 */
export function ExplainerVideo({ video, id }: { video: Explainer; id?: string }) {
  const figure = useRef<HTMLElement | null>(null);
  const player = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!id || window.location.hash !== `#${id}`) return;
    const raf = requestAnimationFrame(() => figure.current?.scrollIntoView?.({ block: "start" }));
    return () => cancelAnimationFrame(raf);
  }, [id]);

  if (!video.src) return null;

  const start = () => {
    setStarted(true);
    // A refused play (no gesture, a blocked host) leaves the controls to try again with.
    void Promise.resolve(player.current?.play()).catch(() => {});
  };

  return (
    <figure ref={figure} id={id} className="scroll-mt-24" data-testid="explainer-video">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-slate-950 shadow-sm dark:shadow-none">
        <video
          ref={player}
          src={video.src}
          poster={video.poster}
          preload="none"
          playsInline
          controls={started}
          className="block aspect-video w-full"
        />
        {!started && (
          <button
            type="button"
            onClick={start}
            aria-label={`Play video: ${video.title}`}
            className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none"
            data-testid="explainer-video-play"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg ring-4 ring-white/70 transition-transform group-hover:scale-105 group-focus-visible:ring-brand-accent sm:h-20 sm:w-20">
              <Play className="h-7 w-7 translate-x-0.5 fill-current sm:h-8 sm:w-8" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-200">Watch: {video.title}</span>
        {" · "}
        {video.length}, with sound
      </figcaption>
    </figure>
  );
}

/**
 * The pointer to an explainer video from a page that isn't its home: a row
 * with the still, saying what it is and how long, leading to the player at
 * `href`. One player, on one page; this only gets people there.
 */
export function ExplainerVideoLink({ video, href, testId }: { video: Explainer; href: string; testId?: string }) {
  if (!video.src) return null;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-2 pr-4 text-card-foreground shadow-sm transition-colors hover:border-brand-accent/50 dark:shadow-none"
      data-testid={testId}
    >
      <span className="relative shrink-0 overflow-hidden rounded-xl bg-slate-950">
        <img src={video.poster} alt="" className="block aspect-video h-14 w-auto object-cover sm:h-16" />
        <span className="absolute inset-0 flex items-center justify-center bg-slate-950/20">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary text-white shadow">
            <Play className="h-3.5 w-3.5 translate-x-px fill-current" aria-hidden="true" />
          </span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Watch: {video.title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{video.length} video, with sound</span>
      </span>
      <ArrowRight
        className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-link"
        aria-hidden="true"
      />
    </Link>
  );
}
