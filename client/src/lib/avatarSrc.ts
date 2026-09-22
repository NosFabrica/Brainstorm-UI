import { useState } from "react";
import { env } from "@/lib/runtimeEnv";
import type { ConnectionSpeed } from "@/lib/connection";

/** `sm` for list avatars, `lg` for avatars 56px and up. Must match the imgproxy presets and nginx's `/img/` regex. */
export type AvatarSize = "sm" | "lg";

/** A profile picture as a same-origin thumbnail when the image proxy is on; the original otherwise. */
export function avatarSrc(url: string, size: AvatarSize): string {
  const proxy = env.VITE_IMG_PROXY;
  if (!proxy || !/^https?:\/\//i.test(url)) return url;
  return `${proxy.replace(/\/+$/, "")}/insecure/avatar_${size}/plain/${encodeURIComponent(url)}`;
}

/** A failed thumbnail is retried once as the original on a Normal connection; otherwise the fallback stands. */
export function useAvatarSrc(url: string | undefined, size: AvatarSize, speed: ConnectionSpeed): { src: string | undefined; onError: () => void } {
  const [fellBack, setFellBack] = useState<ReadonlySet<string>>(() => new Set());
  if (!url) return { src: url, onError: () => {} };
  const src = fellBack.has(url) ? url : avatarSrc(url, size);
  const onError = () => {
    if (src !== url && speed === "normal") setFellBack((prev) => new Set(prev).add(url));
  };
  return { src, onError };
}
