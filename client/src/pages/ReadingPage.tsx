import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Loader2, Flame, Clock } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { NetworkArticleCard } from "@/components/dashboard/NetworkArticleCard";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logout, fetchProfileMap } from "@/services/nostr";
import { useNetworkArticles, type ArticleSort } from "@/hooks/useNetworkArticles";
import { cn } from "@/lib/utils";

/**
 * The full "Reading from your network" list — the surface behind the dashboard
 * strip's "See all". Same cards and the same trust attribution, just the whole run
 * with room to breathe, plus the one control the strip has no space for: how to
 * order it.
 *
 * Deliberately no search box. Search is a different intent — you search when you
 * already know what you want, whereas this page exists for discovery. Full-text
 * search over relay long-form is also an infrastructure project, not a filter.
 */
export default function ReadingPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useCurrentUser();
  const observer = user?.pubkey ?? "";
  const [sort, setSort] = useState<ArticleSort>("trending");

  const { articles, isLoading, hasAuthors } = useNetworkArticles(observer, { enabled: !!observer, sort });

  // One profile fetch for every author on the page (the dashboard strip only
  // resolves its top four).
  const pubkeys = useMemo(() => Array.from(new Set(articles.map((a) => a.event.pubkey))), [articles]);
  const profilesQuery = useQuery({
    queryKey: ["reading-profiles", pubkeys.join(",")],
    queryFn: () => fetchProfileMap(pubkeys),
    enabled: pubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles = profilesQuery.data ?? new Map();

  const handleLogout = () => { logout(); setUser(null); };

  const tab = (val: ArticleSort, label: string, Icon: typeof Flame) => (
    <button
      type="button"
      onClick={() => setSort(val)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
        sort === val
          ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
          : "text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white",
      )}
      data-testid={`reading-tab-${val}`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      {user && <AppHeader user={user} onLogout={handleLogout} />}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={() => { if (typeof window !== "undefined" && window.history.length > 1) window.history.back(); else navigate("/dashboard"); }}
          className="mb-6 inline-flex items-center gap-2 rounded text-sm text-slate-500 hover:text-brand-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:text-slate-400 dark:hover:text-white"
          data-testid="reading-back"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-1 flex items-center gap-3">
          <div className="rounded-lg border border-slate-100 bg-white p-2 text-brand-deep shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800">
            <BookOpen className="h-4 w-4" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            Reading from your network
          </h1>
        </div>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
          Long-form from accounts two hops out — people you don't follow yet, vouched for by those you do.
        </p>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center self-start rounded-full border border-slate-200 bg-slate-100/70 p-0.5 dark:border-slate-800 dark:bg-slate-800/50" role="group" aria-label="Sort">
            {tab("trending", "Trending", Flame)}
            {tab("new", "New", Clock)}
          </div>
          {articles.length > 0 && (
            <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400" data-testid="reading-count">
              {articles.length} {articles.length === 1 ? "article" : "articles"}
            </span>
          )}
        </div>

        {!observer ? null : isLoading && articles.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400" data-testid="reading-loading">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding what your network is reading…
          </div>
        ) : articles.length === 0 ? (
          <div className="py-8 text-sm text-slate-600 dark:text-slate-300" data-testid="reading-empty">
            {hasAuthors
              ? "Nothing published recently in your extended network. Check back in a few days."
              : "Follow a few more accounts and we'll surface what their circles are reading."}
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="reading-list">
            {articles.map((article) => (
              <NetworkArticleCard key={article.event.id} article={article} profile={profiles.get(article.event.pubkey)} />
            ))}
          </div>
        )}
      </main>
      <Footer minimal />
    </div>
  );
}
