import { useMemo } from "react";
import { useRoute, Redirect, Link } from "wouter";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Users } from "lucide-react";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";
import { fetchProfileForShare, fetchProfileMap } from "@/services/nostr";
import { apiClient } from "@/services/api";
import { getVerifiedThreshold } from "@/services/trustThreshold";
import { toPubkeys, toInfluenceMap, type GraphEntry } from "@/services/graphHelpers";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrainLogo } from "@/components/BrainLogo";
import { initialsFor } from "@/lib/profileDefaults";

type ConnKind = "followed_by" | "following" | "muted_by" | "reported_by";

const TYPE_MAP: Record<
  string,
  { kind: ConnKind; verifiedOnly: boolean; title: (name: string) => string; empty: string }
> = {
  followers: { kind: "followed_by", verifiedOnly: true, title: (n) => `Verified followers of ${n}`, empty: "No verified followers yet." },
  following: { kind: "following", verifiedOnly: false, title: (n) => `${n} is following`, empty: "Not following anyone yet." },
  muters: { kind: "muted_by", verifiedOnly: true, title: (n) => `Verified accounts muting ${n}`, empty: "No verified muters." },
  reporters: { kind: "reported_by", verifiedOnly: true, title: (n) => `Verified accounts reporting ${n}`, empty: "No verified reporters." },
};

const PAGE = 20;

export default function ConnectionListPage() {
  const [, params] = useRoute("/p/:id/:type");
  const rawId = params?.id || "";
  const type = params?.type || "";
  const decoded = useMemo(() => decodeShareId(rawId), [rawId]);
  const pubkey = decoded?.pubkey || "";
  const relayHints = decoded?.relays || [];
  const cfg = TYPE_MAP[type];

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
    queryKey: ["share-conn", pubkey, cfg?.kind, type],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const res = await apiClient.getUserConnections(pubkey, cfg!.kind, {
        limit: PAGE,
        cursor: pageParam || undefined,
        order: "desc",
        verified_threshold: getVerifiedThreshold(),
        min_influence: cfg!.verifiedOnly ? getVerifiedThreshold() : undefined,
        house: true,
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

  // Guard rails — bad share id or unknown list type.
  if (!decoded) return <Redirect to="/" />;
  if (!cfg) return <Redirect to={`/p/${rawId}`} />;

  const subject = (subjectQuery.data ?? {}) as Record<string, string | undefined>;
  const subjectName =
    subject.display_name || subject.name || (pubkey ? npubFromPubkey(pubkey).slice(0, 12) + "…" : "this profile");
  const profileMap = profilesQuery.data;
  const loading = connQuery.isLoading;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
      <header className="border-b border-slate-200/70 bg-white/70 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href={`/p/${rawId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3730a3] hover:underline" data-testid="conn-back">
            <ArrowLeft className="h-4 w-4" /> Back to {subjectName.split(" ")[0]}
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-2" data-testid="conn-brand">
            <BrainLogo size={22} className="text-indigo-500" />
            <span className="text-base font-bold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-[#7c86ff]" />
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="conn-title">
            {cfg.title(subjectName)}
          </h1>
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
              return (
                <Link
                  key={pk}
                  href={rowNpub ? `/p/${rowNpub}` : "#"}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                  data-testid={`conn-row-${pk.slice(0, 8)}`}
                >
                  <TrustRing influence={inf} />
                  <Avatar className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white">
                    {p?.picture ? <AvatarImage src={p.picture} alt={name} className="object-cover" /> : null}
                    <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">{initialsFor(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
                    {p?.nip05 && <p className="text-xs text-sky-600 truncate">{p.nip05.replace(/^_@/, "")}</p>}
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
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
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#3730a3] hover:bg-[#312e81] disabled:opacity-50 text-white text-sm font-semibold py-2.5 transition-colors"
            data-testid="conn-load-more"
          >
            {connQuery.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Show more
          </button>
        )}
      </main>
    </div>
  );
}

function TrustRing({ influence }: { influence: number | null }) {
  const score = typeof influence === "number" ? Math.min(1, Math.max(0, influence)) : null;
  if (score == null) return <div className="w-9 h-9 shrink-0 rounded-full bg-slate-100 border border-slate-200" />;
  const tier = tierForScore(score);
  const pct = Math.round(score * 100);
  const C = 2 * Math.PI * 15;
  const offset = C - score * C;
  return (
    <div className="relative w-9 h-9 shrink-0 flex items-center justify-center" title={`${tier.name} · ${pct}`}>
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
        <circle cx="18" cy="18" r="15" fill="none" stroke={tier.color} strokeWidth="3" strokeLinecap="round" style={{ strokeDasharray: C, strokeDashoffset: offset }} />
      </svg>
      <span className="text-[10px] font-bold font-mono tabular-nums" style={{ color: tier.color }}>{pct}</span>
    </div>
  );
}
