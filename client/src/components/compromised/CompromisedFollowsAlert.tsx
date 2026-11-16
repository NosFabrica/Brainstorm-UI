import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useCompromisedAmong } from "@/hooks/useCompromised";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useSocialActions } from "@/hooks/useSocialActions";
import type { CompromisedStatus } from "@/lib/compromised";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { CompromisedActions } from "./CompromisedActions";
import { SuccessorCard } from "./SuccessorCard";

/**
 * Network Alerts' loudest row: an account the reader follows is Compromised.
 *
 * Unlike a flagged follow — a count and a way in to /alerts — this one is
 * dealt with where it is shown: unfollow the old account, follow the owner's
 * new one. An account the reader unfollows here stays on screen for the visit,
 * or the Follow for the new account would vanish with it.
 */
export function CompromisedFollowsAlert({ observer, className }: { observer: string; className?: string }) {
  const social = useSocialActions(observer || undefined);
  const follows = useMemo(() => [...social.followed], [social.followed]);
  const found = useCompromisedAmong(observer ? follows : []);
  const [shown, setShown] = useState<Map<string, CompromisedStatus>>(new Map());
  useEffect(() => {
    if (!found.length) return;
    setShown((prev) => {
      const next = new Map(prev);
      for (const status of found) next.set(status.pubkey, status);
      return next;
    });
  }, [found]);
  const list = [...shown.values()];
  const profiles = useLiveProfiles(useMemo(() => list.map((s) => s.pubkey), [shown])); // eslint-disable-line react-hooks/exhaustive-deps
  if (!observer || list.length === 0) return null;

  return (
    <section
      role="alert"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-red-300 bg-red-50 shadow-sm dark:border-red-500/40 dark:bg-red-950/40",
        className,
      )}
      data-testid="compromised-follows-alert"
    >
      <span className="absolute inset-y-0 left-0 w-1.5 bg-red-600 dark:bg-red-500" aria-hidden="true" />
      <div className="py-4 pl-6 pr-4 sm:pl-7 sm:pr-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-red-900 dark:text-red-100">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
          {list.length === 1
            ? "An account you follow is compromised"
            : `${list.length} accounts you follow are compromised`}
        </h2>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-red-900/80 dark:text-red-100/80">
          Someone other than the owner controls {list.length === 1 ? "it" : "them"} now. Don't send money or trust links
          from {list.length === 1 ? "it" : "them"}.
        </p>
        <ul className="mt-3 space-y-3">
          {list.map((status) => {
            const npub = npubFromPubkey(status.pubkey);
            const profile = profiles.get(status.pubkey);
            const name = profile?.display_name || profile?.name || `${npub.slice(0, 12)}…`;
            return (
              <li
                key={status.pubkey}
                className="space-y-2.5"
                data-testid={`compromised-follow-${status.pubkey.slice(0, 8)}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/p/${npub}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-80">
                    <Avatar className="h-9 w-9 shrink-0 border border-white shadow-[0_0_0_1px_#ffffff,0_0_0_3px_#dc2626] dark:border-slate-900 dark:shadow-[0_0_0_1px_#0f172a,0_0_0_3px_#ef4444]">
                      {profile?.picture ? <AvatarImage src={profile.picture} alt="" className="object-cover" /> : null}
                      <AvatarFallback className="overflow-hidden">
                        <DefaultAvatarImg />
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-semibold text-red-950 dark:text-red-50">{name}</span>
                  </Link>
                  <CompromisedActions pubkey={status.pubkey} />
                </div>
                {status.successorPubkey && <SuccessorCard pubkey={status.successorPubkey} latestPost={false} />}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
