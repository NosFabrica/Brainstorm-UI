import { useMemo, useState } from "react";
import { useRoute, Redirect, Link, useLocation } from "wouter";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Users, SlidersHorizontal } from "lucide-react";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";
import { fetchProfileForShare, fetchProfileMap, fetchReportsForPubkey, type ReportMetadata } from "@/services/nostr";
import { logout } from "@/accounts/login-flow";
import { AccountMenu } from "@/components/AccountMenu";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { REPORT_TYPE_BADGE_COLORS, formatReportTime } from "@/lib/reportMeta";
import { apiClient } from "@/services/api";
import { toPubkeys, toInfluenceMap, type GraphEntry } from "@/services/graphHelpers";
import { Wordmark } from "@/components/Wordmark";
import { InfoHint } from "@/components/InfoHint";
import { TrustScoreModal, useScorePov, PovToggle, type ScorePov } from "@/components/score/TrustScorePov";
import { VerificationCoin } from "@/components/score/VerificationCoin";
import { useHasSession } from "@/hooks/useHasSession";
import { PersonListRow } from "@/components/PersonListRow";
import { TIER_LABELS } from "@/services/trustThreshold";
import { useTierGranularity } from "@/hooks/useTierGranularity";

type ConnKind = "followed_by" | "following" | "muted_by" | "reported_by";

const TYPE_MAP: Record<
  string,
  { kind: ConnKind; verifiedOnly: boolean; title: (name: string) => string; subtitle: (name: string) => string; empty: string }
> = {
  followers: { kind: "followed_by", verifiedOnly: true, title: (n) => `Verified followers of ${n}`, subtitle: (n) => `Trusted people who follow ${n}.`, empty: "No verified followers yet." },
  following: { kind: "following", verifiedOnly: false, title: (n) => `${n} is following`, subtitle: (n) => `People ${n} follows.`, empty: "Not following anyone yet." },
  muters: { kind: "muted_by", verifiedOnly: true, title: (n) => `Verified accounts muting ${n}`, subtitle: (n) => `Trusted people who have muted ${n}.`, empty: "No verified muters." },
  reporters: { kind: "reported_by", verifiedOnly: true, title: (n) => `Verified accounts reporting ${n}`, subtitle: (n) => `Trusted people who have reported ${n}.`, empty: "No verified reporters." },
};

const PAGE = 20;

export default function ConnectionListPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/p/:id/:type");
  const me = useActiveAccountDisplay();
  const handleLogout = () => logout();
  const rawId = params?.id || "";
  const type = params?.type || "";
  const decoded = useMemo(() => decodeShareId(rawId), [rawId]);
  const pubkey = decoded?.pubkey || "";
  const relayHints = decoded?.relays || [];
  const cfg = TYPE_MAP[type];

  // POV: honors the sitewide score-POV toggle. Personalized needs a signed-in
  // viewer with calculated scores; otherwise (or when the viewer chose Global)
  // the house perspective serves — `house: true` forces the unauthenticated view.
  const signedIn = useHasSession();
  const calcDone = (() => { try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; } })();
  const { pov: scorePov } = useScorePov();
  const [scoreExplainOpen, setScoreExplainOpen] = useState(false);
  const myPov = signedIn && calcDone && scorePov === "personalized";

  // Filter & sort panel (toggled by the icon next to the title). Both map 1:1 to
  // server params — tier filters, order sorts by trust score — so pagination
  // stays honest (no client-side reshuffling of partial pages).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tierFilter, setTierFilter] = useState<"all" | "high" | "medium_high" | "medium" | "medium_low">("all");
  // Decision 7, with a constraint: the backend's `tier` filter is one bucket at a
  // time and can't express "Verified = every tier above the line", so under
  // Simple the five-shade chips are hidden rather than mislabelled. The rows'
  // coins already show the bucket.
  const [granularity] = useTierGranularity();
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Subject profile — reuse SharePage's cache key so a click from /p/:id is warm.
  const subjectQuery = useQuery({
    queryKey: ["share-profile", pubkey],
    queryFn: () => fetchProfileForShare(pubkey, { relayHints }),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const connQuery = useInfiniteQuery<
    { items: GraphEntry[]; next_cursor: string | null },
    Error,
    { pages: { items: GraphEntry[]; next_cursor: string | null }[]; pageParams: (string | undefined)[] },
    readonly unknown[],
    string | undefined
  >({
    queryKey: ["share-conn", pubkey, cfg?.kind, type, myPov, tierFilter, sortOrder],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const res = await apiClient.getUserConnections(pubkey, cfg!.kind, {
        limit: PAGE,
        cursor: pageParam || undefined,
        order: sortOrder,
        tier: tierFilter === "all" ? undefined : tierFilter,
        verified_only: cfg!.verifiedOnly,
        house: !myPov,
      });
      return {
        items: (res?.data?.items ?? []) as GraphEntry[],
        next_cursor: (res?.data?.next_cursor ?? null) as string | null,
      };
    },
    initialPageParam: undefined,
    getNextPageParam: (last: { next_cursor: string | null }) => last?.next_cursor ?? undefined,
    enabled: !!pubkey && !!cfg,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const items = useMemo(() => (connQuery.data?.pages ?? []).flatMap((pg) => pg.items), [connQuery.data]);
  const pubkeys = useMemo(() => toPubkeys(items), [items]);
  const influence = useMemo(() => toInfluenceMap(items), [items]);

  const profilesQuery = useQuery({
    queryKey: ["conn-profiles", pubkeys.join(",")],
    queryFn: () => fetchProfileMap(pubkeys),
    enabled: pubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // For the "reporters" view, fetch the actual NIP-56 (kind 1984) reports from
  // relays so each row can show the report's type, time, and reason — the same
  // data the profile page surfaces. Progressive: rows render from the API first,
  // then annotate as reports resolve. Rows with no matched report stay plain.
  const reportsQuery = useQuery({
    queryKey: ["conn-reports", pubkey],
    queryFn: () => fetchReportsForPubkey(pubkey),
    enabled: !!pubkey && cfg?.kind === "reported_by",
    staleTime: 5 * 60_000,
    retry: false,
  });
  const reportMap = useMemo(() => {
    const m = new Map<string, ReportMetadata>();
    for (const r of reportsQuery.data ?? []) {
      const prev = m.get(r.reporterPubkey);
      if (!prev || r.timestamp > prev.timestamp) m.set(r.reporterPubkey, r);
    }
    return m;
  }, [reportsQuery.data]);

  // Guard rails — bad share id or unknown list type.
  // `replace`, never push. wouter's <Redirect> PUSHES by default, and these are
  // guards that can fire transiently: on the first render after an in-app
  // navigation `useRoute` hasn't matched yet, so `rawId` is empty, `decoded` is
  // null, and this fired — shoving "/" into history BETWEEN the profile and this
  // list. The page then rendered correctly, so nothing looked wrong until the
  // user pressed Back and landed on the home page having lost their place.
  // A guard redirect must only ever REPLACE the entry it rejects.
  // Params not resolved yet is NOT a bad URL. `useRoute` can return null params
  // on the first render after an in-app navigation, making `rawId` empty and
  // `decoded` null — and redirecting on that rewrote history for a URL that was
  // about to be perfectly valid, which is what sent people to the home page when
  // they pressed Back. Wait for the route instead; only a rawId that genuinely
  // fails to decode is a bad link.
  if (!rawId) return null;
  if (!decoded) return <Redirect to="/" replace />;
  if (!cfg) return <Redirect to={`/p/${rawId}`} replace />;

  const subject = (subjectQuery.data ?? {}) as Record<string, string | undefined>;
  const subjectName =
    subject.display_name || subject.name || (pubkey ? npubFromPubkey(pubkey).slice(0, 12) + "…" : "this profile");
  const profileMap = profilesQuery.data;
  const loading = connQuery.isLoading;

  // "What does verified mean?" popover — POV-aware so it nudges the right next
  // step: sign in (logged out) → watch calculation (calculating) → tune it (yours).
  const povLink = "font-medium text-brand-primary hover:text-brand-primary-hover";
  const currentPath = `/p/${rawId}/${type}`;
  const verifiedPopover = !signedIn ? (
    <>
      <p><strong className="font-semibold text-slate-700 dark:text-slate-200">Verified</strong> means an account the network vouches for — its score clears the threshold, so bots and unknown accounts don't count.</p>
      <p className="mt-1.5">Right now you're seeing <strong className="font-semibold text-slate-700 dark:text-slate-200">Brainstorm's</strong> point of view. <Link href={`/login?next=${encodeURIComponent(currentPath)}`} className={povLink}>Sign in</Link> to switch to <em>your own</em> network — once your scores are calculated.</p>
      <Link href="/what-is-wot" className={`mt-2 inline-block ${povLink}`}>Learn how it works →</Link>
    </>
  ) : !calcDone ? (
    <>
      <p><strong className="font-semibold text-slate-700 dark:text-slate-200">Verified</strong> means an account the network vouches for — bots and unknown accounts don't count.</p>
      <p className="mt-1.5">You're signed in, but <strong className="font-semibold text-slate-700 dark:text-slate-200">your scores are still being calculated</strong>. Until they're ready, this shows Brainstorm's point of view.</p>
      <Link href="/dashboard" className={`mt-1 inline-block ${povLink}`}>Check your dashboard →</Link>
      <Link href="/what-is-wot" className={`mt-2 block ${povLink}`}>Learn how it works →</Link>
    </>
  ) : (
    <>
      <p><strong className="font-semibold text-slate-700 dark:text-slate-200">Verified</strong> means an account <em>your own</em> network vouches for — the accounts <strong className="font-semibold text-slate-700 dark:text-slate-200">you</strong> trust decide who counts.</p>
      <p className="mt-1.5">You're seeing your own point of view. Tune the threshold in <Link href="/settings?tab=trust" className={povLink}>Settings</Link> — Relax, Default, or Strict.</p>
      <Link href="/what-is-wot" className={`mt-2 inline-block ${povLink}`}>Learn how it works →</Link>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          {/* Pops history rather than navigating to the profile. As a <Link> this
              PUSHED a duplicate entry, so "Back" moved the user forward: the
              stack became [profile, list, profile] and the browser's own Back
              then returned to the list they'd just left. Do that across a few
              profiles and the stack fills with duplicates — back-tapping
              retraces the loop instead of retreating, and eventually overshoots
              to wherever the session began.

              A <button>, not an <a>: same shape AlertsPage / InsightsPage /
              ReadingPage / ProfilePage already use for their back controls, and
              it can't fall through to a full document navigation the way an
              anchor does if the handler ever declines to preventDefault. Nobody
              needs to open "Back" in a new tab. `navigate` is the cold-deep-link
              fallback when there's no history to pop. */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
              else navigate(`/p/${rawId}`);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-100 hover:text-slate-900 dark:hover:text-white transition-colors"
            data-testid="conn-back"
          >
            <ArrowLeft className="h-4 w-4" /> Back to {subjectName.split(" ")[0]}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/" className="flex items-center" data-testid="conn-brand">
              <Wordmark height={24} className="dark:hidden" />
              <Wordmark height={24} variant="white" className="hidden dark:block" />
            </Link>
            {me && <AccountMenu user={me} onLogout={handleLogout} />}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-accent/30 bg-brand-deep/5 text-brand-deep">
              <Users className="h-4 w-4" />
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="conn-title">
              {cfg.title(subjectName)}
            </h1>
            {cfg.verifiedOnly && (
              <InfoHint label="What does verified mean?">{verifiedPopover}</InfoHint>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className={`ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${filtersOpen || tierFilter !== "all" || sortOrder !== "desc" ? "border-brand-primary/25 bg-brand-primary/10 text-brand-primary" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
              title="Filter & sort"
              data-testid="conn-filter-toggle"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
          {!loading && items.length > 0 && (
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400" data-testid="conn-subtitle">{cfg.subtitle(subjectName)}</p>
          )}
          {/* The POV lens sits LEFT, in the primary reading path, on its own line
              (both breakpoints) — it reframes every score and the tier buckets,
              so it reads as the list's lens, not a right-rail utility like the
              filter. Left-aligned = one clean content edge + better discovery. */}
          <div className="mt-3">
            <PovToggle canPersonalize={signedIn && calcDone} avatarUrl={me?.picture} className="shrink-0" />
          </div>

          {filtersOpen && (
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm space-y-2.5" data-testid="conn-filter-panel">
              {/* Five tier chips plus an inline label can't fit 390px, so they used
                  to wrap onto a second (and ragged third) line. The label now sits
                  above and the chips ride a single horizontally-scrollable line —
                  the familiar mobile filter-chip pattern, and it can't re-wrap on a
                  narrower phone. `-mx-3 px-3` bleeds the scroll area to the card
                  edge so it reads as scrollable; from `sm:` up there's room, so it
                  reverts to a plain wrapping row. Scrollbars are hidden app-wide. */}
              {granularity === "detailed" && (
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Trust level</span>
                <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  {([["all", "All"], ["high", TIER_LABELS.high], ["medium_high", TIER_LABELS.trusted], ["medium", TIER_LABELS.neutral], ["medium_low", TIER_LABELS.low]] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTierFilter(value)}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${tierFilter === value ? "border-brand-primary/25 bg-brand-primary/10 text-brand-primary" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                      data-testid={`conn-filter-${value}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              )}
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Sort</span>
                <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  {([["desc", "Most trusted first"], ["asc", "Least trusted first"]] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSortOrder(value)}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${sortOrder === value ? "border-brand-primary/25 bg-brand-primary/10 text-brand-primary" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                      data-testid={`conn-sort-${value}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse" data-testid="conn-skeleton">
                <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0" />
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-800" />
                  <div className="h-2.5 w-24 rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              </div>
            ))
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500" data-testid="conn-empty">{cfg.empty}</p>
          ) : (
            items.map((entry) => {
              const pk = typeof entry === "string" ? entry : entry.pubkey;
              const inf = influence.get(pk) ?? null;
              const p = profileMap?.get(pk);
              const score = typeof inf === "number" ? Math.min(1, Math.max(0, inf)) : null;
              const rm = cfg.kind === "reported_by" ? reportMap.get(pk) : undefined;
              return (
                <PersonListRow
                  key={pk}
                  pubkey={pk}
                  displayName={p?.display_name || p?.name}
                  picture={p?.picture}
                  nip05={p?.nip05}
                  score={score}
                  pov={scorePov}
                  testId={`conn-row-${pk.slice(0, 8)}`}
                  meta={rm && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5" data-testid={`conn-report-${pk.slice(0, 8)}`}>
                      <span className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium ${REPORT_TYPE_BADGE_COLORS[rm.reportType] || REPORT_TYPE_BADGE_COLORS.other}`}>{rm.reportType}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatReportTime(rm.timestamp)}</span>
                      {rm.reason && <span className="max-w-[160px] truncate text-[10px] italic text-slate-400 dark:text-slate-500" title={rm.reason}>"{rm.reason}"</span>}
                    </div>
                  )}
                />
              );
            })
          )}
        </div>

        {connQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => connQuery.fetchNextPage()}
            disabled={connQuery.isFetchingNextPage}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white text-sm font-semibold py-2.5 transition-colors"
            data-testid="conn-load-more"
          >
            {connQuery.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Show more
          </button>
        )}
      </main>
      <TrustScoreModal open={scoreExplainOpen} onOpenChange={setScoreExplainOpen} />
    </div>
  );
}

