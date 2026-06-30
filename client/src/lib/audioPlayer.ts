// A tiny global audio player for the public-page Music section. One <audio>
// element is shared across every track row, so only one track ever plays at a
// time and each row can subscribe to "am I the active track, and where am I in
// it" via useSyncExternalStore. Framework-free; the React layer is the hook at
// the bottom.

import { useSyncExternalStore, useState, useEffect } from "react";
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
    if (a.paused) { status = "loading"; a.play().catch(() => { status = "error"; emit(); }); }
    else { a.pause(); }
    emit();
    return;
  }
  currentId = id;
  status = "loading";
  a.src = src;
  a.currentTime = 0;
  a.play().catch(() => { status = "error"; emit(); });
  emit();
}

/** Pause the active track but keep its position, so it can resume. Used on
 *  route changes — inline media is tied to its page (X / Facebook / LinkedIn). */
export function pausePlayback() {
  if (audio && !audio.paused) audio.pause(); // the 'pause' listener sets status + emits
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
