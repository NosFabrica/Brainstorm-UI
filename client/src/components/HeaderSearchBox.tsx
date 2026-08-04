import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrainLogo } from "@/components/BrainLogo";
import { searchByText, isLikelyNpub, isHexPubkey, isNip05Handle, type SearchResult } from "@/lib/profileSearch";
import { npubFromPubkey } from "@/lib/shareId";
import { initialsFor } from "@/lib/profileDefaults";
import { parseTopicQuery, topicPath } from "@/lib/topicQuery";
import { TopicSuggestionRow } from "@/components/search/TopicSuggestionRow";
import { getCurrentUser } from "@/services/nostr";
import { useActivePov } from "@/hooks/useActivePov";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";

/**
 * Desktop header search with live, debounced typeahead (mirrors the landing box,
 * reusing the same `searchByText` service). Picking a suggestion jumps straight
 * to that profile; submitting free text routes to the home results surface
 * (`/?q=`). Rendered inline in PublicPageHeader on ≥sm; mobile uses the icon.
 */
export function HeaderSearchBox({
  className = "",
  placeholder = "Search Brainstorm",
  /** Where picking a profile navigates. Default = public share page. The
   *  dashboard "Investigate" box overrides this to the deep-dive `/profile`. */
  profileHref = (npub: string) => `/p/${npub}`,
  /** When true, submitting a direct identifier (npub / hex) jumps straight to
   *  `profileHref` instead of the `/?q=` results surface. */
  resolveDirect = false,
}: {
  className?: string;
  placeholder?: string;
  profileHref?: (npub: string) => string;
  resolveDirect?: boolean;
}) {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<number>();
  const reqId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search from the viewer's ACTIVE perspective — the same rule the landing box
  // uses — so header suggestions rank identically to the home results. Use the
  // personalized Web of Trust only when the viewer turned "My perspective" on
  // AND is eligible (has a personalized graph + is permitted to be their own
  // search observer); otherwise fall back to the house ("nosfabrica") view.
  const [pov] = useActivePov();
  const { hasMywot } = useHasMywot();
  const { isSearchObserver } = useIsSearchObserver();
  const effectivePov = pov === "mywot" && hasMywot && isSearchObserver ? "mywot" : "nosfabrica";
  const observerPubkey = getCurrentUser()?.pubkey;

  // Live suggestions, debounced. A request token is bumped every keystroke so a
  // slow earlier response can't overwrite newer results. Direct identifiers
  // (npub / hex / nip05) skip suggestions — they resolve on submit.
  const schedule = useCallback((value: string) => {
    window.clearTimeout(timer.current);
    const id = ++reqId.current;
    const query = value.trim();
    // A `#topic` query resolves to the trust-ranked content feed, not profiles —
    // keep the dropdown open (for the topic row) but skip the profile search.
    if (parseTopicQuery(value).isTopic) {
      setSuggestions([]); setLoading(false); setOpen(true); return;
    }
    if (query.length < 2 || isLikelyNpub(query) || isHexPubkey(query) || isNip05Handle(query)) {
      setSuggestions([]); setOpen(false); setLoading(false); return;
    }
    setLoading(true); setOpen(true);
    timer.current = window.setTimeout(async () => {
      try {
        const { results } = await searchByText(query, effectivePov, observerPubkey, 10);
        if (reqId.current !== id) return;
        setSuggestions(results.slice(0, 7)); setActive(-1); setOpen(true);
      } catch {
        if (reqId.current !== id) return;
        setSuggestions([]);
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 120);
  }, [effectivePov, observerPubkey]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const nameOf = (r: SearchResult) => r.displayName || r.name || `${r.npub.slice(0, 12)}…`;

  const goProfile = (r: SearchResult) => {
    setOpen(false);
    setActive(-1);
    navigate(profileHref(r.npub));
  };

  const goTopic = (tag: string) => {
    if (!tag) return;
    setOpen(false);
    navigate(topicPath(tag));
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const topic = parseTopicQuery(q);
    if (topic.isTopic) { goTopic(topic.tag); return; }
    if (active >= 0 && suggestions[active]) { goProfile(suggestions[active]); return; }
    const query = q.trim();
    if (!query) return;
    setOpen(false);
    // Investigate box: a pasted npub/hex jumps straight to the deep-dive profile.
    if (resolveDirect) {
      if (isLikelyNpub(query)) { navigate(profileHref(query)); return; }
      if (isHexPubkey(query)) { try { navigate(profileHref(npubFromPubkey(query))); return; } catch { /* fall through */ } }
    }
    navigate(`/?q=${encodeURIComponent(query)}`);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); setActive(-1); return; }
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
  };

  const topic = parseTopicQuery(q);

  return (
    <div ref={containerRef} className={`relative ${className}`} data-testid="header-search">
      <form onSubmit={submit} role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); schedule(e.target.value); }}
            onFocus={() => { if (suggestions.length) setOpen(true); }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            autoComplete="off"
            className="w-full rounded-full border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 py-2 pl-9 pr-9 text-sm text-slate-900 dark:text-slate-100 transition placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            data-testid="header-search-input"
          />
          {q && (
            <button
              type="button"
              onClick={() => { setQ(""); schedule(""); setOpen(false); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
              data-testid="header-search-clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
      {open && (topic.isTopic || loading || suggestions.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/10" role="listbox" data-testid="header-search-suggestions">
          {topic.isTopic ? (
            <TopicSuggestionRow tag={topic.tag} active onSelect={() => goTopic(topic.tag)} testId="header-search-topic" />
          ) : loading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400 dark:text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : (
            suggestions.map((r, i) => (
              <button
                key={r.pubkey}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => goProfile(r)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${i === active ? "bg-slate-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                data-testid={`header-search-opt-${i}`}
              >
                <Avatar className="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-800">
                  {r.picture ? <AvatarImage src={r.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="bg-brand-primary/10 text-[11px] font-bold text-brand-primary">{initialsFor(nameOf(r))}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{nameOf(r)}</p>
                  {r.nip05 && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.nip05}</p>}
                </div>
                {r.wotRank != null && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-brand-primary/15 dark:border-white/15 bg-brand-primary/10 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-primary dark:text-slate-100"
                    data-testid={`header-search-rank-${i}`}
                  >
                    <BrainLogo mono size={10} className="shrink-0" />
                    {r.wotRank}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
