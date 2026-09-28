import { useState } from "react";
import { env } from "@/lib/runtimeEnv";
import type { ConnectionSpeed } from "@/lib/connection";

/**
 * The shapes the image proxy will produce. Each name is an imgproxy preset, so
 * this list and the chart's `imgProxy.presets` have to agree.
 *
 * Avatars are square crops; media keeps its aspect ratio and is named for the
 * widest it is ever drawn: `media_320` for thumbnails, `media_640` for tiles
 * and cards, `media_1280` for anything full width.
 */
export type Preset = "avatar_sm" | "avatar_lg" | "media_320" | "media_640" | "media_1280";

/** Sources we hand over untouched: the proxy keeps one frame, and a still GIF is a broken post. */
function isAnimated(url: string, mime?: string): boolean {
  if (mime) return mime === "image/gif";
  return /\.gif(\?|#|$)/i.test(url);
}

/**
 * A picture at the size it is drawn, when the image proxy is on; the original
 * otherwise. Animated sources always keep their original.
 */
export function proxiedSrc(url: string, preset: Preset, mime?: string): string {
  const proxy = env.VITE_IMG_PROXY;
  if (!proxy || !/^https?:\/\//i.test(url)) return url;
  if (isAnimated(url, mime)) return url;
  return `${proxy.replace(/\/+$/, "")}/insecure/${preset}/plain/${encodeURIComponent(url)}`;
}

/**
 * The src to render and what to do when it fails: a resized copy that doesn't
 * load is worth one try at the original where the bytes are affordable, and
 * `spent` says the picture has run out of tries.
 */
export function useProxiedSrc(
  url: string | undefined,
  preset: Preset,
  speed: ConnectionSpeed,
  mime?: string,
): { src: string | undefined; onError: () => void; spent: boolean } {
  const [fellBack, setFellBack] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  if (!url) return { src: url, onError: () => {}, spent: false };
  const src = fellBack.has(url) ? url : proxiedSrc(url, preset, mime);
  const onError = () => {
    if (src !== url && speed === "normal") setFellBack((prev) => new Set(prev).add(url));
    else setFailed((prev) => new Set(prev).add(url));
  };
  return { src, onError, spent: failed.has(url) };
}
