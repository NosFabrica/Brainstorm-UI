import { useEffect, type RefObject } from "react";

/**
 * Every autoplay-in-view `<video>` registers here so only ONE plays at a time —
 * when one starts, the rest pause. This is the X/Twitter timeline behavior:
 * scrolling a new video into view takes over playback from the previous one.
 */
const registry = new Set<HTMLVideoElement>();

/**
 * The plays and pauses the watch has asked of a video and not yet heard back
 * as events, oldest first. A `play` or `pause` event it did not ask for is the
 * reader's, at the player's own controls.
 */
type Ask = { what: "play" | "pause" };
const asked = new WeakMap<HTMLVideoElement, Ask[]>();

function ask(el: HTMLVideoElement, what: Ask["what"]): Ask {
  const queue = asked.get(el) ?? [];
  const entry = { what };
  queue.push(entry);
  asked.set(el, queue);
  return entry;
}

/** Whether this event is the watch's own doing. One that is, is struck off. */
function wasAsked(el: HTMLVideoElement, what: Ask["what"]): boolean {
  const queue = asked.get(el);
  if (queue?.[0]?.what !== what) return false;
  queue.shift();
  return true;
}

/** Starts a paused video. True when the watch is what started it. */
function start(el: HTMLVideoElement): boolean {
  if (!el.paused) return false;
  const owed = ask(el, "play");
  el.play().catch(() => {
    // Turned down (not allowed, or a file the browser cannot play) with no `play`
    // event: none is owed. If the event did come, it has struck this off already.
    const queue = asked.get(el);
    const at = queue?.indexOf(owed) ?? -1;
    if (at >= 0) queue!.splice(at, 1);
  });
  return true;
}

function stop(el: HTMLVideoElement) {
  if (el.paused) return;
  ask(el, "pause");
  el.pause();
}

function playSolo(el: HTMLVideoElement) {
  for (const other of registry) {
    if (other !== el) stop(other);
  }
}

/** The video a page is about (the video page's own), and whether it is in view. */
let leadVideo: { el: HTMLVideoElement; inView: boolean } | null = null;

/**
 * The lead has the floor while it is in view, and wherever it is while the
 * reader is listening to it (playing with the sound on). A clip in a reply
 * further down does not start by itself over it.
 */
function leadHasFloorOver(el: HTMLVideoElement): boolean {
  if (!leadVideo || leadVideo.el === el) return false;
  return leadVideo.inView || (!leadVideo.el.paused && !leadVideo.el.muted);
}

/**
 * Autoplay a muted `<video>` once it is ≥60% in view, and pause it when it
 * leaves — coordinated so only one registered video plays at a time. No-op when
 * `enabled` is false (e.g. reduced motion, where we fall back to click-to-play).
 *
 * `lead` marks the one video the page is about: see `leadHasFloorOver`. Its
 * controls are always showing, so what the reader does there is kept:
 *
 *  - A pause the reader made holds. The watch does not start the video again,
 *    however the page is scrolled, until the reader presses play.
 *  - With the sound on it is not paused when it scrolls out of view: the
 *    reader chose to listen, and may read on.
 *  - Muted and started by the watch, it pauses when the tab goes to the
 *    background and plays again when the tab is back, if it is still in view.
 *    It does not start in a tab that opened in the background.
 *
 * `hold` is for a caller that keeps the watch on after the device stops
 * allowing autoplay (the video page, once its video has begun): while
 * `hold.current` is true the watch starts nothing. What is playing is left
 * alone, and still pauses as it would.
 */
export function useAutoplayInView(
  ref: RefObject<HTMLVideoElement>,
  enabled: boolean,
  lead = false,
  hold?: RefObject<boolean>,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    registry.add(el);
    if (lead) leadVideo = { el, inView: false };
    let inView = false;
    let readerPaused = false;
    let startedHere = false;
    let resumeWhenVisible = false;

    const begin = () => {
      if (hold?.current) return;
      if (lead && readerPaused) return;
      // A tab that opened in the background: the lead waits for it to come to the front.
      if (lead && document.hidden) {
        resumeWhenVisible = true;
        return;
      }
      if (leadHasFloorOver(el)) return;
      playSolo(el);
      if (start(el)) startedHere = true;
    };
    // Every registered video hears its own events, so what the watch asked is struck off as it happens.
    const onPause = () => {
      if (wasAsked(el, "pause") || el.ended) return;
      // Muted, in a tab nobody can see: the browser stopped it, and it is owed its start back.
      // With the sound on, somebody did (a media key, the browser's media controls): it is the reader's.
      if (document.hidden && el.muted) resumeWhenVisible = startedHere;
      else readerPaused = true;
    };
    // A drag on the scrub bar pauses and plays again in some browsers. That pair reads as the
    // reader's pause and then the reader's play: the pause is cleared, and the video counts as
    // theirs from then on (`startedHere` off). The one thing that changes is that a tab going to
    // the background no longer pauses it, which is right for a video the reader is handling.
    const onPlay = () => {
      if (wasAsked(el, "play")) return;
      readerPaused = false;
      startedHere = false;
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (startedHere && !el.paused && el.muted) {
          stop(el);
          resumeWhenVisible = true;
        }
      } else if (resumeWhenVisible) {
        resumeWhenVisible = false;
        if (inView) begin();
      }
    };
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    if (lead) document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        inView = e.isIntersecting && e.intersectionRatio >= 0.6;
        if (leadVideo?.el === el) leadVideo.inView = inView;
        if (inView) begin();
        else if (!(lead && !el.muted)) stop(el);
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
      document.removeEventListener("visibilitychange", onVisibility);
      registry.delete(el);
      if (leadVideo?.el === el) leadVideo = null;
    };
  }, [ref, enabled, lead, hold]);
}
