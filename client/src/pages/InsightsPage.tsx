import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, Gauge, ShieldCheck, RefreshCw, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { PresetBadge } from "@/components/PresetBadge";
import { PovTag } from "@/components/score/TrustScorePov";
import { VerificationCoin, tierForScore01, type VerificationTier } from "@/components/score/VerificationCoin";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSelfOverview, useSelfHistory, useSelfStats } from "@/hooks/useSelf";
import { logout } from "@/services/nostr";
import { apiClient } from "@/services/api";

const TIER_LABEL: Record<VerificationTier, string> = {
  high: "Highly Trusted", trusted: "Trusted", neutral: "Neutral", low: "Low Trust", unverified: "Unverified",
};

const isDone = (s: unknown) => typeof s === "string" && s.toLowerCase() === "success";
const withZ = (s: string) => (s.endsWith("Z") ? s : s + "Z");

function fmtWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(withZ(iso));
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDuration(startIso?: string | null, endIso?: string | null): string | null {
  if (!startIso || !endIso) return null;
  const a = new Date(withZ(startIso)).getTime();
  const b = new Date(withZ(endIso)).getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return null;
  const s = Math.round((b - a) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}

/**
 * My Insights — the individual user's own account analytics + a transparent record
 * of HOW/WHEN their trust scores were computed. The user-scoped counterpart to the
 * admin insights; assembled from existing hooks (overview / stats / history /
 * graperankResult) — no new backend.
 */
export default function InsightsPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useCurrentUser();
  const pubkey = user?.pubkey;

  const overviewQuery = useSelfOverview(pubkey);
  const statsQuery = useSelfStats(pubkey);
  const historyQuery = useSelfHistory(pubkey);
  const grapeRankQuery = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!pubkey,
    staleTime: 60_000,
  });

  const overview = overviewQuery.data?.data ?? null;
  const stats = statsQuery.data?.data ?? null;
  const history = historyQuery.data?.data ?? null;
  const grapeRank = grapeRankQuery.data as any;

  const influence: number = overview?.influence ?? 0;
  const tier = tierForScore01(influence);
  const counts = overview?.counts ?? {};
  const verifiedFollowers = stats?.followed_by?.verified ?? counts.followed_by ?? 0;
  const verifiedFollowing = stats?.following?.verified ?? counts.following ?? 0;

  const calculatedAt = fmtWhen(history?.last_time_calculated_graperank);
  const duration = fmtDuration(grapeRank?.created_at, grapeRank?.updated_at);
  const preset = grapeRank?.graperank_preset_used as string | undefined;
  const published = isDone(grapeRank?.internal_publication_status);
  const queueAhead = typeof grapeRank?.how_many_others_with_priority === "number" ? grapeRank.how_many_others_with_priority : null;

  const handleLogout = () => { logout(); setUser(null); };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      {user && <AppHeader user={user} onLogout={handleLogout} />}
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        <button
          type="button"
          onClick={() => { if (typeof window !== "undefined" && window.history.length > 1) window.history.back(); else navigate("/dashboard"); }}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
          data-testid="insights-back"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
            <Gauge className="h-4 w-4" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>My Insights</h1>
          <PovTag pov="personalized" />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Your account standing, and exactly how and when your trust scores were computed.</p>

        {/* Calculation */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200" style={{ fontFamily: "var(--font-display)" }}>Trust calculation</span>
            {grapeRankQuery.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Last calculated</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 text-right">{calculatedAt ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Settings preset</dt>
              <dd className="text-right">{preset ? <PresetBadge preset={preset} size="xs" /> : <span className="text-slate-400">—</span>}</dd>
            </div>
            {duration && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Took</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">{duration}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Status</dt>
              <dd className="flex items-center gap-1.5 justify-end font-medium">
                {published ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> <span className="text-emerald-600 dark:text-emerald-400">Published</span></> : <span className="text-amber-600 dark:text-amber-400">In progress</span>}
              </dd>
            </div>
            {queueAhead != null && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Queue</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{queueAhead === 0 ? "Idle" : `${queueAhead} ahead`}</dd>
              </div>
            )}
          </dl>
          <button type="button" onClick={() => navigate("/settings?tab=trust")} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded" data-testid="insights-recalculate">
            <RefreshCw className="h-3 w-3" /> Recalculate or change preset in settings
          </button>
        </Card>

        {/* Your standing */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200" style={{ fontFamily: "var(--font-display)" }}>Your standing</span>
          </div>
          <div className="flex items-center gap-3 mb-3 rounded-lg bg-brand-accent/[0.06] border border-brand-accent/20 px-3 py-2.5">
            <VerificationCoin score01={influence} pov="personalized" size={40} />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{TIER_LABEL[tier]}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Your verification score across the network</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label="Verified followers" value={verifiedFollowers.toLocaleString()} />
            <Stat label="Verified following" value={verifiedFollowing.toLocaleString()} />
            <Stat label="Reported by" value={(counts.reported_by ?? 0).toLocaleString()} />
            <Stat label="Muted by" value={(counts.muted_by ?? 0).toLocaleString()} />
            <Stat label="You report" value={(counts.reporting ?? 0).toLocaleString()} />
            <Stat label="Flagged in network" value={(overview?.flagged_count ?? 0).toLocaleString()} />
          </div>
        </Card>

        {/* Explainer */}
        <Card className="border border-brand-accent/25 bg-brand-accent/[0.06] rounded-xl p-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">How your trust is computed</p>
          <p className="text-[13px] leading-relaxed text-[#0A0E18] dark:text-slate-100">
            Your score is built only from signals of already-verified accounts — their follows, mutes, and reports — so bots and brand-new accounts carry no weight. That's what makes it resistant to manipulation.{" "}
            <button type="button" onClick={() => navigate("/how-search-works")} className="inline-flex items-center gap-0.5 font-semibold text-brand-link hover:underline">Learn more <ArrowRight className="h-3 w-3" /></button>
          </p>
        </Card>
      </main>
    </div>
  );
}
