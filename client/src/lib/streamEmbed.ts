/**
 * NIP-53 `streaming` URLs that are platform PAGES rather than HLS manifests
 * (probed 2026-09-03: a handful of Twitch / Kick / YouTube among the m3u8s).
 * Each platform has an official embeddable player; this maps a page to it so
 * the stream plays in Brainstorm instead of bouncing to zap.stream.
 * HLS and anything unknown return null — the caller decides what to do.
 */
export function streamEmbedUrl(streaming: string, parentHost: string): string | null {
  let u: URL;
  try {
    u = new URL(streaming);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const segments = u.pathname.split("/").filter(Boolean);

  if (host === "twitch.tv") {
    // Only a channel page has a live player: twitch.tv/<channel>.
    if (segments.length !== 1 || ["videos", "directory", "p", "settings"].includes(segments[0].toLowerCase())) return null;
    return `https://player.twitch.tv/?channel=${encodeURIComponent(segments[0])}&parent=${encodeURIComponent(parentHost)}&autoplay=true&muted=false`;
  }
  if (host === "kick.com") {
    if (segments.length !== 1) return null;
    return `https://player.kick.com/${encodeURIComponent(segments[0])}?autoplay=true&muted=false`;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    let id: string | null = null;
    if (host === "youtu.be") id = segments[0] ?? null;
    else if (segments[0] === "watch") id = u.searchParams.get("v");
    else if (segments[0] === "live" || segments[0] === "embed" || segments[0] === "shorts") id = segments[1] ?? null;
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    return `https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1`;
  }
  return null;
}

/** An HLS manifest the in-app video player can take. */
export const isHlsUrl = (url: string): boolean => /\.m3u8(\?|$)/i.test(url);

/**
 * Where a RECORDING plays inside an iframe: YouTube through the cookieless host
 * (a replay is a video, not a live channel, so it takes the video embed).
 * Kick and Twitch VODs have no public embed we can verify — those open the page.
 */
export function replayEmbedUrl(recording: string): string | null {
  let u: URL;
  try {
    u = new URL(recording);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "").toLowerCase();
  const segments = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = segments[0] ?? null;
  else if (host === "youtube.com") {
    if (segments[0] === "watch") id = u.searchParams.get("v");
    else if (["live", "embed", "shorts", "v"].includes(segments[0] ?? "")) id = segments[1] ?? null;
  }
  if (id && /^[\w-]{6,}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
  return null;
}
