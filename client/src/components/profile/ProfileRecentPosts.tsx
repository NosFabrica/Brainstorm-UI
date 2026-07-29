import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, Loader2 } from "lucide-react";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { fetchEventsByFilter, fetchProfileMap, fetchEventsByIds } from "@/services/nostr";
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
  const notesQuery = useQuery({
    queryKey: ["profile-recent-notes", pubkey],
    queryFn: () => fetchEventsByFilter({ kinds: [1], authors: [pubkey], limit: 20 }),
    enabled: !!pubkey,
    staleTime: 2 * 60_000,
    retry: false,
  });

  const notes = useMemo<MinimalEvent[]>(() => {
    const all = (notesQuery.data ?? []) as MinimalEvent[];
    return [...all]
      .filter((e) => (e.content ?? "").trim().length > 0)
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .slice(0, limit);
  }, [notesQuery.data, limit]);

  // Parents of any replies, so "replying to…" resolves with real context.
  const parentIds = useMemo(
    () => Array.from(new Set(notes.flatMap((e) => (e.tags ?? []).filter((t: string[]) => t[0] === "e").map((t: string[]) => t[1])))).slice(0, 12),
    [notes],
  );
  const parentsQuery = useQuery({
    queryKey: ["profile-recent-parents", parentIds.join(",")],
    queryFn: () => fetchEventsByIds(parentIds),
    enabled: parentIds.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const eventsById = useMemo(() => {
    const m = new Map<string, MinimalEvent>();
    for (const e of (parentsQuery.data ?? []) as MinimalEvent[]) m.set(e.id, e);
    return m;
  }, [parentsQuery.data]);

  const profilePubkeys = useMemo(() => {
    const s = new Set<string>([pubkey]);
    eventsById.forEach((e) => s.add(e.pubkey));
    return Array.from(s);
  }, [pubkey, eventsById]);
  const profilesQuery = useQuery({
    queryKey: ["profile-recent-profiles", profilePubkeys.join(",")],
    queryFn: () => fetchProfileMap(profilePubkeys),
    enabled: profilePubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data ?? new Map();

  if (notesQuery.isLoading && notes.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-4 shadow-sm dark:shadow-none" data-testid="profile-recent-posts-loading">
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
      <div className="mb-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 overflow-hidden shadow-sm dark:shadow-none" data-testid="profile-recent-posts">
        <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <MessagesSquare className="h-3.5 w-3.5 text-brand-deep dark:text-brand-accent" />
          <h4 className="text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Recent posts</h4>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {notes.map((e) => (
            <div key={e.id} className="p-3 sm:p-4" data-testid="profile-recent-post">
              <ShareNoteCard event={e} profiles={profiles} eventsById={eventsById} href={eventPath(e)} showAuthor={false} />
            </div>
          ))}
        </div>
      </div>
    </ShareNavProvider>
  );
}
