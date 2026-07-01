import { useMemo } from "react";
import { useRoute, Redirect, Link } from "wouter";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Loader2, Users, BadgeCheck } from "lucide-react";
import { decodeShareId, npubFromPubkey } from "@/lib/shareId";
import { fetchProfileForShare, fetchProfileMap } from "@/services/nostr";
import { apiClient } from "@/services/api";
import { getVerifiedThreshold } from "@/services/trustThreshold";
import { toPubkeys, toInfluenceMap, type GraphEntry } from "@/services/graphHelpers";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrainLogo } from "@/components/BrainLogo";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";

type ConnKind = "followed_by" | "following" | "muted_by" | "reported_by";

const TYPE_MAP: Record<
  string,
  { kind: ConnKind; verifiedOnly: boolean; title: (name: string) => string; subtitle: (name: string) => string; empty: string }
> = {
  followers: { kind: "followed_by", verifiedOnly: true, title: (n) => `Verified followers of ${n}`, subtitle: (n) => `Trusted accounts in the Web of Trust who follow ${n}, strongest first.`, empty: "No verified followers yet." },
  following: { kind: "following", verifiedOnly: false, title: (n) => `${n} is following`, subtitle: (n) => `Accounts ${n} follows, ranked by Web-of-Trust score.`, empty: "Not following anyone yet." },
  muters: { kind: "muted_by", verifiedOnly: true, title: (n) => `Verified accounts muting ${n}`, subtitle: (n) => `Trusted accounts in the Web of Trust that have muted ${n}.`, empty: "No verified muters." },
  reporters: { kind: "reported_by", verifiedOnly: true, title: (n) => `Verified accounts reporting ${n}`, subtitle: (n) => `Trusted accounts in the Web of Trust that have reported ${n}.`, empty: "No verified reporters." },
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
          </div>
          {!loading && items.length > 0 && (
            <p className="mt-1.5 text-sm text-slate-500" data-testid="conn-subtitle">{cfg.subtitle(subjectName)}</p>
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
                  </div>
                  {tier && (
                    <span className="hidden shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold sm:inline-flex" style={{ backgroundColor: `${tier.color}14`, color: tier.color }} data-testid="conn-tier">
                      {tier.name}
                    </span>
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
