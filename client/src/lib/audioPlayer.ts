// A tiny global audio player for the public-page Music section. One <audio>
// element is shared across every track row, so only one track ever plays at a
// time and each row can subscribe to "am I the active track, and where am I in
// it" via useSyncExternalStore. Framework-free; the React layer is the hook at
// the bottom.

import { useSyncExternalStore, useState, useEffect, useRef, type RefObject } from "react";
import type { MinimalEvent } from "@/lib/noteRefs";

export type TrackStatus = "idle" | "loading" | "playing" | "paused" | "error";

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)(\?|#|$)/i;
const isHttpUrl = (s: unknown): s is string => typeof s === "string" && /^https?:\/\//i.test(s);

/**
 * Best-effort streamable audio URL from a kind-31337 (music) event. Tries the
 * common explicit tags first, then an NIP-92 `imeta` url, then any tag value or
 * content URL that looks like an audio file. Returns undefined when there's
 * nothing playable (the row then renders as a plain link).
 */
export function audioUrlFromEvent(ev: Pick<MinimalEvent, "tags" | "content">): string | undefined {
  for (const key of ["media", "url", "stream", "streaming", "enclosure", "audio"]) {
    const v = ev.tags.find((t) => t[0] === key)?.[1];
    if (isHttpUrl(v)) return v;
  }
  // imeta: ["imeta", "url https://…", "m audio/mpeg", …]
  for (const t of ev.tags) {
    if (t[0] !== "imeta") continue;
    const u = t.find((s) => typeof s === "string" && s.startsWith("url "))?.slice(4);
    if (isHttpUrl(u)) return u;
  }
  // any tag value that looks like an audio file
  for (const t of ev.tags) for (const v of t.slice(1)) if (isHttpUrl(v) && AUDIO_EXT.test(v)) return v;
  // a URL in the content
  const m = (ev.content || "").match(/https?:\/\/\S+/g)?.find((u) => AUDIO_EXT.test(u));
  return m || undefined;
}

/** mm:ss (or h:mm:ss for long tracks). */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

// --- singleton state ---
let audio: HTMLAudioElement | null = null;
let currentId: string | null = null;
let status: TrackStatus = "idle";
let playlist: { id: string; src: string }[] = [];
const listeners = new Set<() => void>();

/** Register the ordered track list so playback auto-advances on `ended`. */
export function setPlaylist(list: { id: string; src: string }[]) {
  playlist = list;
}

// Cached snapshot — rebuilt only on change so useSyncExternalStore stays stable.
let snapshot = { currentId: null as string | null, status: "idle" as TrackStatus, currentTime: 0, duration: 0 };
function rebuild() {
  snapshot = {
    currentId,
    status,
    currentTime: audio?.currentTime ?? 0,
    duration: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
  };
}
function emit() {
  rebuild();
  listeners.forEach((l) => l());
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "none";
  audio.addEventListener("timeupdate", emit);
  audio.addEventListener("durationchange", emit);
  audio.addEventListener("loadedmetadata", emit);
  audio.addEventListener("waiting", () => { status = "loading"; emit(); });
  audio.addEventListener("playing", () => { status = "playing"; emit(); });
  audio.addEventListener("play", () => { status = audio && audio.readyState < 3 ? "loading" : "playing"; emit(); });
  audio.addEventListener("pause", () => { if (status !== "error") status = "paused"; emit(); });
  audio.addEventListener("ended", () => {
    const idx = playlist.findIndex((t) => t.id === currentId);
    const next = idx >= 0 ? playlist[idx + 1] : undefined;
    if (next) { toggleTrack(next.id, next.src); return; } // auto-advance
    status = "idle"; currentId = null; emit();
  });
  audio.addEventListener("error", () => { status = "error"; emit(); });
  return audio;
}

/** Play this track, or toggle play/pause if it's already the active one. */
export function toggleTrack(id: string, src: string) {
  if (typeof window === "undefined") return;
  const a = ensureAudio();
  if (currentId === id) {
    if (a.paused) { status = "loading"; Promise.resolve(a.play()).catch(() => { status = "error"; emit(); }); }
    else { a.pause(); }
    emit();
    return;
  }
  currentId = id;
  status = "loading";
  a.src = src;
  a.currentTime = 0;
  // Wrapped: a media element that returns nothing from play() (older engines,
  // test DOMs) must not throw before the store learns which track is active.
  Promise.resolve(a.play()).catch(() => { status = "error"; emit(); });
  emit();
}

/** Pause the active track but keep its position, so it can resume. Used on
 *  route changes — inline media is tied to its page (X / Facebook / LinkedIn). */
export function pausePlayback() {
  if (audio && !audio.paused) audio.pause(); // the 'pause' listener sets status + emits
}

/**
 * Hard-stop every kind of inline media at once: the shared audio track, any
 * `<video>`/`<audio>` element still in the DOM, and an active Picture-in-Picture
 * window. PiP (and, in some browsers, a detached media element) keeps playing
 * across a client-side route change unless it's explicitly closed — so this is
 * called on every navigation to guarantee leaving a page stops the sound, the
 * way X and YouTube behave when there's no dedicated mini-player.
 */
export function stopAllMedia() {
  pausePlayback();
  if (typeof document === "undefined") return;
  // A Picture-in-Picture video is a deliberate mini-player: it persists across
  // the app (YouTube / Google standard) until the user closes it. So we never
  // exit PiP here — we just pause every OTHER playing media element.
  try {
    const pip = document.pictureInPictureElement;
    document.querySelectorAll<HTMLMediaElement>("video, audio").forEach((m) => {
      if (m !== pip && !m.paused) m.pause();
    });
  } catch { /* ignore */ }
}

/**
 * Picture-in-Picture-aware cleanup for a `<video>`. On unmount (navigation): if
 * the video is playing in PiP, LEAVE IT RUNNING so the user can keep watching +
 * hearing it with full controls while they browse the rest of the app (YouTube /
 * Google standard); otherwise pause it so leaving the page stops the sound.
 * Closing the PiP window always stops playback — even after navigation, when the
 * element is detached from this page (the listener rides along with the element).
 * `onClose` runs extra teardown on PiP close (e.g. destroying an HLS instance).
 */
export function usePipAwareAutoStop(ref: RefObject<HTMLVideoElement | null>, onClose?: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const v = ref.current; // captured at mount
    if (!v) return;
    const onLeavePiP = () => {
      // "Back to tab" returns the video to a page that's still open — let it keep
      // playing inline. Closing PiP after navigating away leaves the element
      // detached from any page, so stop it (and tear down e.g. HLS).
      if (document.contains(v)) return;
      try { if (!v.paused) v.pause(); } catch { /* ignore */ }
      try { onCloseRef.current?.(); } catch { /* ignore */ }
    };
    v.addEventListener("leavepictureinpicture", onLeavePiP);
    return () => {
      // Persist across navigation while in PiP: keep the element + its
      // leavepictureinpicture listener alive so closing PiP later still stops it.
      if (document.pictureInPictureElement === v) return;
      v.removeEventListener("leavepictureinpicture", onLeavePiP);
      try { if (!v.paused) v.pause(); } catch { /* ignore */ }
    };
  }, [ref]);
}

/** Seek the active track to a 0–1 fraction of its duration. */
export function seekTrack(id: string, fraction: number) {
  if (currentId !== id || !audio || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(1, fraction)) * audio.duration;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
const getSnapshot = () => snapshot;

/**
 * The player as a whole — which track is active and where it is — for a
 * now-playing bar that outlives any one row.
 */
export function usePlayerState(): { currentId: string | null; status: TrackStatus; currentTime: number; duration: number } {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Skip to the next track in the registered playlist, if there is one. */
export function playNext(): boolean {
  const idx = playlist.findIndex((t) => t.id === currentId);
  const next = idx >= 0 ? playlist[idx + 1] : playlist[0];
  if (!next) return false;
  toggleTrack(next.id, next.src);
  return true;
}

/** Start the registered playlist from its first track (or a given one). */
export function playFrom(id?: string) {
  const start = id ? playlist.find((t) => t.id === id) : playlist[0];
  if (start && start.id !== currentId) toggleTrack(start.id, start.src);
  else if (start) toggleTrack(start.id, start.src);
}

/** Per-row view of the shared player: is this id active, and its progress. */
export function useTrackPlayer(id: string) {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isActive = s.currentId === id;
  return {
    isActive,
    isPlaying: isActive && s.status === "playing",
    isLoading: isActive && s.status === "loading",
    isError: isActive && s.status === "error",
    currentTime: isActive ? s.currentTime : 0,
    duration: isActive ? s.duration : 0,
  };
}

// Total-duration lookup so every row can show its length before playing. Reads
// just the audio metadata via a throwaway element, cached by src.
const durationCache = new Map<string, number>();
export function useTrackDuration(src?: string): number | null {
  const [dur, setDur] = useState<number | null>(() => (src && durationCache.has(src) ? durationCache.get(src)! : null));
  useEffect(() => {
    if (!src || typeof window === "undefined") return;
    if (durationCache.has(src)) { setDur(durationCache.get(src)!); return; }
    const a = new Audio();
    a.preload = "metadata";
    const cleanup = () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("error", cleanup);
      a.src = "";
    };
    const onMeta = () => {
      if (Number.isFinite(a.duration)) { durationCache.set(src, a.duration); setDur(a.duration); }
      cleanup();
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("error", cleanup);
    a.src = src;
    return cleanup;
  }, [src]);
  return dur;
}
