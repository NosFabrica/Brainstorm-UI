/**
 * One sound at a time, app-wide.
 *
 * The music bar follows the listener across pages (lib/audioPlayer), and a
 * page can hold a video that plays with sound — a live stream, a replay, a
 * note's clip once unmuted, an embedded player. Left alone they play over
 * each other, worst on a phone (Benjamin, 2026-09-09). The rule: whatever
 * starts sounding takes the floor, and whatever held it pauses.
 *
 * Native `<video>`/`<audio>` elements need no wiring: `play` does not bubble
 * but it does capture, so one document-level listener sees every element
 * that starts. Players that are not elements in the page — the music bar's
 * detached `Audio`, an embedded iframe — take the floor themselves with
 * `playSolo`.
 */

import { useEffect, type RefObject } from "react";

/** Something that can be told to stop sounding. */
export type Sounding = { pause: () => void };

let holder: Sounding | null = null;

/** Take the floor: whatever else was sounding is paused. */
export function playSolo(next: Sounding): void {
  if (holder && holder !== next) {
    try {
      holder.pause();
    } catch {
      /* a player that is already gone */
    }
  }
  holder = next;
}

// One Sounding per element, so an element replaying does not pause itself.
const byElement = new WeakMap<HTMLMediaElement, Sounding>();
function soundingFor(el: HTMLMediaElement): Sounding {
  let s = byElement.get(el);
  if (!s) {
    s = { pause: () => el.pause() };
    byElement.set(el, s);
  }
  return s;
}

/** Watch every media element in the document; returns the uninstall. */
export function installSoloPlayback(doc: Document = document): () => void {
  // Muted playback makes no sound — a note's clip autoplaying as it scrolls
  // into view — so it has nothing to take from the music.
  const onPlay = (e: Event) => {
    const el = e.target;
    if (el instanceof HTMLMediaElement && !el.muted) playSolo(soundingFor(el));
  };
  // A silent clip the listener unmutes is, from that tap, what they chose to hear.
  const onVolume = (e: Event) => {
    const el = e.target;
    if (el instanceof HTMLMediaElement && !el.muted && !el.paused) playSolo(soundingFor(el));
  };
  doc.addEventListener("play", onPlay, true);
  doc.addEventListener("volumechange", onVolume, true);
  return () => {
    doc.removeEventListener("play", onPlay, true);
    doc.removeEventListener("volumechange", onVolume, true);
    holder = null;
  };
}

/**
 * An embedded player (YouTube, Vimeo, zap.stream…) is an iframe: it cannot
 * be observed, only told. Its Sounding pauses through the provider's message
 * API where one exists — YouTube's needs `enablejsapi=1` on the embed URL —
 * and is a no-op elsewhere. Best-effort: the music always yields to an embed
 * that starts; an embed yields to the music when its provider listens.
 */
const byFrame = new WeakMap<HTMLIFrameElement, Sounding>();
export function embedSounding(frame: HTMLIFrameElement): Sounding {
  let s = byFrame.get(frame);
  if (!s) {
    s = {
      pause: () => {
        const src = frame.getAttribute("src") ?? "";
        const win = frame.contentWindow;
        if (!win) return;
        try {
          if (/youtube(-nocookie)?\.com\/embed\//.test(src)) win.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: "" }), "*");
          else if (/player\.vimeo\.com\//.test(src)) win.postMessage(JSON.stringify({ method: "pause" }), "*");
        } catch {
          /* a frame that is already gone */
        }
      },
    };
    byFrame.set(frame, s);
  }
  return s;
}

/**
 * An embed that starts playing as it mounts takes the floor. `key` names the
 * embed (its URL) so a different one swapped into the same slot claims again.
 */
export function useSoloEmbed(ref: RefObject<HTMLIFrameElement | null>, active: boolean, key?: string): void {
  useEffect(() => {
    if (!active || !ref.current) return;
    playSolo(embedSounding(ref.current));
  }, [ref, active, key]);
}
