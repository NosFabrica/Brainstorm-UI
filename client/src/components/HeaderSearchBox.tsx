import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Search, Loader2, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { VerificationCoin, useTierRing , useCoinReplacedByRing } from "@/components/score/VerificationCoin";
import { searchByText, isLikelyNpub, isHexPubkey, isNip05Handle, typeaheadPause, type SearchResult } from "@/lib/profileSearch";
import { useConnectionSpeed } from "@/lib/connection";
import { npubFromPubkey } from "@/lib/shareId";
import { initialsFor } from "@/lib/profileDefaults";
import { parseTopicQuery, topicPath } from "@/lib/topicQuery";
import { TopicSuggestionRow } from "@/components/search/TopicSuggestionRow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useActivePerspective } from "@/hooks/useActivePerspective";
import { TagSuggestionRow, tagSuggestionPath } from "@/components/search/TagSuggestionRow";
import { useTagMatches } from "@/hooks/useTags";
import type { TagSummary } from "@/services/tags";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";
import { typeaheadWords } from "@/lib/searchSyntax";
import { suggestListings, type SearchHit } from "@/services/search";
import { ListingSuggestionRow } from "@/components/search/ListingSuggestionRow";
import { eventPath } from "@/lib/shareId";
import { PersonContentChips } from "@/components/search/PersonContentChips";
import { IntentSuggestionRow } from "@/components/search/IntentSuggestionRow";
import { intentTarget, searchIntent } from "@/lib/personContent";
import { scopedSearchHref } from "@/lib/searchSyntax";
import { usePersonContent } from "@/hooks/usePersonContent";
import { SearchField } from "@/components/search/SearchField";
import type { SearchFieldHandle } from "@/lib/searchFieldDom";
import { SEARCH_BOX_CLASS, SEARCH_CLEAR_CLASS, SEARCH_ICON_CLASS, SEARCH_PLACEHOLDER_CLASS } from "@/components/search/searchBoxChrome";

/**
 * Desktop header search with live, debounced typeahead (mirrors the landing box,
 * reusing the same `searchByText` service). Picking a suggestion jumps straight
 * to that profile; submitting free text routes to the home results surface
 * (`/?q=`). Rendered inline in PublicPageHeader on ≥sm; mobile uses the icon.
 *
 * The box is the home page's own: the same `SearchField` (filters draw as pills,
 * `since:`/`group:` open their pickers) in the same shell (`searchBoxChrome`), so
 * a query looks the same typed here as on the results page it lands on.
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
  const tierRing = useTierRing();
  const coinReplaced = useCoinReplacedByRing();
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  // Product titles under the people — straight to the listing.
  const [products, setProducts] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  // What each suggested person publishes — chips on their row, one tap to it.
  const personContent = usePersonContent(useMemo(() => suggestions.map((r) => r.pubkey), [suggestions]));
  const timer = useRef<number>();
  const reqId = useRef(0);
  const request = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<SearchFieldHandle | null>(null);
  // The field's own date / group picker owns the space under the box while it is up.
  const [picking, setPicking] = useState(false);

  // Search from the viewer's ACTIVE perspective — the same rule the landing box
  // uses — so header suggestions rank identically to the home results. Use the
  // personalized Web of Trust only when the viewer turned "My perspective" on
  // AND is eligible (has a personalized graph + is permitted to be their own
  // search observer); otherwise fall back to the house ("nosfabrica") view.
  const speed = useConnectionSpeed();
  const [pov] = useActivePerspective();
  const { hasMywot } = useHasMywot();
  const { isSearchObserver } = useIsSearchObserver();
  const effectivePov = pov === "mywot" && hasMywot && isSearchObserver ? "mywot" : "nosfabrica";
  const observerPubkey = useActiveAccountDisplay()?.pubkey;

  // Live suggestions, debounced. A request token is bumped every keystroke so a
  // slow earlier response can't overwrite newer results. Direct identifiers
  // (npub / hex / nip05) skip suggestions — they resolve on submit.
  const schedule = useCallback((value: string) => {
    window.clearTimeout(timer.current);
    request.current?.abort();
    const id = ++reqId.current;
    const query = value.trim();
    // A `#topic` query resolves to the trust-ranked content feed, not profiles —
    // keep the dropdown open (for the topic row) but skip the profile search.
    if (parseTopicQuery(value).isTopic) {
      setSuggestions([]); setProducts([]); setLoading(false); setOpen(true); return;
    }
    // Filters and half-typed prefixes are not names: `doi:` must not list people called "doi".
    if (query.length < 2 || typeaheadWords(value) === null || isLikelyNpub(query) || isHexPubkey(query) || isNip05Handle(query)) {
      setSuggestions([]); setProducts([]); setOpen(false); setLoading(false); return;
    }
    setLoading(true); setOpen(true);
    timer.current = window.setTimeout(async () => {
      try {
        request.current = new AbortController();
        const signal = request.current.signal;
        void suggestListings(query, { pov: effectivePov, userPubkey: observerPubkey }, { limit: 3, signal }).then((hits) => {
          if (reqId.current !== id) return;
          setProducts(hits);
          if (hits.length) setOpen(true);
        });
        // "staci shop" looks up "staci"; the category word becomes the intent row.
        const { results } = await searchByText(searchIntent(query)?.name ?? query, effectivePov, observerPubkey, 10, signal);
        if (reqId.current !== id) return;
        setSuggestions(results.slice(0, 7)); setActive(-1); setOpen(true);
      } catch {
        if (reqId.current !== id) return;
        setSuggestions([]);
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, typeaheadPause(speed));
  }, [effectivePov, observerPubkey, speed]);

  useEffect(() => () => {
    window.clearTimeout(timer.current);
    request.current?.abort();
  }, []);

  // Closing the box drops the pending and in-flight suggestion alike.
  useEffect(() => {
    if (open) return;
    window.clearTimeout(timer.current);
    reqId.current++;
    request.current?.abort();
  }, [open]);

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

  const goListing = (hit: SearchHit) => {
    setOpen(false);
    navigate(eventPath(hit.event));
  };

  const goTopic = (tag: string) => {
    if (!tag) return;
    setOpen(false);
    navigate(topicPath(tag));
  };

  const goTag = (tag: TagSummary) => {
    const path = tagSuggestionPath(tag, npubFromPubkey);
    if (!path) return;
    setOpen(false);
    navigate(path);
  };

  // `typed` is the field's own value when Enter lands: a soft keyboard's action key edits and
  // submits in one event, before React has re-rendered `q`.
  const submit = (typed: string = q) => {
    const topic = parseTopicQuery(typed);
    if (topic.isTopic) { goTopic(topic.tag); return; }
    if (open && active >= 0 && suggestions[active]) { goProfile(suggestions[active]); return; }
    const query = typed.trim();
    if (!query) return;
    setOpen(false);
    // Investigate box: a pasted npub/hex jumps straight to the deep-dive profile.
    if (resolveDirect) {
      if (isLikelyNpub(query)) { navigate(profileHref(query)); return; }
      if (isHexPubkey(query)) { try { navigate(profileHref(npubFromPubkey(query))); return; } catch { /* fall through */ } }
    }
    navigate(`/?q=${encodeURIComponent(query)}`);
  };

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (e.key === "Escape") { setOpen(false); setActive(-1); return true; }
    if (!open || suggestions.length === 0) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, suggestions.length - 1)); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); return true; }
    return false;
  };

  const topic = parseTopicQuery(q);
  // "staci shop": the person named, if a suggested one has that category — the intent row's target.
  const intent = useMemo(() => intentTarget(searchIntent(q), suggestions, personContent), [q, suggestions, personContent]);
  // `#topic` queries already route to the hashtag feed — don't offer a second answer.
  // Only while the dropdown is open: text left after submit mustn't keep the catalogue live.
  const tagMatches = useTagMatches(topic.isTopic || !open ? "" : q);

  return (
    <div ref={containerRef} className={`relative ${className}`} data-testid="header-search">
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); submit(); }} role="search">
        <div className={SEARCH_BOX_CLASS}>
          <Search className={SEARCH_ICON_CLASS} aria-hidden="true" />
          <SearchField
            className="flex-1"
            inputClassName="py-1"
            fieldRef={(h) => { fieldRef.current = h; }}
            value={q}
            onChange={(next) => { setQ(next); schedule(next); }}
            onEnter={submit}
            onKeyDown={onKeyDown}
            onPickerChange={setPicking}
            onFocus={() => { if (suggestions.length) setOpen(true); }}
            placeholder={<span className={SEARCH_PLACEHOLDER_CLASS}>{placeholder}</span>}
            ariaLabel={placeholder}
            combobox={{
              expanded: open && !picking,
              controls: "header-search-suggestions",
              activeDescendant: open && active >= 0 ? `header-search-opt-${active}` : undefined,
            }}
            testId="header-search-input"
          />
          {q && (
            <button
              type="button"
              onClick={() => { setQ(""); schedule(""); setOpen(false); fieldRef.current?.focus(); }}
              aria-label="Clear search"
              className={SEARCH_CLEAR_CLASS}
              data-testid="header-search-clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
      {open && !picking && (topic.isTopic || loading || suggestions.length > 0 || products.length > 0 || tagMatches.length > 0 || !!intent) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/10" role="listbox" id="header-search-suggestions" data-testid="header-search-suggestions">
          {topic.isTopic ? (
            <TopicSuggestionRow tag={topic.tag} active onSelect={() => goTopic(topic.tag)} testId="header-search-topic" />
          ) : loading && suggestions.length === 0 && products.length === 0 && tagMatches.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400 dark:text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : (
            <>
            {intent && (
              <div className="border-b border-slate-100 dark:border-slate-800/60">
                <IntentSuggestionRow name={nameOf(intent.person as SearchResult)} chip={intent.chip} onSelect={() => { setOpen(false); navigate(scopedSearchHref(intent.person.pubkey, intent.chip.tab)); }} testId="header-search-intent" />
              </div>
            )}
            {tagMatches.length > 0 && (
              <div className="border-b border-slate-100 dark:border-slate-800/60" data-testid="header-search-tags">
                {tagMatches.map((t) => (
                  <TagSuggestionRow
                    key={t.key}
                    tag={t}
                    onSelect={() => goTag(t)}
                    testId="header-search-tag"
                  />
                ))}
              </div>
            )}
            {suggestions.map((r, i) => (
              // A div, not a button: the chips inside are links, and the input keeps focus anyway.
              <div
                key={r.pubkey}
                id={`header-search-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => goProfile(r)}
                className={`group flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors ${i === active ? "bg-slate-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                data-testid={`header-search-opt-${i}`}
              >
                <Avatar className={`h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-800 ${tierRing(r.wotRank) ?? ""}`}>
                  {r.picture ? <AvatarImage src={r.picture} alt="" className="object-cover" /> : null}
                  <AvatarFallback className="bg-brand-primary/10 text-[11px] font-bold text-brand-primary">{initialsFor(nameOf(r))}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{nameOf(r)}</p>
                  {r.nip05 && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.nip05}</p>}
                </div>
                <PersonContentChips
                  pubkey={r.pubkey}
                  name={nameOf(r)}
                  content={personContent.get(r.pubkey)}
                  onNavigate={() => setOpen(false)}
                  linkTabIndex={-1}
                  className="sm:opacity-0 sm:group-hover:opacity-100 sm:group-aria-selected:opacity-100 sm:group-focus-within:opacity-100"
                />
                {/* Same coin as the results page, the profile hero and every
                    people list. It also fixes a scale bug this pill had: it
                    printed `wotRank` raw, which is 0..1, so a 93 would have read
                    "0.93". The coin does the ×100 in one place. */}
                {r.wotRank != null && (
                  <VerificationCoin
                    score01={r.wotRank}
                    pov={effectivePov === "mywot" ? "personalized" : "global"}
                    size={22}
                    className={tierRing(r.wotRank) && coinReplaced ? "sr-only" : "shrink-0"}
                  />
                )}
              </div>
            ))}
            {products.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800/60" data-testid="header-search-products">
                {products.map((h, i) => (
                  <ListingSuggestionRow key={h.event.id} hit={h} onSelect={() => goListing(h)} testId={`header-search-product-${i}`} />
                ))}
              </div>
            )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
