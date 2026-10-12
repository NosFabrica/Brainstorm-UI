/**
 * A NIP-71 video event (kinds 21 / 22 and the addressable 34235 / 34236) read
 * for showing: when it was posted, how long and what shape it is, its
 * hashtags, whether its creator marked it sensitive, and where it came from.
 *
 * As found on live events: Divine's app publishes shorts as 34236, with one
 * `imeta` (`url`, `m video/mp4`, `image`, `dim`), `title`, `summary`, `t`s,
 * `published_at`, `duration`, `alt`, `verification` and a `client` of "Divine".
 * A restored classic Vine is a 34236 too: `platform vine`, an `l` of
 * `vine-archive`, `loops` / `likes`, the original `author`, and the Vine's own
 * `published_at`. Its `created_at` is the day it was imported, so the posted
 * date is `published_at` whenever that is a believable time. The `proofmode`
 * and `device_attestation` tags are 10 to 20 KB each and are never read here.
 */
import { contentWarningOf, type ContentWarning } from "@/lib/nip36";
import { expirationOf } from "@/lib/nip40";
import { extractVideoUrls } from "@/lib/noteContent";
import { tagValue } from "@/lib/resultReaders";

type Tagged = { tags: string[][] };
type VideoEvent = Tagged & { kind: number; created_at: number; content?: string };

/** NIP-71 videos: normal / short, and their addressable twins. */
export const VIDEO_KINDS: ReadonlySet<number> = new Set([21, 22, 34235, 34236]);
/** The short ones, which loop. */
export const SHORT_VIDEO_KINDS: ReadonlySet<number> = new Set([22, 34236]);

/** What a restored Vine says about its first life. */
export interface VineStats {
  loops?: number;
  likes?: number;
  /** The name it was posted under on Vine. */
  author?: string;
}

export interface Video {
  /** Unix seconds: `published_at` when it is a believable time, else `created_at`. */
  publishedAt: number;
  durationSeconds?: number;
  dim?: { width: number; height: number };
  /** Lowercase, each once, in the event's order. */
  hashtags: string[];
  contentWarning: ContentWarning | null;
  /** Unix seconds (NIP-40). */
  expiresAt?: number;
  vine: VineStats | null;
  /** Divine's own capture check: recorded in its app, or in Divine on the web. */
  capture: "mobile" | "web" | null;
  /** The video's page on divine.video, for a video Divine published or hosts. */
  divineUrl?: string;
  /** The summary without the title said again, or a Vine's "Original stats" line. */
  description?: string;
  alt?: string;
}

const DAY = 86_400;
/** 2006-01-01: nothing here was posted before Twitter, let alone Vine. */
const EARLIEST = 1_136_073_600;
const DIGITS = /^\d+$/;

/** A tag value as a whole number of zero or more, or nothing. */
function count(value: string | null): number | undefined {
  if (!value || !DIGITS.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}

/** The first `imeta` part named `key`: "dim 1080x1920" → "1080x1920". */
function imetaPart(event: Tagged, key: string): string | null {
  for (const tag of event.tags) {
    if (tag[0] !== "imeta") continue;
    const part = tag.slice(1).find((p) => p.startsWith(`${key} `));
    if (part) return part.slice(key.length + 1).trim();
  }
  return null;
}

function vineOf(event: Tagged): VineStats | null {
  const isVine =
    tagValue(event, "platform")?.toLowerCase() === "vine" ||
    event.tags.some((t) => t[0] === "l" && t[1] === "vine-archive");
  if (!isVine) return null;
  const stats: VineStats = {};
  const loops = count(tagValue(event, "loops"));
  const likes = count(tagValue(event, "likes"));
  const author = tagValue(event, "author");
  if (loops !== undefined) stats.loops = loops;
  if (likes !== undefined) stats.likes = likes;
  if (author) stats.author = author;
  return stats;
}

function isDivineHost(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "divine.video" || host.endsWith(".divine.video");
  } catch {
    return false;
  }
}

const DIVINE_CLIENTS = new Set(["Divine", "vine-archive-importer"]);

function divineUrlOf(event: VideoEvent): string | undefined {
  const d = tagValue(event, "d");
  if (!d) return undefined;
  const client = event.tags.find((t) => t[0] === "client")?.[1] ?? "";
  const video = extractVideoUrls(event.content ?? "", event.tags)[0] ?? tagValue(event, "url") ?? undefined;
  if (!DIVINE_CLIENTS.has(client) && !isDivineHost(video)) return undefined;
  return `https://divine.video/video/${encodeURIComponent(d)}`;
}

/**
 * The words under the title. `withoutTitle` (lib/resultSummary) leaves a title
 * of one or two words alone, and a Vine's title is often just that, so a
 * leading line is dropped here only when it is the title and nothing else.
 */
function descriptionOf(event: VideoEvent, isVine: boolean): string | undefined {
  const title = (tagValue(event, "title") ?? "").toLowerCase();
  const isTitle = (text: string) => !!title && text.trim().toLowerCase() === title;
  let lines = (tagValue(event, "summary") ?? event.content ?? "").trim().split("\n");
  if (isTitle(lines[0])) lines = lines.slice(1);
  if (isVine) lines = lines.filter((line) => !/^Original stats:/i.test(line.trim()));
  const text = lines.join("\n").trim();
  return text && !isTitle(text) ? text : undefined;
}

/**
 * When the video was posted, in unix seconds: `published_at` when it is a
 * believable time, else `created_at`. On its own for a byline, which needs
 * nothing else `readVideo` reads.
 */
export function publishedAtOf(
  event: Tagged & { created_at: number },
  nowSeconds = Math.floor(Date.now() / 1000),
): number {
  const published = count(tagValue(event, "published_at"));
  return published !== undefined && published >= EARLIEST && published <= nowSeconds + DAY
    ? published
    : event.created_at;
}

/** A length in seconds, when the value is a plain number above zero: "6", "6.033". */
function secondsOf(value: string | null): number | undefined {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

export function readVideo(event: VideoEvent, nowSeconds = Math.floor(Date.now() / 1000)): Video {
  const dim = /^(\d+)x(\d+)$/i.exec(imetaPart(event, "dim") ?? "");
  const [width, height] = dim ? [Number(dim[1]), Number(dim[2])] : [0, 0];
  const verification = tagValue(event, "verification");
  const vine = vineOf(event);
  return {
    publishedAt: publishedAtOf(event, nowSeconds),
    // The imeta's own length first; one that is not a number gives way to the tag.
    durationSeconds: secondsOf(imetaPart(event, "duration")) ?? secondsOf(tagValue(event, "duration")),
    dim: width > 0 && height > 0 ? { width, height } : undefined,
    hashtags: [
      ...new Set(
        event.tags
          .filter((t) => t[0] === "t")
          .map((t) => (t[1] ?? "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ],
    contentWarning: contentWarningOf(event),
    expiresAt: expirationOf(event),
    vine,
    capture: verification === "verified_mobile" ? "mobile" : verification === "verified_web" ? "web" : null,
    divineUrl: divineUrlOf(event),
    description: descriptionOf(event, !!vine),
    alt: tagValue(event, "alt") ?? undefined,
  };
}
