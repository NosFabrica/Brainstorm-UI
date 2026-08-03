import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, Gauge, ShieldCheck, RefreshCw, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { PresetBadge } from "@/components/PresetBadge";
import { VerificationCoin, tierForScore01, type VerificationTier } from "@/components/score/VerificationCoin";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { useSelfOverview, useSelfHistory, useSelfStats } from "@/hooks/useSelf";
import { logout } from "@/services/nostr";
import { apiClient } from "@/services/api";
import { useTrustPresetSync } from "@/hooks/useTrustPresetSync";
import { presetToBackend } from "@/services/trustThreshold";
import { getScoreJournal, hydrateScoreJournal, recordScore, withDeltas, type ScoreEntry } from "@/lib/scoreJournal";
import { readPublishedAssistant, readAssistantProfile } from "@/lib/assistantStorage";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";

const TIER_LABEL: Record<VerificationTier, string> = {
  high: "Highly Trusted", trusted: "Trusted", neutral: "Neutral", low: "Low Trust", unverified: "Unverified",
};

const isDone = (s: unknown) => typeof s === "string" && s.toLowerCase() === "success";
const isFail = (s: unknown) => typeof s === "string" && s.toLowerCase() === "failure";
const withZ = (s: string) => (s.endsWith("Z") ? s : s + "Z");

/** Epoch ms for a backend timestamp, or null when unparseable. */
function toMs(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(withZ(iso)).getTime();
  return isNaN(t) ? null : t;
}

/** Influence 0–1 → the 0–100 number shown everywhere else in the product. */
function score100(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 100);
}

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
  const user = useActiveAccountDisplay();
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
  // Your OWN perspective always scores you 100 — meaningless here. Fetch the
  // GLOBAL (house) score instead: Brainstorm's own vantage point, which is the
  // default a viewer gets before their personal web of trust applies. It is NOT
  // "what others see" — every observer with their own graph computes a different
  // number for you.
  const houseQuery = useQuery({
    queryKey: ["insights-house-influence", pubkey],
    queryFn: () => apiClient.getHouseInfluence(pubkey!),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  // Active preset (from settings) — the fallback for "Settings preset" when the
  // latest run hasn't stamped graperank_preset_used yet (e.g. mid-recalculation).
  const { preset: activePreset } = useTrustPresetSync(!!pubkey);

  const overview = overviewQuery.data?.data ?? null;
  const stats = statsQuery.data?.data ?? null;
  const history = historyQuery.data?.data ?? null;
  const grapeRank = grapeRankQuery.data as any;

  const globalInfluence = houseQuery.data ?? null;
  const tier = globalInfluence != null ? tierForScore01(globalInfluence) : null;
  const counts = overview?.counts ?? {};
  const verifiedFollowers = stats?.followed_by?.verified ?? counts.followed_by ?? 0;
  const verifiedFollowing = stats?.following?.verified ?? counts.following ?? 0;

  // Score journal: the backend records that a run happened but not what it
  // scored, so we capture the score each time we observe a NEW completed
  // calculation. Forward-only — nothing to backfill from.
  const [journal, setJournal] = useState<ScoreEntry[]>(() => getScoreJournal(pubkey ?? ""));
  useEffect(() => {
    if (!pubkey) return;
    let live = true;
    void hydrateScoreJournal(pubkey).then((j) => { if (live) setJournal(j); }).catch(() => {});
    return () => { live = false; };
  }, [pubkey]);
  const lastCalcMs = toMs(history?.last_time_calculated_graperank);
  useEffect(() => {
    if (!pubkey || lastCalcMs == null || globalInfluence == null) return;
    // Capture the preset this run used, so each history row shows what setting
    // produced it. Backend value first; fall back to the active preset.
    const calcPreset = (grapeRank?.graperank_preset_used as string | undefined)
      ?? (activePreset ? presetToBackend(activePreset) : undefined);
    setJournal(recordScore(pubkey, lastCalcMs, globalInfluence, calcPreset));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, lastCalcMs, globalInfluence]);
  const scoreHistory = useMemo(() => withDeltas(journal), [journal]);

  const assistant = useMemo(() => readPublishedAssistant(), []);
  const assistantProfile = useMemo(() => (assistant ? readAssistantProfile() : null), [assistant]);
  const assistantName =
    assistantProfile?.display_name || assistantProfile?.name || "Brainstorm assistant";

  const calculatedAt = fmtWhen(history?.last_time_calculated_graperank);
  const duration = fmtDuration(grapeRank?.created_at, grapeRank?.updated_at);
  const preset = grapeRank?.graperank_preset_used as string | undefined;
  const presetForBadge = preset ?? (activePreset ? presetToBackend(activePreset) : undefined);
  // Two INDEPENDENT steps, matching useScoringStatus (the app-wide source of truth):
  //   internal_publication_status === success  → the CALCULATION finished
  //   ta_status === success                    → the Trusted Assertions PUBLICATION finished
  // This page previously read internal_publication_status and labelled it
  // "Published", collapsing both steps into one binary. So a user whose scores had
  // finished computing — score journaled, "Last calculated" stamped — still saw a
  // permanent amber "In progress" under a card titled "Trust calculation", which
  // reads as "my scores never finished". Report the two separately, and stop
  // rendering a failed run as eternally optimistic.
  const calcComplete = isDone(grapeRank?.internal_publication_status);
  const publishComplete = calcComplete && isDone(grapeRank?.ta_status);
  const calcFailed = isFail(grapeRank?.status) || isFail(grapeRank?.internal_publication_status);
  const queueAhead = typeof grapeRank?.how_many_others_with_priority === "number" ? grapeRank.how_many_others_with_priority : null;

  // Self-scoped calculation history — renders only when /user/history exposes a
  // records array (admins get the full table via /admin/users/:pubkey/history;
  // the user endpoint currently returns a summary, so this needs a small backend
  // addition before it populates).
  const calcRecords: any[] = Array.isArray((history as any)?.items)
    ? (history as any).items
    : Array.isArray((history as any)?.records)
      ? (history as any).records
      : [];

  const handleLogout = () => logout();

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
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Your account standing, and exactly how and when your trust scores were computed.</p>

        <DeferredSessionNotice className="mb-6" />

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
              <dd className="text-right">{presetForBadge ? <PresetBadge preset={presetForBadge} size="xs" /> : <span className="text-slate-400">—</span>}</dd>
            </div>
            {duration && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Took</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">{duration}</dd>
              </div>
            )}
            {/* The CALCULATION — what this card is actually about. */}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500 dark:text-slate-400">Status</dt>
              <dd className="flex items-center gap-1.5 justify-end font-medium">
                {calcFailed ? (
                  <span className="text-red-600 dark:text-red-400">Failed</span>
                ) : calcComplete ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> <span className="text-emerald-600 dark:text-emerald-400">Complete</span></>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">In progress</span>
                )}
              </dd>
            </div>
            {/* Publication is a SEPARATE step (ta_status): the calculation can be
                finished while the Trusted Assertions publish is still catching up.
                Only worth a row once the calculation is actually done — before that
                it's not pending, it simply hasn't started. */}
            {calcComplete && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Published</dt>
                <dd className="flex items-center gap-1.5 justify-end font-medium">
                  {publishComplete ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> <span className="text-emerald-600 dark:text-emerald-400">Published</span></>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">Publishing…</span>
                  )}
                </dd>
              </div>
            )}
            {queueAhead != null && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Queue</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{queueAhead === 0 ? "Idle" : `${queueAhead} ahead`}</dd>
              </div>
            )}
          </dl>

          {/* Who publishes these scores. Surfaced here rather than as its own
              dashboard card: this page is about how your scores are computed and
              published, so the assistant is context, not promotion. */}
          {assistant && (
            <div className="mt-3 flex items-center gap-2.5 border-t border-slate-100 dark:border-slate-800/60 pt-3" data-testid="insights-assistant">
              <span className="text-sm text-slate-500 dark:text-slate-400">Published by</span>
              <button
                type="button"
                onClick={() => navigate(`/p/${assistant.npub}`)}
                className="group flex min-w-0 items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                data-testid="insights-assistant-link"
              >
                <Avatar className="h-6 w-6 shrink-0 rounded-full border border-slate-200 dark:border-slate-800">
                  {assistantProfile?.picture ? <AvatarImage src={assistantProfile.picture} alt={assistantName} className="object-cover" /> : null}
                  <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-link">{assistantName}</span>
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">your assistant</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-brand-link" />
              </button>
            </div>
          )}

          <button type="button" onClick={() => navigate("/settings?tab=trust")} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded" data-testid="insights-recalculate">
            <RefreshCw className="h-3 w-3" /> Recalculate or change preset in settings
          </button>
        </Card>

        {/* Score history — outcome-first: what each calculation DID to your score.
            Journalled client-side because the backend records that a run happened
            but not what it scored. Forward-only, so it starts empty for everyone. */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 mb-4" data-testid="insights-score-history">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200" style={{ fontFamily: "var(--font-display)" }}>Score history</span>
            {scoreHistory.length > 0 && (
              <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{scoreHistory.length} calculation{scoreHistory.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          {scoreHistory.length === 0 ? (
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400" data-testid="insights-score-history-empty">
              Nothing recorded yet. We start tracking your score from now on — after your
              next calculation completes, you'll see how it moved and why.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {scoreHistory.slice(0, 12).map((e, i) => {
                const up = (e.delta ?? 0) > 0;
                const flat = e.delta === 0 || e.delta == null;
                // The newest run is the one behind your CURRENT score — it gets the
                // filled pill. Older rows carry the same info as a quiet dot+label,
                // so the column reads as data instead of a stack of loud pills.
                const isActiveRun = i === 0;
                return (
                  // One clean line at every width: date then the preset it ran at,
                  // inline, with the score movement held right. min-w-0 lets the
                  // date shrink on narrow phones instead of pushing the numbers off.
                  <li key={e.t} className="flex items-center justify-between gap-3 py-2" data-testid="insights-score-row">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                        {new Date(e.t).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                      {e.preset && (
                        <PresetBadge preset={e.preset} size="xs" variant={isActiveRun ? "pill" : "quiet"} className="shrink-0" />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      {e.previous != null && (
                        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums">{score100(e.previous)} →</span>
                      )}
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">{score100(e.score)}</span>
                      <span
                        className={`w-11 text-right font-mono text-xs font-semibold tabular-nums ${
                          flat ? "text-slate-400 dark:text-slate-500" : up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                        }`}
                      >
                        {flat ? "—" : `${up ? "▲+" : "▼"}${score100(Math.abs(e.delta ?? 0))}`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Calculation history (self-scoped; renders when the endpoint returns records) */}
        {calcRecords.length > 0 && (
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200" style={{ fontFamily: "var(--font-display)" }}>Calculation history</span>
              <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{calcRecords.length} record{calcRecords.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 text-left">
                    <th className="py-1.5 pr-3 font-semibold">When</th>
                    <th className="py-1.5 pr-3 font-semibold">Source</th>
                    <th className="py-1.5 pr-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {calcRecords.slice(0, 12).map((r, i) => (
                    <tr key={r.private_id ?? i} className="border-t border-slate-100 dark:border-slate-800/60">
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{fmtWhen(r.created_at) ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{r.trigger_source || "—"}</td>
                      {/* Same field semantics as the card above: this column reflects
                          whether the CALCULATION completed, so don't label it "Published". */}
                      <td className="py-2 pr-3">
                        {isFail(r.status) || isFail(r.internal_publication_status)
                          ? <span className="font-medium text-red-600 dark:text-red-400">Failed</span>
                          : isDone(r.internal_publication_status)
                            ? <span className="font-medium text-emerald-600 dark:text-emerald-400">Complete</span>
                            : <span className="font-medium text-amber-600 dark:text-amber-400">{r.status || "In progress"}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Your standing */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
            {/* Not "Your standing" — that implies a single ranking everyone agrees
                on, which is the one thing a web of trust deliberately doesn't have. */}
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200" style={{ fontFamily: "var(--font-display)" }}>How Brainstorm sees you</span>
          </div>
          <div className="flex items-center gap-3 mb-3 rounded-lg bg-brand-accent/[0.06] border border-brand-accent/20 px-3 py-2.5">
            <VerificationCoin score01={globalInfluence} pov="global" size={40} />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{tier ? TIER_LABEL[tier] : houseQuery.isLoading ? "Loading…" : "Not yet scored"}</p>
              {/* This number is getHouseInfluence — BRAINSTORM's vantage point, not
                  a universal verdict. It used to claim "the number others see on
                  your profile", which is exactly wrong: anyone with their own web
                  of trust computes a different number for you. Saying so is also
                  the product thesis, not a caveat. */}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Brainstorm's own perspective. There's no universal score — everyone computes their own number for you from their own network.
              </p>
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
