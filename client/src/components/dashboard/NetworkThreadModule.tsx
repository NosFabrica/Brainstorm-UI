import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessagesSquare, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { useNetworkAlerts } from "@/hooks/useNetworkAlerts";
import { fetchEventsByFilter, fetchProfileMap, fetchEventsByIds } from "@/services/nostr";
import { eventPath } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * "From people you follow" — a recent conversation thread from the observer's
 * DIRECT follows (1 hop). Complements the articles module above it, which is
 * deliberately 2-hop discovery: this is the circle you already chose, that one
 * is what's just outside it.
 *
 * Read-only by design while posting/replying doesn't exist. Rather than fake a
 * composer, each note opens the full conversation at /e/:id — the same surface
 * the public share pages already use, so members and visitors read threads in
 * exactly one place.
 */

const NOTE_KIND = 1;
const DAY = 24 * 60 * 60;
const WINDOW_DAYS = 7;
/** Keep one voice from filling the thread. */
const MAX_PER_AUTHOR = 2;
const MAX_ROWS = 6;

function tagged(e: MinimalEvent, name: string): string[] {
  return (e.tags ?? []).filter((t: string[]) => t[0] === name).map((t: string[]) => t[1]).filter(Boolean);
}

export function NetworkThreadModule({ observer, enabled }: { observer: string; enabled: boolean }) {
  const [, navigate] = useLocation();
  const alerts = useNetworkAlerts(observer, { enabled, limit: 100 });

  // People you actually follow. Reuses the dashboard's in-flight /networkAlerts
  // query rather than re-deriving a contact list.
  const authors = useMemo(() => {
    const direct = alerts.data?.data?.directFollows ?? [];
    return direct.filter((e) => e.hops <= 1).map((e) => e.pubkey).slice(0, 100);
  }, [alerts.data]);

  const notesQuery = useQuery({
    queryKey: ["network-thread", authors.join(",")],
    queryFn: () =>
      fetchEventsByFilter({
        kinds: [NOTE_KIND],
        authors,
        since: Math.floor(Date.now() / 1000) - WINDOW_DAYS * DAY,
        limit: 80,
      }),
    enabled: enabled && authors.length > 0,
    staleTime: 2 * 60_000,
    retry: false,
  });

  const notes = useMemo<MinimalEvent[]>(() => {
    const all = (notesQuery.data ?? []) as MinimalEvent[];
    const perAuthor = new Map<string, number>();
    const out: MinimalEvent[] = [];
    for (const e of [...all].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))) {
      if (!(e.content ?? "").trim()) continue;
      const used = perAuthor.get(e.pubkey) ?? 0;
      if (used >= MAX_PER_AUTHOR) continue;
      perAuthor.set(e.pubkey, used + 1);
      out.push(e);
      if (out.length >= MAX_ROWS) break;
    }
    return out;
  }, [notesQuery.data]);

  // Parents of any replies, so "replying to…" renders with real context instead
  // of a bare id — the same treatment the public share pages give a reply.
  const parentIds = useMemo(
    () => Array.from(new Set(notes.flatMap((e) => tagged(e, "e")))).slice(0, 20),
    [notes],
  );
  const parentsQuery = useQuery({
    queryKey: ["network-thread-parents", parentIds.join(",")],
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

  // Authors of both the notes and any parents they reply to.
  const profilePubkeys = useMemo(() => {
    const s = new Set<string>();
    for (const e of notes) s.add(e.pubkey);
    eventsById.forEach((e) => s.add(e.pubkey));
    return Array.from(s);
  }, [notes, eventsById]);
  const profilesQuery = useQuery({
    queryKey: ["network-thread-profiles", profilePubkeys.join(",")],
    queryFn: () => fetchProfileMap(profilePubkeys),
    enabled: profilePubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data ?? new Map();

  const loading = alerts.isLoading || (authors.length > 0 && notesQuery.isLoading);
  if (!enabled || (!loading && notes.length === 0)) return null;

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 mb-6" data-testid="card-network-thread">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
          <MessagesSquare className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          From people you follow
        </span>
        <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">Last 7 days</span>
      </div>

      {loading && notes.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" data-testid="network-thread-loading">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Catching up on your circle…
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {notes.map((e) => (
            <div key={e.id} className="py-2 first:pt-0 last:pb-0" data-testid="network-thread-note">
              <ShareNoteCard
                event={e}
                profiles={profiles}
                eventsById={eventsById}
                href={eventPath(e)}
                showAuthor
              />
            </div>
          ))}
        </div>
      )}

      {!loading && notes.length > 0 && (
        <button
          type="button"
          onClick={() => navigate("/network?group=following&view=list")}
          className="mt-2 self-start text-[11px] font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
          data-testid="network-thread-view-all"
        >
          See everyone you follow →
        </button>
      )}
    </Card>
  );
}
