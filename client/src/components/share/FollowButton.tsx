import { useState } from "react";
import { Loader2, UserCheck, UserPlus } from "lucide-react";
import { followUser, unfollowUser } from "@/services/socialActions";
import { useToast } from "@/hooks/use-toast";

/**
 * Follow / Following on the public profile (`/p/:id`), for a signed-in
 * viewer who is not the owner. Optimistic, reverting on failure. The ⋯ menu
 * that used to ride beside it — Mute, Report, Advanced view — is
 * `ProfileMenu` now, which everyone gets; this is the one control that
 * needs a session.
 */
export function FollowButton({ targetPubkey, initialFollowing }: { targetPubkey: string; initialFollowing: boolean }) {
  const { toast } = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  const toggleFollow = async () => {
    setBusy(true);
    const res = following ? await unfollowUser(targetPubkey) : await followUser(targetPubkey);
    setBusy(false);
    if (res.cancelled) return;
    if (res.success) {
      setFollowing((v) => !v);
      toast({ title: following ? "Unfollowed" : "Following" });
    } else {
      toast({ variant: "destructive", title: "Couldn't update follow", description: res.error || "Try again." });
    }
  };

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={busy}
      className={
        following
          ? "flex flex-1 md:flex-none items-center justify-center gap-1.5 h-9 md:h-8 px-4 md:px-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm md:text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          : "flex flex-1 md:flex-none items-center justify-center gap-1.5 h-9 md:h-8 px-4 md:px-3.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-sm md:text-[13px] font-semibold shadow-sm disabled:opacity-50 transition-colors"
      }
      data-testid="share-follow"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      {following ? "Following" : "Follow"}
    </button>
  );
}
