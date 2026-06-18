/**
 * Visual defaults for empty profile images. These are rendered as fallbacks only —
 * they are NEVER written into the user's kind-0 (an empty picture/banner stays
 * omitted, keeping the Nostr identity honest and relays clean). The avatar default
 * is identity-derived (initials), never a shared stock photo.
 */
import defaultBannerSrc from "@assets/generated_images/signup_bg_abstract.webp";

/** Abstract brand art used as the default banner wherever `banner` is empty. */
export const DEFAULT_BANNER_SRC = defaultBannerSrc;

/** Brand accent gradient — load-time fallback tint behind the default banner image. */
export const DEFAULT_BANNER_CLASS = "bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]";

/** First letter (uppercased) of a display name, falling back to "U". */
export function initialsFor(nameOrNpub?: string): string {
  const s = (nameOrNpub || "").trim();
  if (!s) return "U";
  return s.charAt(0).toUpperCase();
}
