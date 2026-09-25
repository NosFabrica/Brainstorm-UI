import { proxiedSrc, useProxiedSrc } from "@/lib/imageProxy";
import type { ConnectionSpeed } from "@/lib/connection";

/** `sm` for list avatars, `lg` for avatars 56px and up. */
export type AvatarSize = "sm" | "lg";

/** A profile picture as a same-origin thumbnail when the image proxy is on; the original otherwise. */
export function avatarSrc(url: string, size: AvatarSize): string {
  return proxiedSrc(url, `avatar_${size}`);
}

/** A failed thumbnail is retried once as the original on a Normal connection; otherwise the fallback stands. */
export function useAvatarSrc(url: string | undefined, size: AvatarSize, speed: ConnectionSpeed) {
  return useProxiedSrc(url, `avatar_${size}`, speed);
}
