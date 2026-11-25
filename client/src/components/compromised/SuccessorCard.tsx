import { useMemo } from "react";
import { UserCheck } from "lucide-react";
import { AccountTile, FollowAccount } from "@/components/share/AccountTile";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { useRecentByKinds } from "@/hooks/useRecentByKinds";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { profileName } from "@/lib/displayName";
import { eventPath } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { fetchEventsByIds } from "@/services/nostr";

/**
 * The owner's new account, shown where their Compromised one is: who it is,
 * a Follow for a signed-in reader, and its latest post — so the way out of a
 * compromised account is on the same screen as the warning.
 *
 * Green on purpose, inside the red: the one safe thing on the page.
 */
export function SuccessorCard({
  pubkey,
  announcementId = null,
  latestPost = true,
  className,
}: {
  pubkey: string;
  /** The new account's own post about the move, when one is recorded: shown in place of the latest. */
  announcementId?: string | null;
  /** Show a post under the name: the announcement, else the new account's newest. */
  latestPost?: boolean;
  className?: string;
}) {
  const { profile } = useLiveProfile(pubkey);
  const pinnedId = latestPost ? announcementId : null;
  const pinnedFilters = useMemo(() => (pinnedId ? [{ ids: [pinnedId] }] : null), [pinnedId]);
  const pinned = useStoreEvents(pinnedId ? `successor-post:${pinnedId}` : null, pinnedFilters, () =>
    fetchEventsByIds([pinnedId!]),
  );
  // Only the new account's own word counts as its announcement.
  const announcement = pinned.events.find((e) => e.id === pinnedId && e.pubkey === pubkey);
  const notes = useRecentByKinds(latestPost && !announcement ? pubkey : null, [1], 5);
  const name = profileName(profile, pubkey);
  const latest = announcement ?? notes.events[0];
  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-300 bg-white p-3 shadow-sm dark:border-emerald-500/30 dark:bg-slate-900 sm:p-3.5",
        className,
      )}
      data-testid="compromised-successor"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> The owner's new account
      </p>
      <AccountTile
        pubkey={pubkey}
        profile={profile}
        showNpub
        ariaLabel="The owner's new account"
        className="mt-2 flex-wrap"
        linkClassName="group/successor min-w-[11rem] flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        avatarClassName="h-10 w-10"
        nameClassName="font-bold group-hover/successor:underline"
        linkTestId="compromised-successor-link"
        action={<FollowAccount pubkey={pubkey} name={name} testId="compromised-follow-successor" />}
      />
      {latest && (
        <div className="mt-3" data-testid="compromised-successor-post">
          <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {announcement ? "Their post about the new account" : "Their latest post"}
          </p>
          <EmbeddedNoteCard event={latest} author={profile} href={eventPath(latest)} nested />
        </div>
      )}
    </div>
  );
}
