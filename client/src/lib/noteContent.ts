/**
 * Lightweight tokenizer for Nostr kind-1 note content: a raw `content` string
 * into renderable tokens — text, links, inline images/video, `nostr:` mentions,
 * and hashtags — for the share page's note teasers. Intentionally minimal: a
 * taste of the note, not a full client renderer.
 *
 * Predates `applesauce-content`; slated to be replaced by it.
 */

import { nip19 } from "nostr-tools";

export type NoteToken =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "image"; value: string }
  | { type: "video"; value: string }
  | { type: "audio"; value: string }
  | { type: "live"; value: string }
  | { type: "mention"; bech32: string }
  | { type: "hashtag"; value: string };

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)(\?.*)?$/i;
// HLS manifests + hosts that only ever serve live/streamed video.
const HLS_EXT = /\.m3u8(\?.*)?$/i;
const LIVE_HOST = /(?:^|\.)(cloudflarestream\.com|livepeer\.(?:com|studio|monster)|lp-playback\.studio)$/i;

/** A URL that should render as an inline HLS video player (live stream / m3u8). */
export function isLiveUrl(url: string): boolean {
  if (HLS_EXT.test(url)) return true;
  try {
    return LIVE_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Normalize a stream URL to something hls.js can actually load. Cloudflare Stream
 * often shares a `/watch` or `/iframe` page URL, but the playable HLS manifest is
 * `…/<videoId>/manifest/video.m3u8` — rewrite to that so the player just works.
 */
export function toPlayableStreamUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/(?:^|\.)cloudflarestream\.com$/i.test(u.hostname) && !HLS_EXT.test(u.pathname)) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return `${u.protocol}//${u.hostname}/${id}/manifest/video.m3u8`;
    }
    return url;
  } catch {
    return url;
  }
}

// One pass: URLs, bech32 mentions (with or without the `nostr:` prefix), and
// #hashtags. Everything else is text. The lookbehind keeps us from matching a
// bech32 entity glued to the end of a word (e.g. "footnote1…"); a decode guard
// in parseNoteContent rejects anything that isn't a real entity.
const TOKEN_REGEX =
  /(https?:\/\/[^\s]+|data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)|(?<![a-z0-9/])((?:nostr:)?(?:npub|nprofile|nevent|note|naddr)1[02-9ac-hj-np-z]+)|(#[\p{L}\p{N}_]+)/giu;

// A nostr bech32 entity embedded anywhere inside a normal web URL's path, e.g.
// `https://relayop.xyz/articles/naddr1…` or `https://njump.me/nevent1…`.
const EMBEDDED_BECH32 = /(naddr|nevent|note|npub|nprofile)1[02-9ac-hj-np-z]+/i;

/**
 * If a web URL wraps a nostr entity (article/note/profile link via njump,
 * relayop, primal, etc.), return that bech32 — but only if it actually decodes
 * (checksum guard against false positives). Otherwise null.
 */
export function extractBech32FromUrl(url: string): string | null {
  const m = EMBEDDED_BECH32.exec(url);
  if (!m) return null;
  try {
    nip19.decode(m[0]);
    return m[0];
  } catch {
    return null;
  }
}

/** Compact display label for a plain web URL: `host(no www) + short path`. */
export function prettyUrlLabel(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    let path = (u.pathname + u.search).replace(/\/+$/, "");
    if (path) {
      if (path.length > 18) path = path.slice(0, 18) + "…";
      return host + path;
    }
    return host;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function classifyUrl(url: string): NoteToken {
  // Inline base64 images render as images — never as a wall of base64 text.
  if (url.startsWith("data:image/")) return { type: "image", value: url };
  if (IMAGE_EXT.test(url)) return { type: "image", value: url };
  if (VIDEO_EXT.test(url)) return { type: "video", value: url };
  if (AUDIO_EXT.test(url)) return { type: "audio", value: url };
  if (isLiveUrl(url)) return { type: "live", value: url };
  // A web URL that wraps a nostr entity becomes a mention so it can render as a
  // rich card instead of a long ugly link.
  const bech = extractBech32FromUrl(url);
  if (bech) return { type: "mention", bech32: bech };
  return { type: "url", value: url };
}

export function parseNoteContent(content: string): NoteToken[] {
  const text = content || "";
  const tokens: NoteToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TOKEN_REGEX)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, idx) });
    }
    const [whole, url, mention, hashtag] = match;
    if (url) {
      tokens.push(classifyUrl(url));
    } else if (mention) {
      const bech = mention.replace(/^nostr:/, "");
      // Decode-guard: a bare token like "note1…" in prose isn't a real entity.
      let valid = false;
      try { nip19.decode(bech); valid = true; } catch { /* not an entity */ }
      tokens.push(valid ? { type: "mention", bech32: bech } : { type: "text", value: whole });
    } else if (hashtag) {
      tokens.push({ type: "hashtag", value: hashtag });
    }
    lastIndex = idx + whole.length;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }
  return tokens;
}

/**
 * Collect image URLs for a note/picture event — from `imeta` tags (NIP-92) and
 * from image URLs embedded in the content. Used by the Photos teaser grid.
 *
 * Many Nostr images are extensionless (image.nostr.build hash URLs, blossom
 * `<sha256>` URLs), and kind-20 picture events declare media via the `imeta`
 * `m image/*` MIME hint rather than a file extension. So an `imeta` URL counts
 * as an image when ANY of: its MIME is `image/*`, it has an image extension, or
 * `opts.allImeta` is set (used for kind-20 picture events, where every `imeta`
 * URL is definitionally a photo). Plain URLs inside note *content* still rely on
 * the file-extension check (no host guessing).
 */
export function extractImageUrls(
  content: string,
  tags: string[][] = [],
  opts: { allImeta?: boolean } = {},
): string[] {
  const urls = new Set<string>();
  for (const tag of tags) {
    if (tag[0] === "imeta") {
      // A single imeta tag whose values are "key value" parts, e.g.
      // ["imeta", "url https://…", "m image/jpeg", "dim 800x600", …].
      let url: string | undefined;
      let isImageMime = false;
      for (const part of tag.slice(1)) {
        const u = /^url\s+(\S+)/.exec(part);
        if (u) url = u[1];
        const m = /^m\s+(\S+)/.exec(part);
        if (m && /^image\//i.test(m[1])) isImageMime = true;
      }
      if (url && (opts.allImeta || isImageMime || IMAGE_EXT.test(url))) urls.add(url);
    } else if (tag[0] === "image" && tag[1]) {
      // A bare `image` tag is definitionally an image.
      urls.add(tag[1]);
    } else if (tag[0] === "url" && tag[1] && IMAGE_EXT.test(tag[1])) {
      urls.add(tag[1]);
    }
  }
  for (const token of parseNoteContent(content)) {
    if (token.type === "image") urls.add(token.value);
  }
  return Array.from(urls);
}

/**
 * Collect video URLs for an event — from `imeta` tags (MIME `video/*` or a video
 * extension) and from video URLs in the content. Used by the Videos teaser.
 */
export function extractVideoUrls(content: string, tags: string[][] = []): string[] {
  const urls = new Set<string>();
  for (const tag of tags) {
    if (tag[0] === "imeta") {
      let url: string | undefined;
      let isVideoMime = false;
      for (const part of tag.slice(1)) {
        const u = /^url\s+(\S+)/.exec(part);
        if (u) url = u[1];
        const m = /^m\s+(\S+)/.exec(part);
        if (m && /^video\//i.test(m[1])) isVideoMime = true;
      }
      if (url && (isVideoMime || VIDEO_EXT.test(url))) urls.add(url);
    }
  }
  for (const token of parseNoteContent(content)) {
    if (token.type === "video") urls.add(token.value);
  }
  return Array.from(urls);
}

/**
 * Find the thumbnail/poster image for a video event (NIP-71 kind 21/22). The
 * `imeta` tag's `url` is the VIDEO file, so we must NOT use that as a poster —
 * instead read the `image`/`thumb` sub-field inside `imeta`, or a top-level
 * `image`/`thumb` tag, falling back to an image embedded in the content.
 */
export function extractVideoPoster(content: string, tags: string[][] = []): string | undefined {
  for (const tag of tags) {
    if ((tag[0] === "image" || tag[0] === "thumb") && tag[1]) return tag[1];
    if (tag[0] === "imeta") {
      for (const part of tag.slice(1)) {
        const m = /^(?:image|thumb)\s+(\S+)/.exec(part);
        if (m) return m[1];
      }
    }
  }
  return extractImageUrls(content, tags)[0];
}

/**
 * A human title for an event's media (audio/video) — the `title` or `subject`
 * tag if present (NIP-14 / podcast conventions), else the first non-empty line of
 * the note's text with media/mention noise stripped. Returns undefined when
 * there's nothing meaningful, so callers can fall back to a filename.
 */
export function extractNoteTitle(content: string, tags: string[][] = []): string | undefined {
  for (const tag of tags) {
    if ((tag[0] === "title" || tag[0] === "subject") && tag[1]?.trim()) return tag[1].trim();
  }
  const firstLine = (content || "")
    .split("\n")
    .map((l) =>
      l
        .replace(/https?:\/\/\S+/g, "")
        .replace(/nostr:[a-z0-9]+/gi, "")
        .replace(/[📊✨🎙️📻🎧]/gu, "")
        .trim(),
    )
    .find((l) => l.length > 1);
  if (!firstLine) return undefined;
  return firstLine.length > 80 ? firstLine.slice(0, 79).trimEnd() + "…" : firstLine;
}

/** Strip media/mention noise to a short plain-text preview (for OG description). */
export function plainTextPreview(content: string, maxLen = 140): string {
  const text = (content || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/nostr:[a-z0-9]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen - 1).trimEnd() + "…" : text;
}
