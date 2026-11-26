/**
 * One expanded relationship list on the analytics profile: its sort, filter,
 * report-type and search controls, and its rows (avatar, report or mute
 * metadata, overlap pills, the viewer's score ring), shown ten at a time.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { nip19 } from "nostr-tools";
import { ArrowUpDown, ChevronDown, Filter, Loader2, Search as SearchIcon, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import { REPORT_TYPE_BADGE_COLORS } from "@/lib/reportMeta";
import type { ReportMetadata } from "@/services/nostr";
import { expandProfileAttempted, expandProfileCache, muteMetadataCache } from "@/services/profilePageCache";
import {
  CONNECTION_GROUP_KEYS,
  FILTER_OPTIONS,
  OWNER_PILL_META,
  REPORT_TYPE_OPTIONS,
  SECTION_BORDER_COLORS,
  SORT_OPTIONS,
  YOU_PILL_META,
  computeProcessedPubkeys,
  deriveConnectionClusters,
  type FilterMode,
  type GroupDef,
  type ReportTypeFilter,
  type SortMode,
  type TrustCache,
} from "./connectionModel";
import { nameIn } from "@/lib/displayName";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

export interface ExpandedPanelProps {
  sectionKey: string;
  pubkeys: string[];
  filter: FilterMode;
  sort: SortMode;
  search: string;
  reportTypeFilter: ReportTypeFilter;
  visibleCount: number;
  sectionTotal?: number; // Server-truth total for this section/filter, if known.
  filterDropdownOpen: boolean;
  reportTypeDropdownOpen: boolean;
  reportMetaLoading: boolean;
  sectionInfluenceMaps: Record<string, Map<string, number | null>>;
  /** The viewer's scores under their preset (expandTrustCacheFor). */
  trustCache: TrustCache;
  groupsByPubkey: Map<string, GroupDef[]>;
  getReportForPubkey: (sectionKey: string, pubkey: string) => ReportMetadata | undefined;
  formatRelativeTime: (timestamp: number) => string;
  navigateToProfile: (pk: string) => void;
  onSetSort: (k: string, v: SortMode) => void;
  onSetFilter: (k: string, v: FilterMode) => void;
  onSetSearch: (k: string, v: string) => void;
  onSetReportTypeFilter: (k: string, v: ReportTypeFilter) => void;
  onSetVisibleCount: (k: string, n: number) => void;
  onToggleFilterDropdown: (k: string, open: boolean) => void;
  onToggleReportTypeDropdown: (k: string, open: boolean) => void;
  onShowMore: (k: string, processed: string[], currentVisible: number) => void;
  onEnsureVisibleFetched: (k: string, visiblePubkeys: string[]) => void;
  renderToken: number;
}

export const ExpandedPanel = memo(function ExpandedPanel(props: ExpandedPanelProps) {
  const tierRing = useTierRing();
  const [granularity] = useTierGranularity();
  // Decision 7: under Simple the menu offers the three buckets' worth of choices
  // — All / Verified / Unknown — not five shades it never draws.
  const visibleFilterOptions =
    granularity === "simple"
      ? FILTER_OPTIONS.filter((o) => o.value === "all" || o.value === "verified" || o.value === "unverified").map(
          (o) => (o.value === "unverified" ? { ...o, label: "Unknown" } : o),
        )
      : FILTER_OPTIONS;
  const {
    sectionKey: key,
    pubkeys,
    filter,
    sort,
    search,
    reportTypeFilter,
    visibleCount,
    sectionTotal,
    filterDropdownOpen,
    reportTypeDropdownOpen,
    reportMetaLoading,
    sectionInfluenceMaps,
    trustCache,
    groupsByPubkey,
    getReportForPubkey,
    formatRelativeTime,
    navigateToProfile,
    onSetSort,
    onSetFilter,
    onSetSearch,
    onSetReportTypeFilter,
    onSetVisibleCount,
    onToggleFilterDropdown,
    onToggleReportTypeDropdown,
    onShowMore,
    onEnsureVisibleFetched,
    renderToken,
  } = props;

  const debouncedSearch = useDebouncedValue(search, 250);
  const processed = useMemo(
    () =>
      computeProcessedPubkeys(
        key,
        pubkeys,
        filter,
        sort,
        debouncedSearch,
        reportTypeFilter,
        sectionInfluenceMaps,
        getReportForPubkey,
        trustCache,
      ),
    // renderToken in deps so name-sort updates as profiles stream in
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      key,
      pubkeys,
      filter,
      sort,
      debouncedSearch,
      reportTypeFilter,
      sectionInfluenceMaps,
      getReportForPubkey,
      trustCache,
      renderToken,
    ],
  );

  const isReportFilterSection = key === "reported_by" || key === "reporting";
  const isFiltered = filter !== "all" || debouncedSearch.trim().length > 0 || reportTypeFilter !== "all";
  const visiblePubkeys = useMemo(() => processed.slice(0, visibleCount), [processed, visibleCount]);
  const borderColor = SECTION_BORDER_COLORS[key] || "border-slate-300 dark:border-slate-700";

  useEffect(() => {
    if (visiblePubkeys.length === 0) return;
    const needsFetch = visiblePubkeys.some((pk) => !expandProfileCache.has(pk) || !trustCache.has(pk));
    if (needsFetch) onEnsureVisibleFetched(key, visiblePubkeys);
  }, [key, visiblePubkeys, onEnsureVisibleFetched, trustCache]);

  return (
    <div className="border-t border-slate-100 bg-slate-50/50 dark:border-slate-800/60 dark:bg-slate-900/50">
      <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex items-center gap-1">
            <ArrowUpDown className="h-3 w-3 text-slate-400 dark:text-slate-500" />
            <div className="flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetSort(key, opt.value);
                  }}
                  className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${sort === opt.value ? "bg-brand-primary text-white" : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-900"}`}
                  data-testid={`sort-${opt.value}-${key}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFilterDropdown(key, !filterDropdownOpen);
              }}
              className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${filter !== "all" ? "border-brand-primary/25 bg-brand-primary/10 text-brand-primary dark:border-brand-primary/[0.3] dark:bg-brand-primary/10 dark:text-brand-link" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-900"}`}
              data-testid={`filter-toggle-${key}`}
            >
              <Filter className="h-3 w-3" />
              {filter !== "all" ? visibleFilterOptions.find((f) => f.value === filter)?.label : "Filter"}
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {filterDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFilterDropdown(key, false);
                  }}
                />
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {visibleFilterOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetFilter(key, opt.value);
                        onSetVisibleCount(key, 10);
                        onToggleFilterDropdown(key, false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium transition-colors ${filter === opt.value ? "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/10 dark:text-brand-link" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}
                      data-testid={`filter-${opt.value}-${key}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${opt.value === "all" ? "bg-slate-300 dark:bg-slate-700" : opt.value === "verified" ? "bg-brand-primary" : opt.value === "high" ? "bg-emerald-500" : opt.value === "trusted" ? "bg-sky-400" : opt.value === "neutral" ? "bg-brand-primary" : opt.value === "low" ? "bg-amber-400" : "bg-slate-400 dark:bg-slate-600"}`}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {isReportFilterSection && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReportTypeDropdown(key, !reportTypeDropdownOpen);
                }}
                className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${reportTypeFilter !== "all" ? "border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-900"}`}
                data-testid={`report-type-filter-toggle-${key}`}
              >
                <span className="h-2 w-2 rounded-full bg-current opacity-50" />
                {reportTypeFilter !== "all" ? reportTypeFilter : "Type"}
                <ChevronDown className="h-2.5 w-2.5" />
              </button>
              {reportTypeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleReportTypeDropdown(key, false);
                    }}
                  />
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    {REPORT_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetReportTypeFilter(key, opt.value);
                          onSetVisibleCount(key, 10);
                          onToggleReportTypeDropdown(key, false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium transition-colors ${reportTypeFilter === opt.value ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}
                        data-testid={`report-type-filter-${opt.value}-${key}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${opt.dotColor}`} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {reportMetaLoading && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-brand-link">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              <span>fetching relay data</span>
            </span>
          )}
          {isFiltered && (
            <span
              className={`text-[10px] text-slate-400 dark:text-slate-500 ${reportMetaLoading ? "" : "ml-auto"}`}
              data-testid={`filter-count-${key}`}
            >
              {processed.length} of {pubkeys.length}
            </span>
          )}
        </div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              onSetSearch(key, e.target.value);
              onSetVisibleCount(key, 10);
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Search by name or npub..."
            className="w-full rounded-md border border-slate-200 bg-white py-1 pl-7 pr-7 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-brand-primary/25 focus:outline-none focus:ring-1 focus:ring-brand-primary/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-600"
            data-testid={`search-input-${key}`}
          />
          {search && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetSearch(key, "");
                onSetVisibleCount(key, 10);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              data-testid={`search-clear-${key}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className={`border-l-2 ${borderColor} ml-4`}>
        {visiblePubkeys.map((pk) => {
          const profile = expandProfileCache.get(pk);
          const trustScore = trustCache.get(pk);
          const displayName = nameIn(profile) || nip19.npubEncode(pk).slice(0, 12) + "...";
          const overlappingGroups = (groupsByPubkey.get(pk) ?? []).filter((g) => g.key !== key);

          const trustPct =
            trustScore !== undefined && trustScore !== null
              ? Math.round(Math.min(1, Math.max(0, trustScore)) * 100)
              : null;
          const circ = 2 * Math.PI * 18;
          const trustOffset = trustPct !== null ? circ - (trustPct / 100) * circ : circ;
          const ringColor =
            trustPct !== null
              ? trustPct >= 50
                ? "text-brand-primary"
                : trustPct >= 20
                  ? "text-brand-link"
                  : trustPct >= 7
                    ? "text-brand-link"
                    : "text-brand-link"
              : "text-brand-link";

          if (profile === undefined && !expandProfileAttempted.has(pk)) {
            return (
              <div
                key={pk}
                className="flex items-center gap-3 px-4 py-2"
                data-testid={`expand-profile-${pk.slice(0, 8)}`}
              >
                <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-2 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              </div>
            );
          }

          const isReportSection = key === "reported_by" || key === "reporting";
          const isMuteSection = key === "muted_by" || key === "muting";
          const reportMeta = isReportSection ? getReportForPubkey(key, pk) : undefined;
          const muteMeta = isMuteSection ? muteMetadataCache.get(pk) : undefined;

          return (
            <div
              key={pk}
              className="flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-white/80 dark:hover:bg-slate-900/80"
              onClick={() => navigateToProfile(pk)}
              data-testid={`expand-profile-${pk.slice(0, 8)}`}
            >
              <Avatar
                className={`h-7 w-7 shrink-0 border border-slate-200/60 dark:border-slate-800/60 ${tierRing(trustScore) ?? ""}`}
              >
                <AvatarImage src={profile?.picture} />
                <AvatarFallback className="bg-brand-primary/10 text-xs font-bold text-brand-primary dark:bg-brand-primary/10 dark:text-brand-link">
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{displayName}</p>
                {profile?.nip05 && <p className="truncate text-xs text-brand-primary">{profile.nip05}</p>}
                {isReportSection && reportMeta && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`no-default-hover-elevate no-default-active-elevate px-1.5 py-0 text-[9px] font-medium ${REPORT_TYPE_BADGE_COLORS[reportMeta.reportType] || REPORT_TYPE_BADGE_COLORS.other}`}
                      data-testid={`report-type-${pk.slice(0, 8)}`}
                    >
                      {reportMeta.reportType}
                    </Badge>
                    <span
                      className="text-[10px] text-slate-400 dark:text-slate-500"
                      data-testid={`report-time-${pk.slice(0, 8)}`}
                    >
                      {formatRelativeTime(reportMeta.timestamp)}
                    </span>
                    {reportMeta.reason && (
                      <span
                        className="max-w-[140px] truncate text-[10px] italic text-slate-400 dark:text-slate-500"
                        title={reportMeta.reason}
                        data-testid={`report-reason-${pk.slice(0, 8)}`}
                      >
                        "{reportMeta.reason}"
                      </span>
                    )}
                  </div>
                )}
                {isReportSection && !reportMeta && reportMetaLoading && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <div className="h-2 w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-2 w-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                )}
                {isReportSection && !reportMeta && !reportMetaLoading && (
                  <span
                    className="mt-0.5 block text-[10px] italic text-slate-300 dark:text-slate-600"
                    data-testid={`report-unavailable-${pk.slice(0, 8)}`}
                  >
                    report details unavailable
                  </span>
                )}
                {isMuteSection && muteMeta && (
                  <span
                    className="text-[10px] text-slate-400 dark:text-slate-500"
                    data-testid={`mute-time-${pk.slice(0, 8)}`}
                  >
                    {formatRelativeTime(muteMeta.timestamp)}
                  </span>
                )}
              </div>
              {(() => {
                const overlapKeySet = new Set(overlappingGroups.map((g) => g.key));
                const { owner, you } = deriveConnectionClusters(overlapKeySet);
                const nonConnectionGroups = overlappingGroups.filter((g) => !CONNECTION_GROUP_KEYS.has(g.key));
                if (!owner && !you && nonConnectionGroups.length === 0) return null;
                return (
                  <div className="flex flex-wrap justify-end gap-1">
                    {owner &&
                      (() => {
                        const meta = OWNER_PILL_META[owner];
                        return (
                          <Badge
                            variant="outline"
                            className="no-default-hover-elevate no-default-active-elevate gap-1 border-teal-200 bg-teal-50 px-1.5 py-0 text-[10px] text-teal-600 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-400"
                            data-testid={`pill-owner-${owner}-${pk.slice(0, 8)}`}
                          >
                            <meta.Icon className="h-2.5 w-2.5" />
                            {meta.label}
                          </Badge>
                        );
                      })()}
                    {you &&
                      (() => {
                        const meta = YOU_PILL_META[you];
                        return (
                          <Badge
                            variant="outline"
                            className="no-default-hover-elevate no-default-active-elevate gap-1 border-brand-primary/20 bg-brand-primary/10 px-1.5 py-0 text-[10px] text-brand-primary dark:border-brand-primary/25 dark:bg-brand-primary/10 dark:text-brand-link"
                            data-testid={`pill-you-${you}-${pk.slice(0, 8)}`}
                          >
                            <meta.Icon className="h-2.5 w-2.5" />
                            {meta.label}
                          </Badge>
                        );
                      })()}
                    {nonConnectionGroups.map((g) => (
                      <Badge
                        key={g.key}
                        variant="outline"
                        className={`no-default-hover-elevate no-default-active-elevate px-1 py-0 text-[10px] ${g.colors}`}
                      >
                        {g.label}
                      </Badge>
                    ))}
                  </div>
                );
              })()}
              {trustScore !== undefined && trustScore !== null && (
                <div className="relative h-6 w-6 shrink-0">
                  <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      className="text-brand-link dark:text-brand-primary/20"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      strokeWidth="4"
                      strokeLinecap="round"
                      className={ringColor}
                      style={{ strokeDasharray: circ, strokeDashoffset: trustOffset }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-brand-primary dark:text-brand-link">
                    {trustPct}
                  </span>
                </div>
              )}
              {trustScore === undefined && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-brand-link" />}
            </div>
          );
        })}
        {processed.length > visibleCount && (
          <div className="px-3 py-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowMore(key, processed, visibleCount);
              }}
              className="w-full rounded-lg bg-brand-primary py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-brand-primary-hover hover:shadow-md"
              data-testid={`button-show-more-${key}`}
            >
              Show {Math.min(10, processed.length - visibleCount)} more{" "}
              <span className="ml-1 font-mono text-white/60">
                ({processed.length - visibleCount} remaining
                {typeof sectionTotal === "number" && sectionTotal > processed.length
                  ? ` of ${sectionTotal.toLocaleString()} total`
                  : ""}
                )
              </span>
            </button>
          </div>
        )}
        {processed.length === 0 && isFiltered && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">No users match this filter</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetFilter(key, "all");
                onSetReportTypeFilter(key, "all");
              }}
              className="mt-1.5 text-xs font-medium text-brand-link hover:underline"
              data-testid={`filter-clear-${key}`}
            >
              Clear filter
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
