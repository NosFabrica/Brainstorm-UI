/**
 * Someone's account as one row: their avatar and name, linking to their
 * profile, with what can be done about it beside (a Follow, or the actions a
 * Compromised account calls for). The Retired notice's Current account, a
 * Compromised account's successor and the follows-alert row are all this.
 */
import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { FollowButton } from "@/components/share/FollowButton";
import { useRelationshipBadges } from "@/hooks/useRelationshipBadges";
import { profileName, type NamedProfile } from "@/lib/displayName";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";

export function AccountTile({
  pubkey,
  profile,
  kicker,
  showNpub = false,
  arrow = true,
  ariaLabel,
  avatarClassName,
  nameClassName,
  linkClassName,
  linkTestId,
  action,
  className,
  testId,
}: {
  pubkey: string;
  profile: (NamedProfile & { picture?: string }) | undefined;
  /** A line above the name saying whose account this is. */
  kicker?: string;
  /** The npub under the name. */
  showNpub?: boolean;
  /** An arrow after the name: the row is a way to their profile. */
  arrow?: boolean;
  /** Read before the name: "The owner's new account: …". */
  ariaLabel?: string;
  avatarClassName?: string;
  nameClassName?: string;
  linkClassName?: string;
  linkTestId?: string;
  /** Beside the link: a Follow (`<FollowAccount>`), or other actions. */
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const npub = npubFromPubkey(pubkey);
  const name = profileName(profile, pubkey);
  return (
    <div className={cn("flex items-center gap-3", className)} data-testid={testId}>
      <Link
        href={`/p/${npub}`}
        className={cn("flex min-w-0 items-center gap-2.5", linkClassName)}
        aria-label={ariaLabel ? `${ariaLabel}: ${name}` : undefined}
        data-testid={linkTestId}
      >
        <Avatar className={cn("h-9 w-9 shrink-0 border border-slate-200 dark:border-slate-800", avatarClassName)}>
          {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden">
            <DefaultAvatarImg />
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          {kicker && (
            <span className="block text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400">
              {kicker}
            </span>
          )}
          <span
            className={cn(
              "flex items-center gap-1 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100",
              nameClassName,
            )}
          >
            <span className="truncate">{name}</span>
            {arrow && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />}
          </span>
          {showNpub && (
            <code className="block truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {npub.slice(0, 20)}…
            </code>
          )}
        </span>
      </Link>
      {action}
    </div>
  );
}

/** A Follow for `pubkey`, for a signed-in reader who isn't them; nothing otherwise. */
export function FollowAccount({ pubkey, name, testId }: { pubkey: string; name: string; testId: string }) {
  const rel = useRelationshipBadges(pubkey);
  if (!rel.enabled) return null;
  return (
    <div className="flex shrink-0">
      <FollowButton
        key={String(rel.isFollowing)}
        targetPubkey={pubkey}
        initialFollowing={rel.isFollowing}
        displayName={name}
        testId={testId}
      />
    </div>
  );
}
