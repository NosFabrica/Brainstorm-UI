import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { npubFromPubkey } from "@/lib/shareId";

export interface FaceProfile {
  display_name?: string;
  name?: string;
  picture?: string;
}

export function displayName(pubkey: string, profiles?: Map<string, FaceProfile>): string {
  const p = profiles?.get(pubkey);
  return p?.display_name || p?.name || `${pubkey.slice(0, 8)}…`;
}

/** `/p/<npub>`, or "" when the pubkey won't encode. */
export function profilePath(pubkey: string): string {
  try {
    return `/p/${npubFromPubkey(pubkey)}`;
  } catch {
    return "";
  }
}

/**
 * Overlapping avatars of the people behind a claim — the same idiom the profile
 * page uses for "Followed by".
 *
 * A tag is somebody's opinion with their name on it, so showing faces isn't
 * decoration: it's the difference between "3 people say this" (a statistic) and
 * "Tanja, Avi and Rachel say this" (an accountable claim you can go check).
 *
 * Capped, because past three or four the pile stops reading as faces and starts
 * reading as a smudge, and the names beside it already carry the count.
 */
export function FacePile({
  pubkeys,
  profiles,
  max = 3,
  size = "md",
}: {
  pubkeys: string[];
  profiles?: Map<string, FaceProfile>;
  max?: number;
  /** `sm` for dense list rows, `md` where the pile is the row's anchor. */
  size?: "sm" | "md";
}) {
  const shown = pubkeys.slice(0, max);
  if (!shown.length) return null;
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";

  return (
    <div className="flex shrink-0 -space-x-2" data-testid="face-pile">
      {shown.map((pk) => {
        const name = displayName(pk, profiles);
        const href = profilePath(pk);
        const avatar = (
          <Avatar
            className={`${box} border-2 border-white bg-white dark:border-slate-900 dark:bg-slate-900`}
          >
            {profiles?.get(pk)?.picture ? (
              <AvatarImage src={profiles.get(pk)!.picture} alt={name} className="object-cover" />
            ) : null}
            <AvatarFallback className="overflow-hidden">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
        );
        return href ? (
          <Link key={pk} href={href} title={name} className="transition-opacity hover:opacity-80">
            {avatar}
          </Link>
        ) : (
          <span key={pk}>{avatar}</span>
        );
      })}
    </div>
  );
}

/**
 * "Alice and Bob", "Alice, Bob and 3 others" — each name linked to its profile,
 * because the profile is where you can look into the claim (or tag them back if
 * you want to).
 */
export function NameList({
  pubkeys,
  profiles,
  max = 2,
  className = "font-semibold text-slate-700 hover:text-brand-primary dark:text-slate-200",
}: {
  pubkeys: string[];
  profiles?: Map<string, FaceProfile>;
  max?: number;
  className?: string;
}) {
  const shown = pubkeys.slice(0, max);
  const extra = pubkeys.length - shown.length;

  return (
    <span>
      {shown.map((pk, i) => {
        const name = displayName(pk, profiles);
        const href = profilePath(pk);
        return (
          <span key={pk}>
            {i > 0 && (extra > 0 || i < shown.length - 1 ? ", " : " and ")}
            {href ? (
              <Link href={href} className={className} data-testid="face-name">
                {name}
              </Link>
            ) : (
              <span className={className}>{name}</span>
            )}
          </span>
        );
      })}
      {extra > 0 && ` and ${extra} ${extra === 1 ? "other" : "others"}`}
    </span>
  );
}
