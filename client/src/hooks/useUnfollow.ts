/**
 * One follow or unfollow from a button: the edit shows at once everywhere the
 * viewer's follows are read (lib/listEdits), the kind 3 is published behind it
 * (services/socialActions, one edit at a time, on the newest list), and a
 * toast says how it went. A cancelled signer prompt is a change of mind, so it
 * says nothing.
 */
import { useCallback, useState } from "react";
import { activeAccount } from "@/accounts/signing";
import { useToast } from "@/hooks/use-toast";
import { withListEdit } from "@/lib/listEdits";
import { followUser, unfollowUser } from "@/services/socialActions";

/** `done` once the last edit landed; back to `idle` when it failed. */
export type FollowEditState = "idle" | "busy" | "done";

const FAILED = { add: "Couldn't follow", remove: "Couldn't unfollow" } as const;
const DONE = { add: "Following", remove: "Unfollowed" } as const;

/** Follow and unfollow `pubkey`; each resolves to whether it landed. */
export function useFollowEdit(pubkey: string) {
  const { toast } = useToast();
  const [state, setState] = useState<FollowEditState>("idle");

  const run = useCallback(
    async (action: "add" | "remove"): Promise<boolean> => {
      setState("busy");
      const send = () => (action === "add" ? followUser(pubkey) : unfollowUser(pubkey));
      const me = activeAccount()?.pubkey;
      const res = me ? await withListEdit(3, me, pubkey, action, send) : await send();
      if (res.success) {
        setState("done");
        toast({ title: DONE[action] });
        return true;
      }
      setState("idle");
      if (!res.cancelled)
        toast({ variant: "destructive", title: FAILED[action], description: res.error || "Try again." });
      return false;
    },
    [pubkey, toast],
  );

  const follow = useCallback(() => run("add"), [run]);
  const unfollow = useCallback(() => run("remove"), [run]);
  return { state, follow, unfollow };
}

/** Unfollow `pubkey` from a button: `state` says whether it's out, landed, or free to press. */
export function useUnfollow(pubkey: string) {
  const { state, unfollow } = useFollowEdit(pubkey);
  return { state, unfollow };
}
