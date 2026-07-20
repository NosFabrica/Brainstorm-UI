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

const REPORT_REASONS = ["spam", "impersonation", "other"] as const;

/**
 * The primary relationship actions on the public profile (`/p/:id`), for a
 * logged-in viewer who is NOT the owner. Replaces the old "see this in your Web
 * of Trust → /profile" punt now that /p is the default profile: a Follow /
 * Following button + an overflow (⋯) menu with Mute/Unmute, Report, and a quiet
 * "Advanced view" link to the analytics page (/profile/:npub). Actions reuse the
 * shared socialActions helpers; state is optimistic with revert-on-failure.
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
      toast({ title: "Reported", description: "This lowers their standing in your Web of Trust." });
    } else {
      toast({ variant: "destructive", title: "Couldn't report", description: res.error || "Try again." });
    }
  };

  return (
    <div className="flex items-center gap-2" data-testid="share-profile-actions">
      <button
        type="button"
        onClick={toggleFollow}
        disabled={busy === "follow"}
        className={
          following
            ? "flex flex-1 md:flex-none items-center justify-center gap-1.5 h-9 md:h-8 px-4 md:px-3.5 rounded-lg border border-slate-200 bg-white text-sm md:text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            : "flex flex-1 md:flex-none items-center justify-center gap-1.5 h-9 md:h-8 px-4 md:px-3.5 rounded-lg bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm md:text-[13px] font-semibold shadow-sm disabled:opacity-50 transition-colors"
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
            className="inline-flex h-9 w-9 md:h-8 md:w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
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

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild className="gap-2 text-slate-500">
            <Link href={`/profile/${npub}`} data-testid="share-advanced-view">
              <ExternalLink className="h-4 w-4" /> Advanced view
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
