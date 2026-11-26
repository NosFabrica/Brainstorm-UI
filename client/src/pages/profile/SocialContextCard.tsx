/**
 * "Social Context": the negative signals — flagged, muted by, reported by — and
 * what this person mutes and reports, each expandable to its list; and the
 * summary bar of mutes against reports.
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { toPubkeys } from "@/services/graphHelpers";
import type { ProfileResultData } from "./connectionModel";
import { FlaggedIcon, MutedByIcon, MutingIcon, ReportedByIcon, ReportingIcon } from "./icons";

export function SocialContextCard({
  profileResult,
  hasRiskSignals,
  totalNegativeSignals,
  isProfileFlagged,
  mutedByCount,
  reportedByCount,
  mutingCount,
  reportingCount,
  verifiedCounts,
  expandedSections,
  toggleSection,
  renderExpandedPanel,
  renderTierBadges,
}: {
  profileResult: ProfileResultData;
  hasRiskSignals: boolean;
  totalNegativeSignals: number;
  isProfileFlagged: boolean;
  mutedByCount: number;
  reportedByCount: number;
  mutingCount: number;
  reportingCount: number;
  verifiedCounts: { loaded: boolean; mutedBy: number; reportedBy: number };
  expandedSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
  renderExpandedPanel: (key: string, pubkeys: string[]) => ReactNode;
  renderTierBadges: (sectionKey: string) => ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-900 dark:shadow-none">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50/60 via-slate-50/40 to-white/60 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900 dark:bg-none sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-2">
          <div
            className={`h-1.5 w-1.5 rounded-full ${hasRiskSignals ? "bg-brand-primary" : "bg-slate-300 dark:bg-slate-700"}`}
          />
          <h4
            className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 sm:text-xs"
            data-testid="header-social-context"
          >
            Social Context
          </h4>
        </div>
        <span className="hidden font-mono text-[10px] text-slate-400 dark:text-slate-500 sm:inline sm:text-xs">
          {totalNegativeSignals > 0 ? `${totalNegativeSignals.toLocaleString()} total` : ""}
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {isProfileFlagged && (
          <div
            className="flex items-center gap-2 bg-red-50/60 px-3 py-2.5 dark:bg-red-500/10 sm:gap-3 sm:px-4 sm:py-3.5"
            data-testid="metric-profile-flagged-indicator"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-100 dark:border-red-500/25 dark:bg-red-500/15 sm:h-8 sm:w-8">
              <FlaggedIcon className="h-3.5 w-3.5 text-red-600 sm:h-4 sm:w-4" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 sm:text-sm">Flagged</p>
              <p className="text-[10px] leading-tight text-red-500 dark:text-red-400 sm:text-xs">
                Low trust & reported by 2+ of your trusted contacts
              </p>
            </div>
          </div>
        )}
        {profileResult.muted_by !== undefined &&
          (() => {
            const mbExpandable = mutedByCount > 0;
            return (
              <div>
                <div
                  className={`flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3.5 ${mbExpandable ? "cursor-pointer transition-all duration-200 hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06]" : "cursor-help"}`}
                  title="A soft negative signal. Muting means someone chose to hide this account's content from their feed."
                  onClick={mbExpandable ? () => toggleSection("muted_by") : undefined}
                  data-testid="metric-profile-muted-by"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border sm:h-8 sm:w-8 ${mutedByCount > 0 ? "border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10" : "border-slate-100 bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900"}`}
                    >
                      <MutedByIcon
                        className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${mutedByCount > 0 ? "text-amber-500" : "text-slate-400 dark:text-slate-500"}`}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
                        {verifiedCounts.loaded ? "Verified Muted By" : "Muted By"}
                      </p>
                      <p className="hidden text-[10px] leading-tight text-slate-400 dark:text-slate-500 sm:block sm:text-xs">
                        Others who muted this account
                      </p>
                      {renderTierBadges("muted_by")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p
                        className={`font-mono text-lg font-bold tabular-nums tracking-tight sm:text-xl ${mutedByCount > 0 ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-slate-100"}`}
                        data-testid="text-profile-muted-by"
                      >
                        {verifiedCounts.loaded
                          ? verifiedCounts.mutedBy.toLocaleString()
                          : mutedByCount.toLocaleString()}
                      </p>
                      {verifiedCounts.loaded && (
                        <p
                          className="font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500"
                          data-testid="text-verified-muted-by"
                        >
                          of {mutedByCount.toLocaleString()} total
                        </p>
                      )}
                    </div>
                    {mbExpandable && (
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${expandedSections["muted_by"] ? "rotate-180" : ""}`}
                      />
                    )}
                  </div>
                </div>
                {mbExpandable &&
                  Array.isArray(profileResult.muted_by) &&
                  renderExpandedPanel("muted_by", toPubkeys(profileResult.muted_by))}
              </div>
            );
          })()}
        {profileResult.reported_by !== undefined &&
          (() => {
            const rbExpandable = reportedByCount > 0;
            return (
              <div>
                <div
                  className={`flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3.5 ${rbExpandable ? "cursor-pointer transition-all duration-200 hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06]" : "cursor-help"}`}
                  title="A stronger negative signal than muting. Reports indicate someone flagged this account for harmful or inappropriate behavior."
                  onClick={rbExpandable ? () => toggleSection("reported_by") : undefined}
                  data-testid="metric-profile-reported-by"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border sm:h-8 sm:w-8 ${reportedByCount > 0 ? "border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10" : "border-slate-100 bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900"}`}
                    >
                      <ReportedByIcon
                        className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${reportedByCount > 0 ? "text-red-500" : "text-slate-400 dark:text-slate-500"}`}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
                        {verifiedCounts.loaded ? "Verified Reported By" : "Reported By"}
                      </p>
                      <p className="hidden text-[10px] leading-tight text-slate-400 dark:text-slate-500 sm:block sm:text-xs">
                        Reports filed against this account
                      </p>
                      {renderTierBadges("reported_by")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p
                        className={`font-mono text-lg font-bold tabular-nums tracking-tight sm:text-xl ${reportedByCount > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}
                        data-testid="text-profile-reported-by"
                      >
                        {verifiedCounts.loaded
                          ? verifiedCounts.reportedBy.toLocaleString()
                          : reportedByCount.toLocaleString()}
                      </p>
                      {verifiedCounts.loaded && (
                        <p
                          className="font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500"
                          data-testid="text-verified-reported-by"
                        >
                          of {reportedByCount.toLocaleString()} total
                        </p>
                      )}
                    </div>
                    {rbExpandable && (
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${expandedSections["reported_by"] ? "rotate-180" : ""}`}
                      />
                    )}
                  </div>
                </div>
                {rbExpandable &&
                  Array.isArray(profileResult.reported_by) &&
                  renderExpandedPanel("reported_by", toPubkeys(profileResult.reported_by))}
              </div>
            );
          })()}
        {profileResult.muting !== undefined &&
          (() => {
            const mtExpandable = mutingCount > 0;
            return (
              <div>
                <div
                  className={`flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3.5 ${mtExpandable ? "cursor-pointer transition-all duration-200 hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06]" : ""}`}
                  onClick={mtExpandable ? () => toggleSection("muting") : undefined}
                  data-testid="metric-profile-muting"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 sm:h-8 sm:w-8">
                      <MutingIcon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 sm:h-4 sm:w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">Muting</p>
                      <p className="hidden text-[10px] leading-tight text-slate-400 dark:text-slate-500 sm:block sm:text-xs">
                        Accounts this person has muted
                      </p>
                      {renderTierBadges("muting")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p
                      className="font-mono text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                      data-testid="text-profile-muting"
                    >
                      {mutingCount.toLocaleString()}
                    </p>
                    {mtExpandable && (
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${expandedSections["muting"] ? "rotate-180" : ""}`}
                      />
                    )}
                  </div>
                </div>
                {mtExpandable &&
                  Array.isArray(profileResult.muting) &&
                  renderExpandedPanel("muting", toPubkeys(profileResult.muting))}
              </div>
            );
          })()}
        {profileResult.reporting !== undefined &&
          (() => {
            const rpExpandable = reportingCount > 0;
            return (
              <div>
                <div
                  className={`flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3.5 ${rpExpandable ? "cursor-pointer transition-all duration-200 hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06]" : ""}`}
                  onClick={rpExpandable ? () => toggleSection("reporting") : undefined}
                  data-testid="metric-profile-reporting"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900 sm:h-8 sm:w-8">
                      <ReportingIcon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 sm:h-4 sm:w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">Reporting</p>
                      <p className="hidden text-[10px] leading-tight text-slate-400 dark:text-slate-500 sm:block sm:text-xs">
                        Reports filed by this person
                      </p>
                      {renderTierBadges("reporting")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p
                      className="font-mono text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                      data-testid="text-profile-reporting"
                    >
                      {reportingCount.toLocaleString()}
                    </p>
                    {rpExpandable && (
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${expandedSections["reporting"] ? "rotate-180" : ""}`}
                      />
                    )}
                  </div>
                </div>
                {rpExpandable &&
                  Array.isArray(profileResult.reporting) &&
                  renderExpandedPanel("reporting", toPubkeys(profileResult.reporting))}
              </div>
            );
          })()}
      </div>
    </div>
  );
}

/** Mutes against reports as one bar, with how many of each are verified. */
export function RiskSignalsCard({
  mutedByCount,
  reportedByCount,
  isProfileFlagged,
  vMuted,
  vReported,
}: {
  mutedByCount: number;
  reportedByCount: number;
  isProfileFlagged: boolean;
  vMuted: number;
  vReported: number;
}) {
  const barTotal = mutedByCount + reportedByCount;
  const mutedPct = barTotal > 0 ? (mutedByCount / barTotal) * 100 : 0;
  const reportedPct = barTotal > 0 ? (reportedByCount / barTotal) * 100 : 0;
  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-900 dark:shadow-none"
      data-testid="alert-profile-trust-warning"
    >
      <div className="bg-slate-50/30 px-3 py-3 dark:bg-slate-900/30 sm:px-4 sm:py-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-1 rounded-full bg-brand-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 sm:text-[11px]">
              Social Context
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isProfileFlagged && (
              <span className="rounded-md border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400">
                Flagged
              </span>
            )}
            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
              {barTotal.toLocaleString()} total
            </span>
          </div>
        </div>
        {barTotal > 0 && (
          <div
            className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            data-testid="bar-social-context"
          >
            {mutedByCount > 0 && (
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${mutedPct}%`,
                  backgroundColor: "#f59e0b",
                  minWidth: "2px",
                }}
                title={`Muted by: ${mutedByCount}`}
              />
            )}
            {reportedByCount > 0 && (
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${reportedPct}%`,
                  backgroundColor: "#ef4444",
                  minWidth: "2px",
                }}
                title={`Reported by: ${reportedByCount}`}
              />
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {mutedByCount > 0 && (
            <div className="flex items-center gap-1.5" data-testid="legend-muted-by">
              <div className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Muted by</span>
              {vMuted > 0 ? (
                <>
                  <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400">
                    {vMuted} verified
                  </span>
                  <span className="text-[10px] font-medium text-slate-300 dark:text-slate-600">
                    of {mutedByCount.toLocaleString()}
                  </span>
                </>
              ) : (
                <span className="font-mono text-[10px] font-bold text-slate-900 dark:text-slate-100">
                  {mutedByCount.toLocaleString()}
                </span>
              )}
            </div>
          )}
          {reportedByCount > 0 && (
            <div className="flex items-center gap-1.5" data-testid="legend-reported-by">
              <div className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Reported by</span>
              {vReported > 0 ? (
                <>
                  <span className="font-mono text-[10px] font-bold text-red-600 dark:text-red-400">
                    {vReported} verified
                  </span>
                  <span className="text-[10px] font-medium text-slate-300 dark:text-slate-600">
                    of {reportedByCount.toLocaleString()}
                  </span>
                </>
              ) : (
                <span className="font-mono text-[10px] font-bold text-slate-900 dark:text-slate-100">
                  {reportedByCount.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
