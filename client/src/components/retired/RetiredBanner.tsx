import { useState } from "react";
import { Link } from "wouter";
import { Archive, ArrowRight, Check, Loader2 } from "lucide-react";
import { activeAccount } from "@/accounts/signing";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { FollowButton } from "@/components/share/FollowButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useRelationshipBadges } from "@/hooks/useRelationshipBadges";
import { useRetired } from "@/hooks/useRetired";
import { useToast } from "@/hooks/use-toast";
import { withListEdit } from "@/lib/listEdits";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { unfollowUser } from "@/services/socialActions";

/**
 * The notice a Retired account's own page leads with.
 *
 * Quiet on purpose, where the Compromised banner is loud: nothing is wrong
 * with a Retired account, its owner just isn't there. So it is one slim row in
 * the page's neutral tone: what this is on the left, the owner's Current
 * account to follow on the right, and under it a way for a follower to drop
 * the old one. No card inside a card, no post, no report: the profile it sits
 * above stays on the screen.
 */
export function RetiredBanner({ pubkey, className }: { pubkey: string | null | undefined; className?: string }) {
  const status = useRetired(pubkey);
  if (!status) return null;
  return (
    <section
      role="note"
      aria-labelledby="retired-title"
      className={cn(
        "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60 sm:px-5",
        className,
      )}
      data-testid="retired-banner"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            aria-hidden="true"
          >
            <Archive className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id="retired-title" className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
              This account is retired
            </h2>
            <p className="text-[13px] leading-snug text-slate-500 dark:text-slate-400">
              Its owner no longer uses it. Posts and messages here may go unseen.
            </p>
          </div>
        </div>
        <CurrentAccount pubkey={status.currentPubkey} />
      </div>
      <RetiredUnfollow pubkey={status.pubkey} />
    </section>
  );
}

/** The owner's Current account, in the notice's own row: who it is, and a Follow for a signed-in reader. */
function CurrentAccount({ pubkey }: { pubkey: string }) {
  const { profile } = useLiveProfile(pubkey);
  const rel = useRelationshipBadges(pubkey);
  const npub = npubFromPubkey(pubkey);
  const name = profile?.display_name || profile?.name || `${npub.slice(0, 12)}…`;
  return (
    <div
      className="flex w-full items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800 sm:w-auto sm:justify-start sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"
      data-testid="retired-current"
    >
      <Link
        href={`/p/${npub}`}
        className="group/current flex min-w-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        aria-label={`Their current account: ${name}`}
        data-testid="retired-current-link"
      >
        <Avatar className="h-9 w-9 shrink-0 border border-slate-200 dark:border-slate-800">
          {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden">
            <DefaultAvatarImg />
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400">
            Their current account
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold leading-snug text-slate-900 group-hover/current:underline dark:text-slate-100">
            <span className="truncate">{name}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          </span>
        </span>
      </Link>
      {rel.enabled && (
        <div className="flex shrink-0">
          <FollowButton
            key={String(rel.isFollowing)}
            targetPubkey={pubkey}
            initialFollowing={rel.isFollowing}
            displayName={name}
            testId="retired-current-follow"
          />
        </div>
      )}
    </div>
  );
}

/** For a reader who follows the Retired account: a plain way to stop. One click, as on a profile. */
function RetiredUnfollow({ pubkey }: { pubkey: string }) {
  const { toast } = useToast();
  const rel = useRelationshipBadges(pubkey);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  if (!rel.enabled) return null;
  if (state === "done")
    return (
      <p
        className="mt-2 flex items-center gap-1 pl-11 text-xs font-medium text-slate-500 dark:text-slate-400"
        data-testid="retired-unfollowed"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> Unfollowed
      </p>
    );
  if (!rel.isFollowing) return null;

  const unfollow = async () => {
    setState("busy");
    const me = activeAccount()?.pubkey;
    const send = () => unfollowUser(pubkey);
    const res = me ? await withListEdit(3, me, pubkey, "remove", send) : await send();
    if (res.success) {
      setState("done");
      toast({ title: "Unfollowed" });
      return;
    }
    setState("idle");
    if (!res.cancelled)
      toast({ variant: "destructive", title: "Couldn't unfollow", description: res.error || "Try again." });
  };

  return (
    <p className="mt-2 pl-11 text-xs text-slate-500 dark:text-slate-400">
      You still follow this one.{" "}
      <button
        type="button"
        onClick={() => void unfollow()}
        disabled={state === "busy"}
        className="inline-flex items-center gap-1 font-semibold text-brand-link underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:opacity-60"
        data-testid="retired-unfollow"
      >
        {state === "busy" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
        Unfollow this account
      </button>
    </p>
  );
}
