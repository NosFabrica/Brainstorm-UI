import { useMemo, useState } from "react";
import { useRoute, Redirect, Link } from "wouter";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Loader2, Users, BadgeCheck, SlidersHorizontal } from "lucide-react";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";
import { fetchProfileForShare, fetchProfileMap, fetchReportsForPubkey, type ReportMetadata } from "@/services/nostr";
import { REPORT_TYPE_BADGE_COLORS, formatReportTime } from "@/lib/reportMeta";
import { apiClient, hasSessionToken } from "@/services/api";
import { getVerifiedThreshold } from "@/services/trustThreshold";
import { toPubkeys, toInfluenceMap, type GraphEntry } from "@/services/graphHelpers";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrainLogo } from "@/components/BrainLogo";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { InfoHint } from "@/components/InfoHint";
import { TrustScoreModal, PovIcon, useScorePov } from "@/components/score/TrustScorePov";

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

/** Drop placeholder handles ("null"/"undefined"/empty) and the NIP-05 root prefix. */
function cleanNip05(v?: string): string | undefined {
  const s = (v || "").replace(/^_@/, "").trim();
  return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined" ? s : undefined;
}

const PAGE = 20;

export default function ConnectionListPage() {
  const [, params] = useRoute("/p/:id/:type");
  const rawId = params?.id || "";
  const type = params?.type || "";
  const decoded = useMemo(() => decodeShareId(rawId), [rawId]);
  const pubkey = decoded?.pubkey || "";
  const relayHints = decoded?.relays || [];
  const cfg = TYPE_MAP[type];

  // POV: honors the sitewide score-POV toggle. Personalized needs a signed-in
  // viewer with calculated scores; otherwise (or when the viewer chose Global)
  // the house perspective serves — `house: true` forces the unauthenticated view.
  const signedIn = hasSessionToken();
  const calcDone = (() => { try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; } })();
  const { pov: scorePov } = useScorePov();
  const [scoreExplainOpen, setScoreExplainOpen] = useState(false);
  const myPov = signedIn && calcDone && scorePov === "personalized";

  // Filter & sort panel (toggled by the icon next to the title). Both map 1:1 to
  // server params — tier filters, order sorts by trust score — so pagination
  // stays honest (no client-side reshuffling of partial pages).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tierFilter, setTierFilter] = useState<"all" | "high" | "medium_high" | "medium" | "medium_low">("all");
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
        verified_threshold: getVerifiedThreshold(),
        min_influence: cfg!.verifiedOnly ? getVerifiedThreshold() : undefined,
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
  if (!decoded) return <Redirect to="/" />;
  if (!cfg) return <Redirect to={`/p/${rawId}`} />;

  const subject = (subjectQuery.data ?? {}) as Record<string, string | undefined>;
  const subjectName =
    subject.display_name || subject.name || (pubkey ? npubFromPubkey(pubkey).slice(0, 12) + "…" : "this profile");
  const profileMap = profilesQuery.data;
  const loading = connQuery.isLoading;

  // "What does verified mean?" popover — POV-aware so it nudges the right next
  // step: sign in (logged out) → watch calculation (calculating) → tune it (yours).
  const povLink = "font-medium text-[#6366f1] hover:text-[#4f46e5]";
  const currentPath = `/p/${rawId}/${type}`;
  const verifiedPopover = !signedIn ? (
    <>
      <p><strong className="font-semibold text-slate-700">Verified</strong> means an account the Web of Trust vouches for — its score clears the threshold, so bots and unknown accounts don't count.</p>
      <p className="mt-1.5">Right now you're seeing <strong className="font-semibold text-slate-700">Brainstorm's</strong> point of view. <Link href={`/login?next=${encodeURIComponent(currentPath)}`} className={povLink}>Sign in</Link> to switch to <em>your own</em> Web of Trust — once your scores are calculated.</p>
      <Link href="/what-is-wot" className={`mt-2 inline-block ${povLink}`}>Learn how it works →</Link>
    </>
  ) : !calcDone ? (
    <>
      <p><strong className="font-semibold text-slate-700">Verified</strong> means an account the Web of Trust vouches for — bots and unknown accounts don't count.</p>
      <p className="mt-1.5">You're signed in, but <strong className="font-semibold text-slate-700">your scores are still being calculated</strong>. Until they're ready, this shows Brainstorm's point of view.</p>
      <Link href="/dashboard" className={`mt-1 inline-block ${povLink}`}>Check your dashboard →</Link>
      <Link href="/what-is-wot" className={`mt-2 block ${povLink}`}>Learn how it works →</Link>
    </>
  ) : (
    <>
      <p><strong className="font-semibold text-slate-700">Verified</strong> means an account <em>your</em> Web of Trust vouches for — the accounts <strong className="font-semibold text-slate-700">you</strong> trust decide who counts.</p>
      <p className="mt-1.5">You're seeing your own point of view. Tune the threshold in <Link href="/settings?tab=trust" className={povLink}>Settings</Link> — Relax, Default, or Strict.</p>
      <Link href="/what-is-wot" className={`mt-2 inline-block ${povLink}`}>Learn how it works →</Link>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
      <header className="border-b border-slate-200/70 bg-white/70 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href={`/p/${rawId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3730a3] hover:underline" data-testid="conn-back">
            <ArrowLeft className="h-4 w-4" /> Back to {subjectName.split(" ")[0]}
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-2" data-testid="conn-brand">
            <BrainLogo size={22} className="text-indigo-500" />
            <span className="text-base font-bold tracking-tight text-indigo-500 font-brand">Brainstorm</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#7c86ff]/30 bg-[#333286]/5 text-[#333286]">
              <Users className="h-4 w-4" />
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="conn-title">
              {cfg.title(subjectName)}
            </h1>
            {cfg.verifiedOnly && (
              <InfoHint label="What does verified mean?">{verifiedPopover}</InfoHint>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className={`ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${filtersOpen || tierFilter !== "all" || sortOrder !== "desc" ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
              title="Filter & sort"
              data-testid="conn-filter-toggle"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
          {!loading && items.length > 0 && (
            <p className="mt-1.5 text-sm text-slate-500" data-testid="conn-subtitle">{cfg.subtitle(subjectName)}</p>
          )}

          {filtersOpen && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2.5" data-testid="conn-filter-panel">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mr-1">Trust level</span>
                {([["all", "All"], ["high", "Highly Trusted"], ["medium_high", "Trusted"], ["medium", "Neutral"], ["medium_low", "Low"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTierFilter(value)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${tierFilter === value ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                    data-testid={`conn-filter-${value}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mr-1">Sort</span>
                {([["desc", "Most trusted first"], ["asc", "Least trusted first"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSortOrder(value)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${sortOrder === value ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                    data-testid={`conn-sort-${value}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse" data-testid="conn-skeleton">
                <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
                <div className="w-10 h-10 rounded-full bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 rounded bg-slate-100" />
                  <div className="h-2.5 w-24 rounded bg-slate-100" />
                </div>
              </div>
            ))
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400" data-testid="conn-empty">{cfg.empty}</p>
          ) : (
            items.map((entry) => {
              const pk = typeof entry === "string" ? entry : entry.pubkey;
              const inf = influence.get(pk) ?? null;
              const p = profileMap?.get(pk);
              let rowNpub = "";
              try { rowNpub = npubFromPubkey(pk); } catch { /* skip bad key */ }
              const name = p?.display_name || p?.name || (rowNpub ? rowNpub.slice(0, 12) + "…" : pk.slice(0, 12) + "…");
              const handle = cleanNip05(p?.nip05);
              const score = typeof inf === "number" ? Math.min(1, Math.max(0, inf)) : null;
              const tier = score != null ? tierForScore(score) : null;
              return (
                <Link
                  key={pk}
                  href={rowNpub ? `/p/${rowNpub}` : "#"}
                  className="group flex items-center gap-3.5 px-4 py-3 hover:bg-slate-50 transition-colors"
                  data-testid={`conn-row-${pk.slice(0, 8)}`}
                >
                  <TrustAvatar picture={p?.picture} name={name} score={score} tier={tier} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                    {handle ? (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                        <BadgeCheck className="h-3 w-3 shrink-0 text-sky-500" /><span className="truncate">{handle}</span>
                      </p>
                    ) : (
                      rowNpub && <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{rowNpub.slice(0, 16)}…</p>
                    )}
                    {cfg.kind === "reported_by" && (() => {
                      const rm = reportMap.get(pk);
                      if (!rm) return null;
                      return (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5" data-testid={`conn-report-${pk.slice(0, 8)}`}>
                          <span className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium ${REPORT_TYPE_BADGE_COLORS[rm.reportType] || REPORT_TYPE_BADGE_COLORS.other}`}>{rm.reportType}</span>
                          <span className="text-[10px] text-slate-400">{formatReportTime(rm.timestamp)}</span>
                          {rm.reason && <span className="max-w-[160px] truncate text-[10px] italic text-slate-400" title={rm.reason}>"{rm.reason}"</span>}
                        </div>
                      );
                    })()}
                  </div>
                  {tier && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScoreExplainOpen(true); }}
                      className={`hidden shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold sm:inline-flex ${scorePov === "personalized" ? "border-indigo-200" : "border-slate-200"}`}
                      style={{ backgroundColor: `${tier.color}14`, color: tier.color }}
                      title="What does this score mean?"
                      data-testid="conn-tier"
                    >
                      <PovIcon pov={scorePov} className="h-2.5 w-2.5" />
                      {tier.name}
                    </button>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-400" />
                </Link>
              );
            })
          )}
        </div>

        {connQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => connQuery.fetchNextPage()}
            disabled={connQuery.isFetchingNextPage}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white text-sm font-semibold py-2.5 transition-colors"
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

/** Avatar wrapped in a tier-coloured trust ring with a small score badge — one
 *  premium "person" token (LinkedIn/Facebook feel) instead of two side-by-side
 *  circles. */
function TrustAvatar({ picture, name, score, tier }: { picture?: string; name: string; score: number | null; tier: { name: string; color: string } | null }) {
  const pct = score != null ? Math.round(score * 100) : null;
  return (
    <div className="relative shrink-0" title={tier && pct != null ? `${tier.name} · ${pct}` : undefined}>
      <Avatar
        className="h-12 w-12 rounded-full bg-white"
        style={{ boxShadow: tier ? `0 0 0 2px #fff, 0 0 0 4px ${tier.color}` : "0 0 0 1px #e2e8f0" }}
      >
        {picture ? <AvatarImage src={picture} alt={name} className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
      </Avatar>
      {pct != null && tier && (
        <span className="absolute -bottom-1 -right-1 rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums text-white shadow-sm ring-2 ring-white" style={{ backgroundColor: tier.color }}>{pct}</span>
      )}
    </div>
  );
}
