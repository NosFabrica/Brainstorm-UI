/**
 * The Network Filters card: which relationship (Graph), which trust rung, a
 * text search over the loaded rows, Verified only, the sort and the layout.
 * Phones get two selects and a settings row; wider screens, pill rows.
 */
import type { Dispatch, SetStateAction } from "react";
import {
  ArrowUpDown,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Network,
  Search as SearchIcon,
  ShieldCheck,
  X,
} from "lucide-react";
import { groups, type GroupKey } from "@/components/network/networkGroups";
import type { ScorePov } from "@/components/score/TrustScorePov";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TrustFilterChoice, TrustTier } from "./networkFilters";

export function NetworkFilters({
  verifiedOnly,
  setVerifiedOnly,
  setCurrentPage,
  pov,
  activeGroup,
  setActiveGroup,
  getGroupCount,
  overviewCounts,
  trustFilter,
  setTrustFilter,
  trustFilterChoices,
  getGroupPubkeys,
  isLoading,
  searchLoading,
  searchFilter,
  setSearchFilter,
  sortDirection,
  setSortDirection,
  viewMode,
  setViewMode,
}: {
  verifiedOnly: boolean;
  setVerifiedOnly: (on: boolean) => void;
  setCurrentPage: (page: number) => void;
  pov: ScorePov;
  activeGroup: GroupKey;
  setActiveGroup: (group: GroupKey) => void;
  getGroupCount: (key: GroupKey) => number;
  overviewCounts: Partial<Record<GroupKey, number>> | undefined;
  trustFilter: TrustTier;
  setTrustFilter: (tier: TrustTier) => void;
  trustFilterChoices: TrustFilterChoice[];
  getGroupPubkeys: (key: GroupKey) => string[];
  isLoading: boolean;
  searchLoading: boolean;
  searchFilter: string;
  setSearchFilter: (text: string) => void;
  sortDirection: "desc" | "asc";
  setSortDirection: Dispatch<SetStateAction<"desc" | "asc">>;
  viewMode: "grid" | "list";
  setViewMode: (mode: "grid" | "list") => void;
}) {
  return (
    <Card
      className="relative overflow-hidden rounded-xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
      data-testid="card-network-filters"
    >
      <CardHeader className="relative border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
        {/* Title row — shared across mobile and desktop */}
        <div className="flex items-center justify-between gap-3 pr-20 sm:pr-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg border border-slate-100 bg-white p-2 text-brand-primary shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:text-brand-link dark:shadow-none dark:ring-slate-800/60">
              <Filter className="h-4 w-4" />
            </div>
            <div className="min-w-0 rounded-2xl border border-slate-100 bg-white/50 px-4 py-2 shadow-sm backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-900/50">
              <CardTitle
                className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-200"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Network Filters
              </CardTitle>
              <CardDescription className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Social Graph
              </CardDescription>
            </div>
          </div>
          {/* Desktop: Verified + NOSTR inline on the right */}
          <div className="hidden shrink-0 items-center gap-4 sm:flex">
            {/* The switch is the only thing that says on/off; the words stay the
                      same colour either way and tell you what flipping it does. */}
            <label className="flex cursor-pointer select-none items-center gap-2.5" data-testid="toggle-verified-only">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Verified only</span>
              <Switch
                checked={verifiedOnly}
                onCheckedChange={(checked) => {
                  setVerifiedOnly(checked);
                  setCurrentPage(1);
                }}
                className="data-[state=checked]:bg-brand-primary"
                data-testid="switch-verified-only"
              />
            </label>
            <div
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2 py-1 text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-link"
              data-testid="badge-nostr-network"
            >
              <img src="/nostr-ostrich.gif" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
              <span>NOSTR</span>
            </div>
          </div>
        </div>

        {/* Mobile: NOSTR badge pinned to top-right corner */}
        <div
          className="absolute right-5 top-4 flex items-center gap-1.5 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2 py-1 text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-link sm:hidden"
          data-testid="badge-nostr-network-mobile"
        >
          <img src="/nostr-ostrich.gif" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
          <span>NOSTR</span>
        </div>

        {/* Mobile: the same switch as a quiet settings row — a hairline above it,
                  no filled card or icon, so it reads as a setting and not a banner. */}
        <div className="mt-3 border-t border-slate-200/70 pt-3 dark:border-slate-800 sm:hidden">
          <label
            className="flex cursor-pointer select-none items-center justify-between gap-3"
            data-testid="toggle-verified-only-mobile"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Verified only</div>
              <div className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                Hide accounts {pov === "personalized" ? "your" : "Brainstorm's"} network doesn't vouch for
              </div>
            </div>
            <Switch
              checked={verifiedOnly}
              onCheckedChange={(checked) => {
                setVerifiedOnly(checked);
                setCurrentPage(1);
              }}
              className="shrink-0 data-[state=checked]:bg-brand-primary"
              data-testid="switch-verified-only-mobile"
            />
          </label>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 bg-white/60 p-3 dark:bg-slate-900/60 sm:space-y-3 sm:p-5">
        {/* Mobile dropdowns — hidden on sm+ */}
        <div className="flex gap-2 sm:hidden">
          <div className="min-w-0 flex-1">
            <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand-link">
              <Network className="h-3 w-3" />
              Graph
            </label>
            <select
              value={activeGroup}
              onChange={(e) => {
                setActiveGroup(e.target.value as GroupKey);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/20 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200"
              data-testid="select-group-filter-mobile"
            >
              {(["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"] as GroupKey[]).map(
                (k) => {
                  const group = groups.find((g) => g.key === k);
                  if (!group) return null;
                  const count = getGroupCount(group.key);
                  return (
                    <option key={k} value={k}>
                      {group.label} — {count}
                    </option>
                  );
                },
              )}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand-link">
              <ShieldCheck className="h-3 w-3" />
              Trust
            </label>
            <select
              value={trustFilter}
              onChange={(e) => {
                setTrustFilter(e.target.value as TrustTier);
                setCurrentPage(1);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/20 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200"
              data-testid="select-trust-filter-mobile"
            >
              {trustFilterChoices
                .filter((c) => c.key !== "flagged" || getGroupPubkeys("flagged").length > 0)
                .map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Desktop pill rows — hidden on mobile */}
        <div>
          {/* One row, whatever the counts: the pills grow from their natural width and
                    shrink together, the label truncating last. */}
          <div className="hidden items-center gap-1.5 sm:flex sm:flex-nowrap" data-testid="row-group-filters-graph">
            <span className="mr-1 shrink-0 self-center border-r border-slate-200/60 pr-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
              Graph
            </span>
            {(["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"] as GroupKey[]).map((k) => {
              const group = groups.find((g) => g.key === k);
              if (!group) return null;
              const count = getGroupCount(group.key);
              const totalCount = overviewCounts?.[group.key] ?? 0;
              const isActive = activeGroup === group.key;
              return (
                <UITooltip key={group.key} delayDuration={500}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveGroup(group.key);
                        setCurrentPage(1);
                      }}
                      className={`flex min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${
                        isActive
                          ? "border border-brand-primary bg-brand-primary text-white"
                          : "border border-slate-200/60 bg-white/60 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                      }`}
                      data-testid={`button-filter-${group.key}`}
                    >
                      {/* No icon: the words say which way the relationship runs, and the
                                  room goes to the verified/total count instead. */}
                      <span className="min-w-0 truncate">{group.shortLabel}</span>
                      <span
                        className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                          isActive
                            ? "bg-white/20 text-white"
                            : `${group.bgColor} ${group.color} ${group.borderColor} border`
                        }`}
                      >
                        {verifiedOnly ? `${count}/${totalCount}` : count}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className={`max-w-[220px] border border-l-2 border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 shadow-lg backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${group.tooltipAccent}`}
                  >
                    <p className="text-xs font-medium">{group.tooltip}</p>
                    {verifiedOnly && totalCount !== count && (
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {count} verified of {totalCount} total
                      </p>
                    )}
                  </TooltipContent>
                </UITooltip>
              );
            })}
          </div>
        </div>

        <div className="my-0.5 hidden border-t border-slate-200/60 dark:border-slate-800 sm:block" />

        {/* The trust filters in the ladder's own words and colours (lib/trustLadder),
                  the same ones the avatar rings and coins wear — one trust language on the
                  page, not a third set of hand-drawn rings. */}
        <div className="hidden gap-1.5 sm:flex sm:flex-wrap sm:gap-2" data-testid="row-trust-filters">
          <span className="mr-1 shrink-0 self-center border-r border-slate-200/60 pr-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
            Trust
          </span>
          {trustFilterChoices.map((choice) => {
            const isActive = trustFilter === choice.key;
            return (
              <UITooltip key={choice.key} delayDuration={500}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setTrustFilter(choice.key);
                      setCurrentPage(1);
                    }}
                    aria-pressed={isActive}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? "border-brand-primary bg-brand-primary text-white"
                        : "border-slate-200/60 bg-white/60 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                    }`}
                    data-testid={`button-trust-filter-${choice.key}`}
                  >
                    {choice.color && (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: choice.color }}
                      />
                    )}
                    <span>{choice.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="border border-l-2 border-slate-300 border-l-brand-primary bg-white px-2.5 py-1.5 text-slate-700 shadow-lg backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <p className="text-xs font-medium">{choice.tooltip}</p>
                </TooltipContent>
              </UITooltip>
            );
          })}
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="group/input relative flex-1">
            <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-primary opacity-20 blur transition duration-500 group-hover/input:opacity-50" />
            <div className="relative flex items-center">
              {searchLoading ? (
                <Loader2 className="absolute left-3 z-10 h-4 w-4 animate-spin text-brand-primary" />
              ) : (
                <SearchIcon className="absolute left-3 z-10 h-4 w-4 text-slate-400 dark:text-slate-500" />
              )}
              <Input
                placeholder={isLoading ? "Loading your network…" : "Search by name or npub..."}
                className={`relative rounded-lg border-brand-primary/[0.3] bg-white/90 pl-9 text-sm text-slate-900 shadow-[0_0_10px_rgb(var(--brand-primary)/0.05)] shadow-sm backdrop-blur-sm transition-all placeholder:text-slate-400 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:bg-slate-900/90 dark:text-slate-100 dark:placeholder:text-slate-500 ${searchFilter ? "pr-9" : ""} ${isLoading || searchLoading ? "cursor-wait opacity-70" : ""}`}
                value={searchFilter}
                onChange={(e) => {
                  setSearchFilter(e.target.value);
                  setCurrentPage(1);
                }}
                disabled={isLoading || searchLoading}
                aria-busy={isLoading || searchLoading}
                data-testid="input-network-search"
              />
              {searchFilter && !isLoading && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchFilter("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-2 z-10 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Clear search"
                  data-testid="button-clear-network-search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {searchFilter.trim().length >= 2 && searchLoading && (
              <p
                className="ml-1 mt-1 flex items-center gap-1.5 text-[11px] text-brand-primary/80"
                role="status"
                aria-live="polite"
                data-testid="text-network-search-loading"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading profiles to search across this group…
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-primary/25 hover:text-brand-primary dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-brand-primary/[0.4] dark:hover:text-brand-link"
              onClick={() => {
                setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
                setCurrentPage(1);
              }}
              data-testid="button-sort-trust"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span>Trust {sortDirection === "desc" ? "↓" : "↑"}</span>
            </button>
            <div
              className="flex shrink-0 items-center rounded-lg border border-slate-200/60 bg-white/80 p-0.5 dark:border-slate-800 dark:bg-slate-900/80"
              data-testid="row-view-toggle"
            >
              <button
                type="button"
                className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-brand-primary text-white" : "text-slate-400 dark:text-slate-500"}`}
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-brand-primary text-white" : "text-slate-400 dark:text-slate-500"}`}
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
