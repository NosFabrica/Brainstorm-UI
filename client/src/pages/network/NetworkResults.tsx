/** The Network rows: a skeleton while loading, an empty card, or the page of cards and its pager. */
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { NetworkProfileCard } from "@/components/network/NetworkProfileCard";
import {
  NetworkCardActionsProvider,
  NetworkCardViewProvider,
  type NetworkCardActions,
  type NetworkCardView,
} from "@/components/network/cardContext";
import type { GroupKey } from "@/components/network/networkGroups";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { useSocialActions } from "@/hooks/useSocialActions";
import type { PageWindow } from "./networkFilters";
import type { RowGraphData } from "./useRowScores";

export function NetworkSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="grid-network-skeleton">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-slate-200/60 bg-white/80 p-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80"
          data-testid={`skeleton-card-${i}`}
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-2 w-32 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
          <div className="mt-3 flex gap-1">
            <div className="h-4 w-14 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 w-16 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NetworkEmpty({ filtered }: { filtered: boolean }) {
  return (
    <Card
      className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
      data-testid="card-network-empty"
    >
      <div className="flex flex-col items-center p-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-brand-primary dark:border-slate-800 dark:bg-slate-900 dark:text-brand-link">
          <Users className="h-6 w-6" />
        </div>
        <h3
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="text-network-empty-title"
        >
          {filtered ? "No matches found" : "No contacts yet"}
        </h3>
        <p
          className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-300"
          data-testid="text-network-empty-body"
        >
          {filtered
            ? "Try a different search term, Verification Score range, or group filter."
            : "Your network data will appear here once your social graph is populated."}
        </p>
      </div>
    </Card>
  );
}

export function NetworkGrid({
  cardActions,
  cardView,
  viewMode,
  fetching,
  visiblePubkeyPage,
  profileCache,
  trustCache,
  graphDataCache,
  profileAttempted,
  expandedPubkey,
  expandedDetailGraph,
  expandedStats,
  expandedIsLoading,
  copiedPubkey,
  selfPubkey,
  social,
  groupPubkeySets,
}: {
  cardActions: NetworkCardActions;
  cardView: NetworkCardView;
  viewMode: "grid" | "list";
  fetching: boolean;
  visiblePubkeyPage: PageWindow;
  profileCache: { current: Map<string, ProfileContent> };
  trustCache: { current: Map<string, number | null> };
  graphDataCache: { current: Map<string, RowGraphData> };
  profileAttempted: { current: Set<string> };
  expandedPubkey: string | null;
  expandedDetailGraph: Record<string, number> | null;
  expandedStats: Record<string, { verified: number; total: number }> | undefined;
  expandedIsLoading: boolean;
  copiedPubkey: string | null;
  selfPubkey: string | undefined;
  social: ReturnType<typeof useSocialActions>;
  groupPubkeySets: Record<GroupKey, Set<string>> | null;
}) {
  return (
    <NetworkCardActionsProvider value={cardActions}>
      <NetworkCardViewProvider value={cardView}>
        <div
          className={`${viewMode === "grid" ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2"} transition-opacity duration-150 ${fetching ? "opacity-60" : "opacity-100"}`}
          data-testid="grid-network-profiles"
        >
          {visiblePubkeyPage.items.map((pk) => (
            <div key={pk} className={viewMode === "grid" ? "contents" : ""}>
              <NetworkProfileCard
                pk={pk}
                profile={profileCache.current.get(pk)}
                trustScore={trustCache.current.get(pk)}
                graphData={graphDataCache.current.get(pk)}
                detail={expandedPubkey === pk ? expandedDetailGraph : undefined}
                stats={expandedPubkey === pk ? expandedStats : undefined}
                isExpanded={expandedPubkey === pk}
                isCopied={copiedPubkey === pk}
                isProfileLoaded={profileCache.current.has(pk)}
                profileAttempted={profileAttempted.current.has(pk)}
                expandedLoading={expandedPubkey === pk && expandedIsLoading}
                isSelf={selfPubkey === pk}
                isFollowingUser={social.isFollowing(pk)}
                isMutedUser={social.isMuted(pk)}
                isFlagged={groupPubkeySets?.flagged?.has(pk) ?? false}
              />
            </div>
          ))}
        </div>
      </NetworkCardViewProvider>
    </NetworkCardActionsProvider>
  );
}

export function NetworkPager({
  visiblePubkeyPage,
  setCurrentPage,
}: {
  visiblePubkeyPage: PageWindow;
  setCurrentPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-4" data-testid="row-pagination">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {visiblePubkeyPage.startIdx + 1}&ndash;
        {visiblePubkeyPage.nextItemStart} of {visiblePubkeyPage.totalItems}
      </span>
      {visiblePubkeyPage.totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={visiblePubkeyPage.safePage <= 1}
            onClick={() => {
              setCurrentPage(visiblePubkeyPage.safePage - 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            data-testid="button-page-prev"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
          <span
            className="px-2 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300"
            data-testid="text-page-indicator"
          >
            {visiblePubkeyPage.safePage} / {visiblePubkeyPage.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={visiblePubkeyPage.safePage >= visiblePubkeyPage.totalPages}
            onClick={() => {
              setCurrentPage(visiblePubkeyPage.safePage + 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            data-testid="button-page-next"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
