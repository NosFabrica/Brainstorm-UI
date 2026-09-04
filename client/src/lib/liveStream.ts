/**
 * A NIP-53 live event (kind 30311) read for a viewer: what it is called, its
 * poster, whether it is live, where the video is, how many are watching.
 *
 * Platform-hosted streams (Shosho, zap.stream) are authored by the platform
 * and name the streamer in a `p` tag with the "host" role, so the streamer
 * can be neither the author nor the only participant; callers fetch by both
 * shapes and this only reads the event.
 */
type EventLike = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][]; content: string };

export interface LiveStream {
  id: string;
  pubkey: string;
  d: string;
  title: string;
  image?: string;
  /** Verbatim: `live`, `planned`, `ended` — NIP-53's set, kept open. */
  status: string;
  startsSec: number;
  streaming?: string;
  /** Where the stream can be watched after it ended, when the platform kept one. */
  recording?: string;
  viewers?: number;
  createdAt: number;
}

export function parseLiveStream(ev: EventLike): LiveStream | null {
  if (ev.kind !== 30311) return null;
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  const viewers = Number(tag("current_participants"));
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    d: tag("d") ?? "",
    title: tag("title") || tag("summary") || "Live stream",
    image: tag("image"),
    status: (tag("status") || "").toLowerCase(),
    startsSec: Number(tag("starts")) || 0,
    streaming: tag("streaming"),
    recording: tag("recording"),
    viewers: Number.isFinite(viewers) && viewers >= 0 && tag("current_participants") ? viewers : undefined,
    createdAt: ev.created_at,
  };
}

export interface PickedStreams {
  /** On air now (newest if several). */
  live: LiveStream | null;
  /** Announced and not yet started — the soonest. */
  upcoming: LiveStream | null;
  /** The newest ended stream that left a recording. Ended without one is nothing to show. */
  replay: LiveStream | null;
}

/**
 * What a person's streams give a viewer something to do with. An ended stream
 * with no recording is deliberately absent: probed 2026-09-04, a third of
 * ended streams carry a `recording`, and advertising the rest sends people to
 * "This stream has ended".
 */
export function pickStreams(events: EventLike[], nowSec = Math.floor(Date.now() / 1000)): PickedStreams {
  const parsed = events.map(parseLiveStream).filter((s): s is LiveStream => s !== null);
  const newestFirst = [...parsed].sort((a, b) => Math.max(b.startsSec, b.createdAt) - Math.max(a.startsSec, a.createdAt));
  const upcoming = parsed
    .filter((s) => s.status !== "live" && s.status !== "ended" && (s.status === "planned" || s.startsSec > nowSec))
    .filter((s) => s.startsSec === 0 || s.startsSec > nowSec - 6 * 3600)
    .sort((a, b) => a.startsSec - b.startsSec)[0] ?? null;
  return {
    live: newestFirst.find((s) => s.status === "live") ?? null,
    upcoming,
    replay: newestFirst.find((s) => s.status === "ended" && !!s.recording) ?? null,
  };
}

const recordingChecks = new Map<string, Promise<boolean>>();

/** Test seam: forget every recording checked. */
export function __resetRecordingChecks() {
  recordingChecks.clear();
}

/**
 * Whether a recording still answers. Odell's year-old replay pointed at a
 * host that no longer exists, and the card advertised a black player. A
 * recording we would play ourselves (HLS, a video file) must be fetchable
 * across origins anyway — so a HEAD that answers is the same test the player
 * would fail. YouTube is trusted: its player answers for itself, and its
 * pages refuse cross-origin reads.
 */
export function verifyRecording(url: string): Promise<boolean> {
  if (!recordingChecks.has(url)) {
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^(www|m)\./, "").toLowerCase();
    } catch {
      return Promise.resolve(false);
    }
    if (host === "youtube.com" || host === "youtu.be") {
      recordingChecks.set(url, Promise.resolve(true));
    } else {
      recordingChecks.set(
        url,
        fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000) })
          .then((r) => r.ok)
          .catch(() => false),
      );
    }
  }
  return recordingChecks.get(url)!;
}
