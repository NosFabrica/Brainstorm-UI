import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessagesSquare, Loader2, Flame, Clock, Heart, Repeat2, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ShareNoteCard } from "@/components/share/ShareNoteCard";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { ShareNavProvider } from "@/components/share/ShareNavContext";
import { fetchEventsByFilter, fetchProfileMap, fetchEventsByIds } from "@/services/nostr";
import { fetchContactList, getFollowedPubkeys } from "@/services/socialActions";
import { eventPath } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";
import { cn } from "@/lib/utils";

/**
 * "From your network" — recent posts and replies from the people you actually
 * follow, in two modes:
 *   Trending — ranked by engagement (replies, reposts, reactions) from anyone.
 *   Latest   — plain reverse-chronological.
 *
 * Authors come from the user's real kind-3 contact list. An earlier cut sourced
 * them from /networkAlerts, which returns FLAGGED accounts — so the feed was
 * quietly showing only reported people. Content discovery must never inherit a
 * moderation query's population.
 *
 * Read-only while posting doesn't exist: notes open the full conversation at
 * /e/:id, the same surface the public share pages use.
 */

const DAY = 24 * 60 * 60;
const WINDOW_DAYS = 7;
const MAX_AUTHORS = 300;
const MAX_PER_AUTHOR = 3;
const MAX_ROWS = 40;

type Mode = "trending" | "latest";

/** Engagement weights: a reply is worth more than a repost, worth more than a like. */
const W_REPLY = 3;
const W_REPOST = 2;
const W_REACTION = 1;

export function NetworkThreadModule({ observer, enabled }: { observer: string; enabled: boolean }) {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("trending");

  // The user's ACTUAL follow list (kind 3) — not a moderation endpoint.
  const followsQuery = useQuery({
    queryKey: ["thread-contacts", observer],
    queryFn: async () => Array.from(getFollowedPubkeys(await fetchContactList(observer))),
    enabled: enabled && !!observer,
    staleTime: 10 * 60_000,
    retry: false,
  });
  const authors = useMemo(() => (followsQuery.data ?? []).slice(0, MAX_AUTHORS), [followsQuery.data]);

  const notesQuery = useQuery({
    queryKey: ["thread-notes", authors.length, authors[0] ?? ""],
    queryFn: () =>
      fetchEventsByFilter({
        kinds: [1],
        authors,
        since: Math.floor(Date.now() / 1000) - WINDOW_DAYS * DAY,
        limit: 400,
      }),
    enabled: enabled && authors.length > 0,
    staleTime: 2 * 60_000,
    retry: false,
  });

  const candidates = useMemo<MinimalEvent[]>(() => {
    const all = (notesQuery.data ?? []) as MinimalEvent[];
    return all.filter((e) => (e.content ?? "").trim().length > 0);
  }, [notesQuery.data]);

  // Engagement: replies (kind 1 with an #e), reposts (6) and reactions (7)
  // pointing at these notes — from ANYONE, not just the user's follows, since
  // that's what makes a post genuinely trending rather than locally popular.
  const candidateIds = useMemo(() => candidates.slice(0, 100).map((e) => e.id), [candidates]);
  const engagementQuery = useQuery({
    queryKey: ["thread-engagement", candidateIds.length, candidateIds[0] ?? ""],
    queryFn: () => fetchEventsByFilter({ kinds: [1, 6, 7], "#e": candidateIds, limit: 500 }),
    enabled: enabled && mode === "trending" && candidateIds.length > 0,
    staleTime: 2 * 60_000,
    retry: false,
  });

  const scores = useMemo(() => {
    const m = new Map<string, { replies: number; reposts: number; reactions: number; score: number }>();
    for (const ev of (engagementQuery.data ?? []) as MinimalEvent[]) {
      const targets = (ev.tags ?? []).filter((t: string[]) => t[0] === "e").map((t: string[]) => t[1]);
      // A reply/reaction can carry several e-tags (root + reply); credit the last,
      // which by NIP-10 convention is the event actually being responded to.
      const target = targets[targets.length - 1];
      if (!target) continue;
      const cur = m.get(target) ?? { replies: 0, reposts: 0, reactions: 0, score: 0 };
      if (ev.kind === 1) { cur.replies++; cur.score += W_REPLY; }
      else if (ev.kind === 6) { cur.reposts++; cur.score += W_REPOST; }
      else { cur.reactions++; cur.score += W_REACTION; }
      m.set(target, cur);
    }
    return m;
  }, [engagementQuery.data]);

  const notes = useMemo<MinimalEvent[]>(() => {
    const sorted = [...candidates].sort((a, b) => {
      if (mode === "latest") return (b.created_at ?? 0) - (a.created_at ?? 0);
      const sa = scores.get(a.id)?.score ?? 0;
      const sb = scores.get(b.id)?.score ?? 0;
      return sb === sa ? (b.created_at ?? 0) - (a.created_at ?? 0) : sb - sa;
    });
    const perAuthor = new Map<string, number>();
    const out: MinimalEvent[] = [];
    for (const e of sorted) {
      const used = perAuthor.get(e.pubkey) ?? 0;
      if (used >= MAX_PER_AUTHOR) continue;
      perAuthor.set(e.pubkey, used + 1);
      out.push(e);
      if (out.length >= MAX_ROWS) break;
    }
    return out;
  }, [candidates, scores, mode]);

  // Parents of replies, so "replying to…" renders with real context.
  const parentIds = useMemo(
    () => Array.from(new Set(notes.flatMap((e) => (e.tags ?? []).filter((t: string[]) => t[0] === "e").map((t: string[]) => t[1])))).slice(0, 24),
    [notes],
  );
  const parentsQuery = useQuery({
    queryKey: ["thread-parents", parentIds.join(",")],
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
    const s = new Set<string>();
    for (const e of notes) s.add(e.pubkey);
    eventsById.forEach((e) => s.add(e.pubkey));
    return Array.from(s);
  }, [notes, eventsById]);
  const profilesQuery = useQuery({
    queryKey: ["thread-profiles", profilePubkeys.join(",")],
    queryFn: () => fetchProfileMap(profilePubkeys),
    enabled: profilePubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data ?? new Map();
  // Trust scores for the feed's authors (the module's own `scores` map is
  // ENGAGEMENT, not trust). Shared session cache; house POV.
  const authorScoreOf = useAuthorScores(useMemo(() => notes.map((n) => n.pubkey), [notes]));

  const loading = followsQuery.isLoading || (authors.length > 0 && notesQuery.isLoading);
  if (!enabled || (!loading && candidates.length === 0)) return null;

  const tab = (val: Mode, label: string, Icon: typeof Flame) => (
    <button
      type="button"
      onClick={() => setMode(val)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
        mode === val
          ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
          : "text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white",
      )}
      data-testid={`thread-tab-${val}`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );

  return (
    // ShareNavProvider makes #hashtags and @mentions inside notes clickable —
    // hashtags jump straight to /t/:tag (their trust-ranked feed), mentions
    // confirm then open the profile. Without it these render as dead buttons.
    <ShareNavProvider>
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 mb-6" data-testid="card-network-thread">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
          <MessagesSquare className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          From your network
        </span>
        <div className="ml-auto inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 p-0.5" role="group" aria-label="Feed mode">
          {tab("trending", "Trending", Flame)}
          {tab("latest", "Latest", Clock)}
        </div>
      </div>

      {loading && notes.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" data-testid="network-thread-loading">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Catching up on your network…
        </div>
      ) : (
        // Flows with the page rather than living in an inner scrollbox: a feed
        // inside a scrollbox reads as a widget, not a place you settle into.
        // Centered reading column: a social feed run at the full ~1500px card
        // width makes every image a giant band. ~640px is the width real feeds
        // use, so cropped media reads as tasteful on desktop and mobile alike.
        <div className="mx-auto max-w-xl divide-y divide-slate-100 dark:divide-slate-800/60" data-testid="network-thread-list">
          {notes.map((e) => {
            const s = scores.get(e.id);
            return (
              <div key={e.id} className="py-2 first:pt-0" data-testid="network-thread-note">
                <ShareNoteCard event={e} profiles={profiles} eventsById={eventsById} href={eventPath(e)} showAuthor authorScore={authorScoreOf(e.pubkey)} />
                {mode === "trending" && s && s.score > 0 && (
                  <div className="mt-1 flex items-center gap-3 px-1 text-[11px] text-slate-400 dark:text-slate-500" data-testid="network-thread-engagement">
                    {s.replies > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{s.replies}</span>}
                    {s.reposts > 0 && <span className="inline-flex items-center gap-1"><Repeat2 className="h-3 w-3" />{s.reposts}</span>}
                    {s.reactions > 0 && <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" />{s.reactions}</span>}
                  </div>
                )}
              </div>
            );
          })}
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
    </ShareNavProvider>
  );
}
