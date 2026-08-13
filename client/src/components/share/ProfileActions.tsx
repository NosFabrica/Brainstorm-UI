import { useState } from "react";
import { Link } from "wouter";
import { UserPlus, UserCheck, MoreHorizontal, VolumeX, Volume2, Flag, ExternalLink, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { followUser, unfollowUser, muteUser, unmuteUser, reportUser } from "@/services/socialActions";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUser } from "@/services/nostr";
import { isAdminPubkey } from "@/config/adminAccess";

const REPORT_REASONS = ["spam", "impersonation", "other"] as const;

/**
 * The primary relationship actions on the public profile (`/p/:id`), for a
 * logged-in viewer who is NOT the owner. Replaces the old "see this in your Web
 * of Trust → /profile" punt now that /p is the default profile: a Follow /
 * Following button + an overflow (⋯) menu with Mute/Unmute, Report, and a quiet
 * "Advanced view" link to the analytics page. Actions reuse the shared
 * socialActions helpers; state is optimistic with revert-on-failure.
 *
 * "Advanced view" is ADMIN-ONLY. It was the last user-facing door to
 * `/profile/:npub`, which is now operator telemetry — offering everyone a link
 * to a page they get redirected out of would be a dead end with a label on it.
 * Admins still land there, and it stays a link rather than a delete because
 * that page is where the trust internals are while we decide what's worth
 * porting.
 */
export function ProfileActions({
  targetPubkey,
  npub,
  initialFollowing,
  initialMuted,
  alreadyReported,
}: {
  targetPubkey: string;
  npub: string;
  initialFollowing: boolean;
  initialMuted: boolean;
  alreadyReported: boolean;
}) {
  // Gates the "Advanced view" link — see the note on this component.
  const viewerIsAdmin = isAdminPubkey(getCurrentUser()?.pubkey);
  const { toast } = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [muted, setMuted] = useState(initialMuted);
  const [reported, setReported] = useState(alreadyReported);
  const [busy, setBusy] = useState<null | "follow" | "mute">(null);

  const toggleFollow = async () => {
    setBusy("follow");
    const res = following ? await unfollowUser(targetPubkey) : await followUser(targetPubkey);
    setBusy(null);
    if (res.success) {
      setFollowing((v) => !v);
      toast({ title: following ? "Unfollowed" : "Following" });
    } else {
      toast({ variant: "destructive", title: "Couldn't update follow", description: res.error || "Try again." });
    }
  };

  const toggleMute = async () => {
    setBusy("mute");
    const res = muted ? await unmuteUser(targetPubkey) : await muteUser(targetPubkey);
    setBusy(null);
    if (res.success) {
      setMuted((v) => !v);
      toast({ title: muted ? "Unmuted" : "Muted" });
    } else {
      toast({ variant: "destructive", title: "Couldn't update mute", description: res.error || "Try again." });
    }
  };

  const submitReport = async (reason: string) => {
    const res = await reportUser(targetPubkey, reason);
    if (res.success) {
      setReported(true);
      toast({ title: "Reported", description: "This lowers their standing in your network." });
    } else {
      toast({ variant: "destructive", title: "Couldn't report", description: res.error || "Try again." });
    }
  };

  return (
    <div className="flex flex-1 md:flex-none items-center gap-2" data-testid="share-profile-actions">
      <button
        type="button"
        onClick={toggleFollow}
        disabled={busy === "follow"}
        className={
          following
            ? "flex flex-1 md:flex-none items-center justify-center gap-1.5 h-9 md:h-8 px-4 md:px-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm md:text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            : "flex flex-1 md:flex-none items-center justify-center gap-1.5 h-9 md:h-8 px-4 md:px-3.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-sm md:text-[13px] font-semibold shadow-sm disabled:opacity-50 transition-colors"
        }
        data-testid="share-follow"
      >
        {busy === "follow" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : following ? (
          <UserCheck className="h-4 w-4" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        {following ? "Following" : "Follow"}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-9 w-9 md:h-8 md:w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            aria-label="More actions"
            data-testid="share-actions-menu"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem className="gap-2" onClick={toggleMute} disabled={busy === "mute"}>
            {muted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {muted ? "Unmute" : "Mute"}
          </DropdownMenuItem>

          {reported ? (
            <DropdownMenuItem className="gap-2 text-amber-600" disabled>
              <Flag className="h-4 w-4" /> Reported
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <Flag className="h-4 w-4" /> Report
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {REPORT_REASONS.map((r) => (
                  <DropdownMenuItem key={r} className="capitalize" onClick={() => void submitReport(r)}>
                    {r}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {viewerIsAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="gap-2 text-slate-500 dark:text-slate-400">
                <Link href={`/profile/${npub}`} data-testid="share-advanced-view">
                  <ExternalLink className="h-4 w-4" /> Advanced view
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The owner's own-profile overflow menu: no follow/mute/report (you can't act on
 * yourself), just a ⋯ menu with the quiet "Advanced view" link — so the owner's
 * controls look identical to everyone else's instead of a bare text link.
 *
 * Renders NOTHING for a non-admin, because "Advanced view" is its only item and
 * a ⋯ button that opens an empty menu is worse than no button.
 */
export function OwnerActions({ npub }: { npub: string }) {
  if (!isAdminPubkey(getCurrentUser()?.pubkey)) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 md:h-8 md:w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          aria-label="More actions"
          data-testid="share-owner-menu"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild className="gap-2 text-slate-500">
          <Link href={`/profile/${npub}`} data-testid="share-advanced-view">
            <ExternalLink className="h-4 w-4" /> Advanced view
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
