import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MessageSquare, ArrowRight, SlidersHorizontal, Loader2 } from "lucide-react";
import { fetchEventsByFilter, fetchProfileMap, getCurrentUser, triggerScoringAndAnchor, PROFILE_RELAYS } from "@/services/nostr";
import { knownFollowCount } from "@/lib/followStore";
import { apiClient, hasSessionToken } from "@/services/api";
import { collectRefs, type MinimalEvent } from "@/lib/noteRefs";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { eventPath } from "@/lib/shareId";
import { TIER_THRESHOLDS } from "@/services/trustThreshold";
import { useActivePov } from "@/hooks/useActivePov";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };

const TEASER_COUNT = 5;
const TRUST_FILTERS = [
  { key: "all", label: "All", min: 0 },
  { key: "trusted", label: "Trusted+", min: TIER_THRESHOLDS.medium_high },
  { key: "high", label: "Highly Trusted", min: TIER_THRESHOLDS.high },
] as const;

/**
 * The reply thread for an event. Anonymous viewers see a teaser (top few) then a
 * signup gate; logged-in viewers get the full thread plus a CLIENT-CONTROLLED
 * trust filter — hide comments from people below their Web-of-Trust bar (the
 * game-changer: a decentralized, user-owned discussion filter). Scoring is
 * per-pubkey today (cached + batched); a backend batch endpoint makes it instant.
 */
export function EventThread({
  eventId,
  addressCoord,
  authorNpub,
  relayHints,
  onGateChange,
}: {
  eventId: string;
  /** For addressable roots (e.g. NIP-23 articles): the `kind:pubkey:dtag`
      coordinate, so NIP-22 comments tagging `#A`/`#a` are fetched too. */
  addressCoord?: string;
  authorNpub: string;
  relayHints: string[];
  /** Reports whether the anon signup gate is showing, so the page can hide its
      own (now-redundant) funnel. */
  onGateChange?: (gated: boolean) => void;
}) {
  const loggedIn = hasSessionToken();
  const [pov] = useActivePov();
  const { hasMywot } = useHasMywot();
  const { isSearchObserver } = useIsSearchObserver();
  const usePersonal = loggedIn && hasMywot && isSearchObserver && pov === "mywot";
  const povTag = usePersonal ? "mywot" : "house";

  // Return-here-after-auth: the current /e URL, so signup/onboarding brings them
  // straight back to this thread.
  const here = typeof window !== "undefined" ? window.location.pathname : "";
  const nextQ = here ? `next=${encodeURIComponent(here)}` : "";
  const loginHref = `/login?${[authorNpub ? `invite=${authorNpub}` : "", nextQ].filter(Boolean).join("&")}`;
  const buildWotHref = `/welcome${nextQ ? `?${nextQ}` : ""}`;

  // Existing users with follows just need to CALCULATE; brand-new accounts need to
  // build a network first. (`knownFollowCount` is populated at login from their
  // existing kind-3 contact list.)
  const myPubkey = getCurrentUser()?.pubkey || "";
  const myFollows = myPubkey ? knownFollowCount(myPubkey) : 0;
  const [calcTriggered, setCalcTriggered] = useState(false);

  const relays = useMemo(() => Array.from(new Set([...relayHints, ...PROFILE_RELAYS])), [relayHints]);

  const repliesQuery = useQuery({
    queryKey: ["thread-replies", "v3", eventId, addressCoord ?? ""],
    // kind-1 = NIP-10 replies (notes); kind-1111 = NIP-22 comments (pictures,
    // videos, articles, …). NIP-22 tags the parent with lowercase `#e`/`#a` and
    // the root scope with uppercase `#E`/`#A` — query each so every kind of thread
    // fills in. Addressable roots (articles) are referenced by their coordinate.
    queryFn: async () => {
      const filters: Record<string, unknown>[] = [
        { "#e": [eventId], kinds: [1, 1111], limit: 150 },
        { "#E": [eventId], kinds: [1111], limit: 150 },
      ];
      if (addressCoord) {
        filters.push({ "#A": [addressCoord], kinds: [1111], limit: 150 });
        filters.push({ "#a": [addressCoord], kinds: [1111], limit: 150 });
      }
      const results = await Promise.all(filters.map((f) => fetchEventsByFilter(f, relays, 7000)));
      const byId = new Map<string, MinimalEvent>();
      for (const e of results.flat() as MinimalEvent[]) byId.set(e.id, e);
      return Array.from(byId.values());
    },
    enabled: !!eventId,
    staleTime: 60_000,
    retry: false,
  });

  const replies = useMemo(() => {
    const evs = ((repliesQuery.data ?? []) as MinimalEvent[]).filter((e) => e.id !== eventId);
    return evs.sort((a, b) => a.created_at - b.created_at);
  }, [repliesQuery.data, eventId]);

  const refs = useMemo(() => collectRefs(replies), [replies]);
  const authorPubkeys = useMemo(
    () => Array.from(new Set([...replies.map((r) => r.pubkey), ...refs.pubkeys])),
    [replies, refs],
  );
  const profilesQuery = useQuery({
    queryKey: ["thread-profiles", eventId, authorPubkeys],
    queryFn: () => fetchProfileMap(authorPubkeys),
    enabled: authorPubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = (profilesQuery.data ?? new Map()) as Map<string, ProfileLite>;

  // --- Trust filter (logged-in) -------------------------------------------
  const [minTrust, setMinTrust] = useState(0);
  const scoreCache = useRef(new Map<string, number | null>());
  const [scoreVersion, setScoreVersion] = useState(0);
  const [scoring, setScoring] = useState(false);

  const fetchScores = useCallback(async (pubkeys: string[]) => {
    const key = (pk: string) => `${povTag}:${pk}`;
    const todo = pubkeys.filter((pk) => !scoreCache.current.has(key(pk)));
    if (!todo.length) return;
    setScoring(true);
    for (let i = 0; i < todo.length; i += 8) {
      const batch = todo.slice(i, i + 8);
      const res = await Promise.allSettled(
        batch.map(async (pk) => {
          let s: unknown = null;
          if (usePersonal) {
            const ov = (await apiClient.getUserOverview(pk)) as { data?: { influence?: unknown } };
            s = ov?.data?.influence;
          } else {
            s = await apiClient.getHouseInfluence(pk);
          }
          return { pk, s: typeof s === "number" && Number.isFinite(s) ? s : null };
        }),
      );
      res.forEach((r) => { if (r.status === "fulfilled") scoreCache.current.set(key(r.value.pk), r.value.s); });
      setScoreVersion((v) => v + 1);
    }
    setScoring(false);
  }, [povTag, usePersonal]);

  // Score every commenter as soon as a logged-in viewer loads the thread — the
  // per-comment trust pill is always-on, not gated behind the filter.
  useEffect(() => {
    if (loggedIn && replies.length) {
      void fetchScores(Array.from(new Set(replies.map((r) => r.pubkey))));
    }
  }, [loggedIn, replies, fetchScores]);

  const scoreFor = (pk: string) => scoreCache.current.get(`${povTag}:${pk}`);

  const filtered = useMemo(() => {
    if (minTrust <= 0) return replies;
    return replies.filter((r) => {
      const s = scoreFor(r.pubkey);
      return s == null ? true : s >= minTrust; // not-yet-scored stays visible
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replies, minTrust, scoreVersion, povTag]);

  const hiddenCount = replies.length - filtered.length;
  const shown = loggedIn ? filtered : replies.slice(0, TEASER_COUNT);
  const gatedCount = replies.length - TEASER_COUNT;
  const isAnonGated = !loggedIn && gatedCount > 0;

  // Tell the page whether our signup gate is showing (so it drops its own funnel).
  useEffect(() => {
    onGateChange?.(isAnonGated);
    return () => onGateChange?.(false);
  }, [isAnonGated, onGateChange]);

  if (repliesQuery.isLoading) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-slate-400" data-testid="thread-loading">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading comments…
      </div>
    );
  }
  if (replies.length === 0) return null;

  return (
    <section className="mt-6" data-testid="event-thread">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
          <MessageSquare className="h-4 w-4 text-slate-400" /> Comments <span className="text-slate-400 font-semibold">({replies.length})</span>
        </h2>
        {loggedIn && (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-0.5" data-testid="thread-trust-filter" title="Filter comments by trust in your current perspective">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 ml-1.5" />
            {TRUST_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setMinTrust(f.min)}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${minTrust === f.min ? "bg-[#3730a3] text-white" : "text-slate-500 hover:text-slate-800"}`}
                data-testid={`thread-filter-${f.key}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loggedIn && !usePersonal && (
        <p className="mb-2 text-xs text-slate-500" data-testid="thread-filter-unlock">
          {calcTriggered ? (
            <span className="inline-flex items-center gap-1 text-[#333286]"><Loader2 className="h-3 w-3 animate-spin" /> Calculating your Web of Trust — the filter switches to your perspective when it's ready.</span>
          ) : myFollows > 0 ? (
            <>Filtering by the Brainstorm network.{" "}
              <button
                type="button"
                onClick={() => { if (myPubkey) { void triggerScoringAndAnchor(myPubkey); setCalcTriggered(true); } }}
                className="font-semibold text-[#3730a3] hover:underline"
                data-testid="thread-calc-wot"
              >
                Calculate your Web of Trust to filter by who YOU trust →
              </button>
            </>
          ) : (
            <>Filtering by the Brainstorm network.{" "}
              <Link href={buildWotHref} className="font-semibold text-[#3730a3] hover:underline">Follow people to filter by your own Web of Trust →</Link>
            </>
          )}
        </p>
      )}

      {loggedIn && minTrust > 0 && (
        <p className="mb-2 text-xs text-slate-500" data-testid="thread-filter-status">
          {scoring ? (
            <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Scoring commenters in {usePersonal ? "your Web of Trust" : "the Brainstorm network"}…</span>
          ) : (
            <>{hiddenCount} {hiddenCount === 1 ? "comment" : "comments"} hidden by your trust filter ({usePersonal ? "your Web of Trust" : "Brainstorm network"}).</>
          )}
        </p>
      )}

      <div className="space-y-2">
        {shown.map((reply) => (
          <EmbeddedNoteCard
            key={reply.id}
            event={reply}
            author={profiles.get(reply.pubkey)}
            profiles={profiles}
            href={eventPath(reply, relayHints)}
            trustScore01={loggedIn ? scoreFor(reply.pubkey) : undefined}
          />
        ))}
      </div>

      {!loggedIn && gatedCount > 0 && (
        <div className="mt-3 rounded-2xl border border-[#7c86ff]/25 bg-gradient-to-br from-[#333286]/[0.04] to-[#7c86ff]/[0.06] p-5 text-center" data-testid="thread-gate">
          <p className="text-sm font-bold text-slate-900">See the whole conversation</p>
          <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">
            Create a free account to read all {replies.length} comments, see who engaged, and <span className="font-semibold text-[#333286]">filter the thread through your own Web of Trust</span>.
          </p>
          <Link
            href={loginHref}
            className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            data-testid="thread-gate-cta"
          >
            Create your free account <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-2 text-[11px] text-slate-400">Free, takes a minute — no email required</p>
          <p className="mt-2 text-xs text-slate-500">
            Already part of the network? <Link href={loginHref} className="font-semibold text-[#3730a3] hover:underline" data-testid="thread-gate-signin">Sign in →</Link>
          </p>
        </div>
      )}
    </section>
  );
}
