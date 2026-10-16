import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useConnectionSpeed } from "@/lib/connection";

/**
 * The end of a page. A sentinel turns the next page as the reader reaches
 * it — the endless-feed feel (Benjamin, 2026-09-09: "search pages are
 * getting capped") — and a button says the same thing for anyone the
 * sentinel cannot serve: keyboard readers, a viewport that never scrolls,
 * and jsdom, where IntersectionObserver is a no-op. Absent once the relay
 * has nothing left.
 *
 * The dashboard's feed uses it too, with its own words and test id, and with
 * `auto` off once it has turned a few pages by itself — an endless feed still
 * needs a floor the reader chooses to step past.
 */
export function MoreResults({
  show,
  loading,
  onMore,
  auto = true,
  label = "More results",
  testId = "search-more",
}: {
  show: boolean;
  loading: boolean;
  onMore: () => void;
  /** Turn the page as the sentinel scrolls into view; off, only the button turns it. */
  auto?: boolean;
  label?: string;
  testId?: string;
}) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;
  // A poor connection turns pages on request only — the button below says so.
  const byRequest = useConnectionSpeed() !== "normal";
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !show || loading || !auto || byRequest || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMoreRef.current();
      },
      { rootMargin: "0px 0px 600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, loading, auto, byRequest]);
  if (!show) return null;
  return (
    <div ref={sentinel} className="flex justify-center py-6" data-testid={`${testId}-sentinel`}>
      <button
        type="button"
        onClick={onMore}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-brand-accent/40 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300"
        data-testid={testId}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {loading ? "Loading more…" : label}
      </button>
    </div>
  );
}
