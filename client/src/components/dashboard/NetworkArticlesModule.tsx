import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { useNetworkArticles } from "@/hooks/useNetworkArticles";
import { fetchProfileMap } from "@/services/nostr";
import type { MinimalEvent } from "@/lib/noteRefs";

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
  const { articles, isLoading, hasAuthors } = useNetworkArticles(observer, { enabled });
  const top = useMemo(() => articles.slice(0, 4), [articles]);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {top.map(({ event, author }) => (
            <div key={event.id} className="flex flex-col gap-1" data-testid="network-article">
              <EmbeddedArticleCard event={event as MinimalEvent} author={profiles.get(event.pubkey)} />
              {/* Why you're seeing this — the one line no other client can print.
                  Worded to match what the data actually means: verified followers
                  are accounts inside the observer's web of trust. */}
              <p className="px-1 text-[11px] text-slate-500 dark:text-slate-400">
                {author.verifiedFollowerCount > 0
                  ? `Followed by ${author.verifiedFollowerCount} account${author.verifiedFollowerCount === 1 ? "" : "s"} you trust`
                  : "In your extended network"}
                <span className="text-slate-300 dark:text-slate-600"> · </span>
                {author.hops} hops away
              </p>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !hasAuthors && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Follow a few more accounts and we'll surface what their circles are reading.
        </p>
      )}
    </Card>
  );
}
