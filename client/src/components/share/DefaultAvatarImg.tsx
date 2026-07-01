import { DEFAULT_AVATAR_SRC, DEFAULT_AVATAR_FLAGGED_SRC } from "@/lib/profileDefaults";

/**
 * The branded person-silhouette avatar, sized to fill an `<AvatarFallback>`.
 * Used wherever a profile has no `picture` (or it fails to load) instead of a
 * bare initial letter. When `flagged`, shows the red warning variant so a
 * flagged account reads as risky at a glance.
 */
export function DefaultAvatarImg({ flagged = false }: { flagged?: boolean }) {
  return <img src={flagged ? DEFAULT_AVATAR_FLAGGED_SRC : DEFAULT_AVATAR_SRC} alt="" className="h-full w-full object-cover" />;
}
