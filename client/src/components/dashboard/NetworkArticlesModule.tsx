import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BookOpen, Loader2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NetworkArticleCard } from "@/components/dashboard/NetworkArticleCard";
import { useNetworkArticles } from "@/hooks/useNetworkArticles";
import { fetchProfileMap } from "@/services/nostr";

/**
 * "Reading from your network" — long-form from accounts two-plus hops out,
 * ranked by trust. Deliberately NOT a following feed: every other client already
 * shows you your own follows, so the value Brainstorm can uniquely add is what's
 * just outside your circle, with the graph vouching for it.
 *
 * Articles (not notes) on purpose while posting/replying doesn't exist yet — an
 * article is satisfying to consume with no way to respond, whereas a text feed
 * begs for a reply the product can't offer.
 */
export function NetworkArticlesModule({ observer, enabled }: { observer: string; enabled: boolean }) {
  const [, navigate] = useLocation();
  const { articles, isLoading, hasAuthors } = useNetworkArticles(observer, { enabled });
  const top = useMemo(() => articles.slice(0, 4), [articles]);
  // Only advertise the full list when there's actually more behind the link.
  const hasMore = articles.length > top.length;

  const pubkeys = useMemo(() => top.map((a) => a.event.pubkey), [top]);
  const profilesQuery = useQuery({
    queryKey: ["network-articles-profiles", pubkeys.join(",")],
    queryFn: () => fetchProfileMap(pubkeys),
    enabled: pubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data ?? new Map();

  // Nothing to show and nothing coming — stay out of the way rather than render
  // an empty card on the dashboard.
  if (!enabled || (!isLoading && top.length === 0)) return null;

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 mb-6" data-testid="card-network-articles">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
          <BookOpen className="h-3.5 w-3.5" />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Reading from your network
        </span>
        <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">Beyond who you follow</span>
      </div>

      {isLoading && top.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" data-testid="network-articles-loading">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding what your network is reading…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
          {top.map((article) => (
            <NetworkArticleCard key={article.event.id} article={article} profile={profiles.get(article.event.pubkey)} />
          ))}
        </div>
      )}

      {/* Depth lives one click away rather than crowding the dashboard — same move
          as "View all flagged accounts" on the alerts card. */}
      {hasMore && (
        <button
          type="button"
          onClick={() => navigate("/reading")}
          className="mt-3 inline-flex items-center gap-1 self-start rounded text-[11px] font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid="network-articles-see-all"
        >
          See all {articles.length} articles <ArrowRight className="h-3 w-3" />
        </button>
      )}

      {!isLoading && !hasAuthors && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Follow a few more accounts and we'll surface what their circles are reading.
        </p>
      )}
    </Card>
  );
}
