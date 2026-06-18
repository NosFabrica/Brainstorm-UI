/**
 * Lightweight tokenizer for Nostr kind-1 note content. There is no
 * `applesauce-content` parser installed, so this turns a raw `content` string
 * into renderable tokens — text, links, inline images/video, `nostr:` mentions,
 * and hashtags — for the share page's note teasers. Intentionally minimal: a
 * taste of the note, not a full client renderer.
 */

export type NoteToken =
  | { type: "text"; value: string }
  | { type: "url"; value: string }
  | { type: "image"; value: string }
  | { type: "video"; value: string }
  | { type: "mention"; bech32: string }
  | { type: "hashtag"; value: string };

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

// One pass: URLs, nostr: bech32 mentions, and #hashtags. Everything else is text.
const TOKEN_REGEX =
  /(https?:\/\/[^\s]+)|(nostr:(?:npub|nprofile|nevent|note)1[02-9ac-hj-np-z]+)|(#[\p{L}\p{N}_]+)/giu;

function classifyUrl(url: string): NoteToken {
  if (IMAGE_EXT.test(url)) return { type: "image", value: url };
  if (VIDEO_EXT.test(url)) return { type: "video", value: url };
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
    if (url) tokens.push(classifyUrl(url));
    else if (mention) tokens.push({ type: "mention", bech32: mention.replace(/^nostr:/, "") });
    else if (hashtag) tokens.push({ type: "hashtag", value: hashtag });
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

/** Strip media/mention noise to a short plain-text preview (for OG description). */
export function plainTextPreview(content: string, maxLen = 140): string {
  const text = (content || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/nostr:[a-z0-9]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen - 1).trimEnd() + "…" : text;
}
