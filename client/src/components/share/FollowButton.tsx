import { useState } from "react";
import { Loader2, UserCheck, UserMinus, UserPlus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { followUser, unfollowUser } from "@/services/socialActions";
import { useToast } from "@/hooks/use-toast";

const BASE = "flex flex-1 md:flex-none items-center justify-center gap-1.5 h-9 md:h-8 px-4 md:px-3.5 rounded-lg text-sm md:text-[13px] font-semibold disabled:opacity-50 transition-colors";
const FOLLOW = `${BASE} bg-brand-primary hover:bg-brand-primary-hover text-white shadow-sm`;
const FOLLOWING = `${BASE} border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200`;
const UNFOLLOW = `${BASE} border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400`;

/**
 * Follow / Following on the public profile (`/p/:id`), for a signed-in
 * viewer who is not the owner. X's shape: the button shows the state;
 * "Following" turns into a red "Unfollow" under the pointer, and a click
 * asks first — one click used to unfollow, the one people regret
 * (Benjamin, 2026-09-08). Following is one click, as before. Optimistic,
 * reverting on failure. The ⋯ that used to ride beside it is `ProfileMenu`.
 */
export function FollowButton({ targetPubkey, initialFollowing, displayName }: { targetPubkey: string; initialFollowing: boolean; /** For "Unfollow {name}?" */ displayName: string }) {
  const { toast } = useToast();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const publish = async (next: boolean) => {
    setBusy(true);
    const res = next ? await followUser(targetPubkey) : await unfollowUser(targetPubkey);
    setBusy(false);
    if (res.cancelled) return;
    if (res.success) {
      setFollowing(next);
      setHover(false);
      toast({ title: next ? "Following" : "Unfollowed" });
    } else {
      toast({ variant: "destructive", title: "Couldn't update follow", description: res.error || "Try again." });
    }
  };

  const unfollowLook = following && hover && !busy;
  return (
    <>
      <button
        type="button"
        onClick={() => (following ? setConfirming(true) : void publish(true))}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        disabled={busy}
        className={following ? (unfollowLook ? UNFOLLOW : FOLLOWING) : FOLLOW}
        data-testid="share-follow"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : unfollowLook ? <UserMinus className="h-4 w-4" /> : following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {following ? (unfollowLook ? "Unfollow" : "Following") : "Follow"}
      </button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent data-testid="follow-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Unfollow {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>Their posts stop counting toward your network's view, and they will not be told.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="follow-confirm-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                void publish(false);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="follow-confirm-unfollow"
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
