/**
 * Thumbnails a link gives away without asking anyone. YouTube keeps one at a
 * known address per video id; a link that IS a video file can show its own
 * first frame. Everything else waits on the link-metadata proxy
 * (RELAY-ASKS #7).
 */

const YT_ID = /^[\w-]{11}$/;

/** The hqdefault thumbnail for any YouTube link shape, or null. */
export function youtubeThumbnail(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "").toLowerCase();
  const segments = u.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = segments[0] ?? null;
  else if (host === "youtube.com") {
    if (segments[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "live", "embed", "v"].includes(segments[0] ?? "")) id = segments[1] ?? null;
  }
  return id && YT_ID.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** A URL that points straight at a video file. */
export const isVideoFileUrl = (url: string): boolean => /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url);
