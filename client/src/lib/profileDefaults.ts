/**
 * Visual defaults for empty profile images. These are rendered as fallbacks only —
 * they are NEVER written into the user's kind-0 (an empty picture/banner stays
 * omitted, keeping the Nostr identity honest and relays clean).
 */
import defaultBannerSrc from "@assets/generated_images/signup_bg_abstract.webp";
import defaultAvatarSrc from "@/assets/avatar-default.webp";
import defaultAvatarFlaggedSrc from "@/assets/avatar-default-flagged.webp";

/** Abstract brand art used as the default banner wherever `banner` is empty. */
export const DEFAULT_BANNER_SRC = defaultBannerSrc;

/** Branded person-silhouette avatar shown wherever a profile `picture` is empty
 *  or fails to load (instead of a bare initial). */
export const DEFAULT_AVATAR_SRC = defaultAvatarSrc;

/** Red warning variant — shown instead of DEFAULT_AVATAR_SRC for a FLAGGED
 *  account with no picture, so a flagged profile reads as risky at a glance. */
export const DEFAULT_AVATAR_FLAGGED_SRC = defaultAvatarFlaggedSrc;

/** Brand accent gradient — load-time fallback tint behind the default banner image. */
export const DEFAULT_BANNER_CLASS = "bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]";

/** First letter (uppercased) of a display name, falling back to "U". */
export function initialsFor(nameOrNpub?: string): string {
  const s = (nameOrNpub || "").trim();
  if (!s) return "U";
  return s.charAt(0).toUpperCase();
}
