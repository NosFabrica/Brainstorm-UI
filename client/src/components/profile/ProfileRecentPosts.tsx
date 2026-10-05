import { useMemo } from "react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { MessagesSquare, Loader2 } from "lucide-react";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { fetchEventsByFilter, fetchEventsByIds } from "@/services/nostr";
import { eventPath } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * A short "Recent posts" strip for a single profile — the last few kind-1 notes,
 * rendered with the same ShareNoteCard used across the app so a note looks
 * identical here, in the dashboard feed and on a share page. Read-only: each
 * note opens the full conversation at /e/:id (no composer yet). Renders nothing
 * when the profile has no recent text notes, so it never leaves an empty block.
 */
export function ProfileRecentPosts({ pubkey, limit = 3 }: { pubkey: string; limit?: number }) {
  const notesQuery = useStoreEvents(
    pubkey ? `profile-recent-notes:${pubkey}` : null,
    pubkey ? [{ kinds: [1], authors: [pubkey], limit: 20 }] : null,
    () => fetchEventsByFilter({ kinds: [1], authors: [pubkey], limit: 20 }),
    { minMs: 2 * 60_000 },
  );

  const notes = useMemo<MinimalEvent[]>(() => {
    const all = (notesQuery.events ?? []) as MinimalEvent[];
    return [...all]
      .filter((e) => (e.content ?? "").trim().length > 0)
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .slice(0, limit);
  }, [notesQuery.events, limit]);

  // Parents of any replies, so "replying to…" resolves with real context.
  const parentIds = useMemo(
    () =>
      Array.from(
        new Set(notes.flatMap((e) => (e.tags ?? []).filter((t: string[]) => t[0] === "e").map((t: string[]) => t[1]))),
      ).slice(0, 12),
    [notes],
  );
  const parentsQuery = useStoreEvents(
    notesQuery.settled && parentIds.length ? `profile-recent-parents:${parentIds.join(",")}` : null,
    parentIds.length ? [{ ids: parentIds }] : null,
    () => fetchEventsByIds(parentIds),
  );
  const eventsById = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const e of (parentsQuery.events ?? []) as MinimalEvent[]) m.set(e.id, e);
    return m;
  }, [parentsQuery.events]);

  const profilePubkeys = useMemo(() => {
    const s = new Set<string>([pubkey]);
    eventsById.forEach((e) => s.add(e.pubkey));
    return Array.from(s);
  }, [pubkey, eventsById]);
  const profileMap = useLiveProfiles(profilePubkeys);
  const profiles = profileMap;

  if (notesQuery.loading && notes.length === 0) {
    return (
      <div
        className="mb-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900 dark:shadow-none"
        data-testid="profile-recent-posts-loading"
      >
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading recent posts…
        </div>
      </div>
    );
  }
  if (notes.length === 0) return null;

  return (
    <ShareNavProvider>
      {/* mb-4 matches the sibling sections on /profile — that page has no
          space-y on the container, so each section owns its own bottom margin.
          Without it this card sat flush against Social Reach. Both this and the
          loading state carry it so the gap doesn't pop in when content arrives. */}
      <div
        className="mb-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-900 dark:shadow-none"
        data-testid="profile-recent-posts"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900 sm:px-4 sm:py-2.5">
          <MessagesSquare className="h-3.5 w-3.5 text-brand-deep dark:text-brand-accent" />
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 sm:text-xs">
            Recent posts
          </h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {notes.map((e) => (
            <div key={e.id} className="p-3 sm:p-4" data-testid="profile-recent-post">
              <ShareNoteCard
                event={e}
                profiles={profiles}
                eventsById={eventsById}
                href={eventPath(e)}
                showAuthor={false}
              />
            </div>
          ))}
        </div>
      </div>
    </ShareNavProvider>
  );
}
