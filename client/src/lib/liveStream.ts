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
    viewers: Number.isFinite(viewers) && viewers >= 0 && tag("current_participants") ? viewers : undefined,
    createdAt: ev.created_at,
  };
}

/** The one live now (newest if several), and the most recent stream of any status. */
export function pickStreams(events: EventLike[]): { live: LiveStream | null; latest: LiveStream | null } {
  const parsed = events.map(parseLiveStream).filter((s): s is LiveStream => s !== null);
  const newestFirst = [...parsed].sort((a, b) => Math.max(b.startsSec, b.createdAt) - Math.max(a.startsSec, a.createdAt));
  return {
    live: newestFirst.find((s) => s.status === "live") ?? null,
    latest: newestFirst[0] ?? null,
  };
}
