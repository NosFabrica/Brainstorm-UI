import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, X, Clock, ArrowUpRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { getRecentItems, recentKey, pushRecentQuery, removeRecentItem, clearRecentSearches, type RecentItem } from "@/lib/recentSearches";

/** Fire from anywhere (a header magnifier) to open mobile search. */
export const OPEN_MOBILE_SEARCH_EVENT = "open-mobile-search";

export function openMobileSearch() {
  window.dispatchEvent(new Event(OPEN_MOBILE_SEARCH_EVENT));
}

/**
 * Mobile search, as an overlay over the current page.
 *
 * The header magnifier used to be a `<Link href="/">`, so tapping it NAVIGATED
 * AWAY and you lost whatever you were reading — the thread, the profile, your
 * scroll position. Search is a lookup, not a destination, so it belongs over the
 * page rather than instead of it.
 *
 * Not an expanding inline header field, which was the obvious first instinct: the
 * mobile header is ~44px and already carries the wordmark, Share and the avatar, so
 * an inline input leaves ~200px and — the real problem — nowhere to put the recent
 * searches, which are the most useful thing here.
 *
 * Submitting hands off to the existing search page (`/?q=…`, which landing already
 * reads on mount) rather than re-implementing result ranking in a second place.
 * Recent PROFILES skip that and open directly, since the destination is unambiguous.
 */
export function MobileSearchOverlay() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_MOBILE_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MOBILE_SEARCH_EVENT, onOpen);
  }, []);

  // Read recents on OPEN, not on mount — they change as the user searches
  // elsewhere, and a stale snapshot would show yesterday's list.
  useEffect(() => {
    if (!open) return;
    setRecents(getRecentItems());
    setQ("");
    // Focus after paint so iOS actually raises the keyboard.
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  // Escape closes; body scroll locks so the page behind doesn't move under the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const submit = (value: string) => {
    const term = value.trim();
    if (!term) return;
    pushRecentQuery(term);
    setOpen(false);
    navigate(`/?q=${encodeURIComponent(term)}`);
  };

  const openProfile = (item: Extract<RecentItem, { type: "profile" }>) => {
    setOpen(false);
    navigate(`/p/${item.npub}`);
  };

  const drop = (item: RecentItem) => setRecents(removeRecentItem(item));
  const clearAll = () => setRecents(clearRecentSearches());

  const visible = useMemo(() => recents.slice(0, 12), [recents]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-slate-950" data-testid="mobile-search-overlay">
      {/* Input row — mirrors the header height it replaces so the transition reads
          as the header expanding rather than a new screen appearing. */}
      <div
        className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.625rem)" }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(q); }}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Search Brainstorm…"
            aria-label="Search Brainstorm"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-accent/50 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
            data-testid="mobile-search-input"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          data-testid="mobile-search-close"
        >
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {visible.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-slate-400 dark:text-slate-500" data-testid="mobile-search-empty">
            Search anyone on Nostr — results are ranked by your web of trust.
          </p>
        ) : (
          <>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Recent</span>
              <button
                type="button"
                onClick={clearAll}
                className="rounded text-[11px] font-semibold text-slate-400 transition-colors hover:text-brand-deep dark:hover:text-white"
                data-testid="mobile-search-clear-all"
              >
                Clear all
              </button>
            </div>
            <ul className="space-y-0.5" data-testid="mobile-search-recents">
              {visible.map((item) => (
                <li key={recentKey(item)} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => (item.type === "profile" ? openProfile(item) : submit(item.q))}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                    data-testid={`mobile-search-recent-${item.type}`}
                  >
                    {item.type === "profile" ? (
                      <Avatar className="h-8 w-8 shrink-0 rounded-full border border-slate-200 dark:border-slate-800">
                        {item.picture ? <AvatarImage src={item.picture} alt="" className="object-cover" /> : null}
                        <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
                      </Avatar>
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                        <Clock className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {item.type === "profile" ? item.label : item.q}
                      </span>
                      {item.type === "profile" && item.nip05 && (
                        <span className="block truncate text-xs text-brand-primary dark:text-brand-link">{item.nip05.replace(/^_@/, "")}</span>
                      )}
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => drop(item)}
                    aria-label={`Remove ${item.type === "profile" ? item.label : item.q} from recent searches`}
                    className="shrink-0 rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 dark:text-slate-600 dark:hover:bg-slate-800"
                    data-testid="mobile-search-recent-remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
