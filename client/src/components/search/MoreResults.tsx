import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * The end of a page. A sentinel turns the next page as the reader reaches
 * it — the endless-feed feel (Benjamin, 2026-09-09: "search pages are
 * getting capped") — and a button says the same thing for anyone the
 * sentinel cannot serve: keyboard readers, a viewport that never scrolls,
 * and jsdom, where IntersectionObserver is a no-op. Absent once the relay
 * has nothing left.
 */
export function MoreResults({ show, loading, onMore }: { show: boolean; loading: boolean; onMore: () => void }) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !show || loading || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMoreRef.current();
    }, { rootMargin: "0px 0px 600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [show, loading]);
  if (!show) return null;
  return (
    <div ref={sentinel} className="flex justify-center py-6" data-testid="search-more-sentinel">
      <button
        type="button"
        onClick={onMore}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 transition-colors disabled:opacity-60"
        data-testid="search-more"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {loading ? "Loading more…" : "More results"}
      </button>
    </div>
  );
}
