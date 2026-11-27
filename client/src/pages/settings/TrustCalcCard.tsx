/**
 * Settings › Trust › Advanced › Trust Calculation: the last GrapeRank run's
 * status, times, preset and algorithm, and Recalculate behind a confirm.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Check, Clock, Info, Loader2 } from "lucide-react";
import { PresetBadge } from "@/components/PresetBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCalcTime } from "./calcStatus";
import type { RecalculateGrapeRank } from "./useRecalculateGrapeRank";

export function TrustCalcCard({
  grapeRankLoading,
  grapeRankStatus,
  lastCalculated,
  lastTriggered,
  presetUsed,
  algorithm,
  isGrapeRankFailedState,
  isRecalcInProgress,
  hasNoFollowing,
  triggerGrapeRankMutation,
}: {
  grapeRankLoading: boolean;
  grapeRankStatus: string | null;
  lastCalculated: string | null;
  lastTriggered: string | null;
  presetUsed: string | null | undefined;
  algorithm: string | null | undefined;
  isGrapeRankFailedState: boolean;
  isRecalcInProgress: boolean;
  hasNoFollowing: boolean;
  triggerGrapeRankMutation: RecalculateGrapeRank;
}) {
  const [, navigate] = useLocation();
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-graperank"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              className="text-brand-deep"
            >
              <path
                d="M14.4209 5.63965H21.7009"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                opacity="0.4"
                d="M2.2998 5.64062H9.5798"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                opacity="0.4"
                d="M14.4209 15.3301H21.7009"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                opacity="0.4"
                d="M14.4209 21.3896H21.7009"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M18.0894 9.27V2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2.2998 22.0005L9.5798 14.7305"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5798 22.0005L2.2998 14.7305"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-gr-title"
            >
              Trust Calculation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-gr-subtitle">
              GrapeRank network analysis
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        {grapeRankLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-6 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <div className="h-8 w-40 rounded-xl bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between" data-testid="row-gr-status">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status
              </span>
              {grapeRankStatus === "success" ? (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1"
                  data-testid="badge-gr-success"
                >
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Complete</span>
                </div>
              ) : grapeRankStatus ? (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1"
                  data-testid="badge-gr-pending"
                >
                  <Clock className="h-3 w-3 text-amber-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                    {grapeRankStatus}
                  </span>
                </div>
              ) : (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-800"
                  data-testid="badge-gr-none"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    No data
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {lastCalculated && (
                <div className="flex flex-wrap items-center justify-between gap-2" data-testid="row-gr-last-calculated">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Last calculated</span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-300">{formatCalcTime(lastCalculated)}</span>
                    <PresetBadge preset={presetUsed} size="xs" testId="badge-gr-preset-used" />
                  </div>
                </div>
              )}
              {lastTriggered && (
                <div className="flex items-center justify-between" data-testid="row-gr-last-triggered">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Last triggered</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{formatCalcTime(lastTriggered)}</span>
                </div>
              )}
              <div className="flex items-center justify-between" data-testid="row-gr-algorithm">
                <span className="text-xs text-slate-500 dark:text-slate-400">Algorithm</span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{algorithm || "graperank"}</span>
              </div>
            </div>

            {isGrapeRankFailedState &&
              !triggerGrapeRankMutation.isSuccess &&
              !isRecalcInProgress &&
              !triggerGrapeRankMutation.isPending && (
                <div
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
                  data-testid="alert-gr-failed-state"
                >
                  <p className="text-xs font-medium text-amber-800">
                    Your last calculation didn't complete successfully. You can try again below.
                  </p>
                </div>
              )}

            {triggerGrapeRankMutation.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-gr-error">
                <p className="text-xs font-medium text-red-700">
                  {triggerGrapeRankMutation.error?.message || "Something went wrong."}
                </p>
              </div>
            )}

            {triggerGrapeRankMutation.isSuccess && (
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                data-testid="alert-gr-success"
              >
                <p className="text-xs font-medium text-emerald-700">
                  Recalculation triggered. This typically takes about 5 minutes.
                </p>
              </div>
            )}

            {hasNoFollowing && (
              <div
                className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50 p-2.5"
                data-testid="banner-gr-no-follows"
              >
                <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-xs font-medium text-amber-700">
                  Follow at least one account first so we can calculate your scores.{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/welcome")}
                    className="font-semibold underline hover:text-amber-900"
                    data-testid="link-gr-build-network"
                  >
                    Find people to follow →
                  </button>
                </p>
              </div>
            )}

            <div className="mt-auto border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <AlertDialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
                <button
                  type="button"
                  disabled={triggerGrapeRankMutation.isPending || isRecalcInProgress || hasNoFollowing}
                  onClick={() => setRecalcConfirmOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:pointer-events-none disabled:opacity-50"
                  data-testid="button-gr-recalculate"
                >
                  {triggerGrapeRankMutation.isPending || isRecalcInProgress ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Recalculating...
                    </>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="shrink-0"
                      >
                        <path
                          d="M14.4209 5.63965H21.7009"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          opacity="0.4"
                          d="M2.2998 5.64062H9.5798"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M18.0894 9.27V2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2.2998 22.0005L9.5798 14.7305"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9.5798 22.0005L2.2998 14.7305"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Recalculate GrapeRank
                    </>
                  )}
                </button>
                <AlertDialogContent
                  className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                  data-testid="dialog-confirm-recalculate-settings"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-link">
                          Trust Signals
                        </span>
                        <div className="h-px w-10 bg-brand-link/30" />
                      </div>
                      <AlertDialogTitle
                        className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                        style={{ fontFamily: "var(--font-display)" }}
                        data-testid="text-confirm-recalculate-settings-title"
                      >
                        Recalculate GrapeRank?
                      </AlertDialogTitle>
                      <AlertDialogDescription
                        className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                        data-testid="text-confirm-recalculate-settings-desc"
                      >
                        This re-runs your full network trust calculation. It typically takes about 5 minutes and your
                        current scores will be replaced with updated results.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel
                        className="rounded-xl"
                        data-testid="button-confirm-recalculate-settings-cancel"
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-brand-primary text-white shadow-lg shadow-brand-primary/25 hover:bg-brand-primary-hover"
                        onClick={() => {
                          setRecalcConfirmOpen(false);
                          triggerGrapeRankMutation.mutate();
                        }}
                        data-testid="button-confirm-recalculate-settings-continue"
                      >
                        Recalculate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
