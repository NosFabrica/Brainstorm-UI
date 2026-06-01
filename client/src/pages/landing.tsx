import { useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { Search, ArrowRight, Loader2, Check, X } from "lucide-react";
import { ComputingBackground } from "@/components/ComputingBackground";
import { BrainLogo } from "@/components/BrainLogo";
import { SignInButton } from "@/components/SignInButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getCurrentUser, fetchProfile } from "@/services/nostr";
import { queryClient } from "@/lib/queryClient";
import { apiClient } from "@/services/api";
import { setProfileSeed, setStoredSearchSeed, type ProfileSeed } from "@/lib/profileSeed";
import {
  searchByText,
  getDisplayLabel,
  isLikelyNpub,
  isHexPubkey,
  isNip05Handle,
  type SearchResult,
} from "@/lib/profileSearch";

// Anonymous visitors land here, so the trust perspective is always the
// NosFabrica ("house") POV — logged-in users are redirected to /dashboard.
const LANDING_POV = "nosfabrica" as const;

// Example prompts the empty search box gently cycles through to teach
// visitors what they can search for. The first entry is the static
// fallback (used as-is when the user prefers reduced motion).
const PLACEHOLDER_EXAMPLES = [
  "Search by name, bio, website…",
  'Try "Jack"',
  'Try "Prague"',
  'Try a handle like "odell@primal.net"',
  "Try an npub…",
];

export default function Landing() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [phIndex, setPhIndex] = useState(0);
  const [phVisible, setPhVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const suggestAbortRef = useRef(0);
  const suggestTimerRef = useRef<number | undefined>(undefined);
  const phFadeTimerRef = useRef<number | undefined>(undefined);
  const typedSinceSearchRef = useRef(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (getCurrentUser()) {
      setLocation("/dashboard", { replace: true });
    }
  }, [setLocation]);

  // Honor the OS "reduce motion" setting — those users see a single static
  // placeholder with no cycling.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Gently cycle the empty box's placeholder through example prompts. Runs only
  // while the field is empty and motion is allowed; a soft fade-out/in (300ms)
  // bridges each swap. Pauses the moment the user types (query non-empty).
  useEffect(() => {
    if (prefersReducedMotion || query.length > 0) {
      window.clearTimeout(phFadeTimerRef.current);
      setPhVisible(true);
      return;
    }
    setPhVisible(true);
    const interval = window.setInterval(() => {
      setPhVisible(false);
      phFadeTimerRef.current = window.setTimeout(() => {
        setPhIndex((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
        setPhVisible(true);
      }, 300);
    }, 3200);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(phFadeTimerRef.current);
    };
  }, [prefersReducedMotion, query]);

  // Live, debounced profile suggestions as the user types (Google-style).
  // Skips direct identifiers (npub / hex / NIP-05) since those resolve straight
  // to a profile on submit. A request token is bumped on every keystroke so a
  // slow earlier request can never overwrite newer suggestions.
  const scheduleSuggest = useCallback((value: string) => {
    window.clearTimeout(suggestTimerRef.current);
    const reqId = ++suggestAbortRef.current;
    const q = value.trim();
    if (q.length < 2 || isLikelyNpub(q) || isHexPubkey(q) || isNip05Handle(q)) {
      typedSinceSearchRef.current = false;
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSuggesting(false);
      return;
    }
    typedSinceSearchRef.current = true;
    setIsSuggesting(true);
    setShowSuggestions(true);
    suggestTimerRef.current = window.setTimeout(async () => {
      try {
        const { results } = await searchByText(q, LANDING_POV);
        if (suggestAbortRef.current !== reqId) return;
        setSuggestions(results.slice(0, 7));
        setActiveSuggestion(-1);
        setShowSuggestions(true);
      } catch {
        if (suggestAbortRef.current !== reqId) return;
        setSuggestions([]);
      } finally {
        if (suggestAbortRef.current === reqId) setIsSuggesting(false);
      }
    }, 120);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(suggestTimerRef.current);
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!showSuggestions) return;
    const onDown = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSuggestions]);

  const goToProfile = useCallback((result: SearchResult) => {
    const hex = (result.pubkey || "").toLowerCase();
    if (hex) {
      const seed: ProfileSeed = {
        pubkey: hex,
        npub: result.npub,
        name: result.name,
        displayName: result.displayName,
        picture: result.picture,
        about: result.about,
        nip05: result.nip05,
        banner: result.banner,
        website: result.website,
        lud16: result.lud16,
        wotRank: result.wotRank ?? null,
        wotFollowers: result.wotFollowers ?? null,
        wotRankNosfabrica: result.wotRankNosfabrica ?? null,
        wotRankMywot: result.wotRankMywot ?? null,
        povFromSearch: LANDING_POV,
      };
      setProfileSeed(hex, seed);
      queryClient.prefetchQuery({
        queryKey: ["profile", hex],
        queryFn: async () => {
          const res = await apiClient.getUserByPubkey(hex);
          return res?.data ?? null;
        },
        staleTime: 5 * 60_000,
      }).catch(() => {});
      queryClient.prefetchQuery({
        queryKey: ["nostr-profile", hex],
        queryFn: async () => (await fetchProfile(hex)) ?? null,
        staleTime: 5 * 60_000,
      }).catch(() => {});
    }
    const hasNosfabricaRank =
      typeof result.wotRankNosfabrica === "number" && Number.isFinite(result.wotRankNosfabrica);
    const persistNosfabrica = hasNosfabricaRank && !!hex;
    if (persistNosfabrica) {
      setStoredSearchSeed(hex, {
        pubkey: hex,
        npub: result.npub,
        name: result.name,
        displayName: result.displayName,
        picture: result.picture,
        about: result.about,
        nip05: result.nip05,
        banner: result.banner,
        website: result.website,
        lud16: result.lud16,
        wotRank: result.wotRank ?? null,
        wotFollowers: result.wotFollowers ?? null,
        wotRankNosfabrica: result.wotRankNosfabrica ?? null,
        wotRankMywot: result.wotRankMywot ?? null,
        povFromSearch: LANDING_POV,
      });
    }
    const suffix = persistNosfabrica ? "&showNosfabricaResult=1" : "";
    setLocation(`/profile/${result.npub}?fromSearch=1&pov=${LANDING_POV}${suffix}`);
  }, [setLocation]);

  const cancelSuggest = useCallback(() => {
    window.clearTimeout(suggestTimerRef.current);
    suggestAbortRef.current++;
    typedSinceSearchRef.current = false;
    setShowSuggestions(false);
    setIsSuggesting(false);
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    cancelSuggest();
    const q = query.trim();
    setLocation(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col relative overflow-hidden" data-testid="page-home">
      <ComputingBackground variant="light" />

      <header className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-4">
        <button
          type="button"
          onClick={() => setLocation("/about")}
          className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          data-testid="link-home-about"
        >
          About
        </button>
        <SignInButton
          variant="primary"
          label="Sign in"
          className="rounded-full sm:px-5"
          data-testid="button-home-sign-in"
        />
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 -mt-10 sm:-mt-16">
        <div className="w-full max-w-2xl mx-auto text-center" style={{ animation: "homeFadeUp 0.5s ease-out" }}>
          <style>{`@keyframes homeFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-2 mb-1.5">
              <BrainLogo size={32} className="text-indigo-600" />
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                data-testid="text-home-title"
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800">
                  Brainstorm
                </span>
              </h1>
            </div>
            <p className="text-slate-500 text-sm sm:text-base" data-testid="text-home-subtitle">
              Search across millions of profiles
            </p>
          </div>

          <div ref={searchContainerRef} className="relative">
            <form onSubmit={onSubmit} className="relative group" data-testid="form-home-search">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/0 via-indigo-400/15 to-indigo-500/0 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-5 pr-2 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.08)] focus-within:border-indigo-300 focus-within:shadow-[0_4px_18px_rgba(99,102,241,0.12)] transition-all duration-300">
                <Search className="h-5 w-5 text-slate-400 shrink-0" />
                <div className="relative flex-1 min-w-0">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    scheduleSuggest(e.target.value);
                  }}
                  onFocus={() => {
                    if (typedSinceSearchRef.current && suggestions.length > 0 && query.trim().length >= 2) setShowSuggestions(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" && showSuggestions && suggestions.length > 0) {
                      e.preventDefault();
                      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
                    } else if (e.key === "ArrowUp" && showSuggestions && suggestions.length > 0) {
                      e.preventDefault();
                      setActiveSuggestion((i) => Math.max(i - 1, -1));
                    } else if (e.key === "Enter") {
                      if (showSuggestions && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
                        e.preventDefault();
                        goToProfile(suggestions[activeSuggestion]);
                      }
                      // otherwise let the form submit handler run (full search)
                    } else if (e.key === "Escape") {
                      setShowSuggestions(false);
                      setActiveSuggestion(-1);
                    }
                  }}
                  placeholder=""
                  aria-label="Search profiles"
                  className="w-full bg-transparent text-slate-900 text-base outline-none py-1.5 min-w-0"
                  autoFocus
                  role="combobox"
                  aria-expanded={showSuggestions}
                  aria-controls="home-search-suggestions"
                  aria-autocomplete="list"
                  aria-activedescendant={showSuggestions && activeSuggestion >= 0 ? `home-suggestion-opt-${activeSuggestion}` : undefined}
                  data-testid="input-home-search"
                />
                {query.length === 0 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center overflow-hidden"
                  >
                    <span
                      className={`truncate text-slate-400 text-base transition-opacity duration-300 ${phVisible ? "opacity-100" : "opacity-0"}`}
                      data-testid="text-home-placeholder"
                    >
                      {prefersReducedMotion ? PLACEHOLDER_EXAMPLES[0] : PLACEHOLDER_EXAMPLES[phIndex]}
                    </span>
                  </span>
                )}
                </div>
                {query.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      cancelSuggest();
                      setSuggestions([]);
                      setActiveSuggestion(-1);
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                    data-testid="button-home-clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-full transition-colors active:scale-[0.98] shrink-0"
                  data-testid="button-home-search"
                >
                  <span className="hidden sm:inline">Search</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            {showSuggestions && (suggestions.length > 0 || isSuggesting) && (
              <div
                id="home-search-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden text-left"
                data-testid="container-home-suggestions"
              >
                {isSuggesting && suggestions.length === 0 ? (
                  <div className="px-4 py-3 flex items-center gap-2 text-slate-400 text-xs" data-testid="home-suggestions-loading">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                  </div>
                ) : (
                  <>
                    {suggestions.map((s, i) => {
                      const handle = s.nip05 ? s.nip05.replace(/^_@/, "") : null;
                      return (
                        <button
                          key={s.pubkey}
                          id={`home-suggestion-opt-${i}`}
                          type="button"
                          role="option"
                          aria-selected={i === activeSuggestion}
                          className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left transition-colors ${i === activeSuggestion ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                          onMouseEnter={() => setActiveSuggestion(i)}
                          onClick={() => goToProfile(s)}
                          data-testid={`home-suggestion-${i}`}
                        >
                          <Avatar className="h-8 w-8 border border-slate-200/80 shrink-0">
                            {s.picture ? <AvatarImage src={s.picture} alt={getDisplayLabel(s)} className="object-cover" /> : null}
                            <AvatarFallback className="bg-indigo-50 text-indigo-600 font-bold text-xs">
                              {(s.name || s.displayName || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900 truncate" data-testid={`home-suggestion-name-${i}`}>
                              {getDisplayLabel(s)}
                            </p>
                            {handle && (
                              <p className="text-[11px] text-indigo-600 truncate flex items-center gap-0.5">
                                <Check className="h-2.5 w-2.5 shrink-0 text-indigo-500" />
                                {handle}
                              </p>
                            )}
                          </div>
                          {s.wotRank != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0" data-testid={`home-suggestion-rank-${i}`}>
                              <BrainLogo size={10} className="shrink-0" />
                              {s.wotRank}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 text-left border-t border-slate-100 text-[12px] font-medium transition-colors ${activeSuggestion === -1 ? "bg-slate-50 text-indigo-600" : "text-slate-500 hover:bg-slate-50 hover:text-indigo-600"}`}
                      onMouseEnter={() => setActiveSuggestion(-1)}
                      onClick={() => {
                        cancelSuggest();
                        const q = query.trim();
                        setLocation(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
                      }}
                      data-testid="home-suggestion-see-all"
                    >
                      <Search className="h-3.5 w-3.5 shrink-0" />
                      See all results for "{query.trim()}"
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 mt-5 flex items-center justify-center gap-2" data-testid="text-home-hint">
            <span>Not Personalized</span>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => setLocation("/what-is-wot")}
              className="text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
              data-testid="link-home-learn-more"
            >
              What is this?
            </button>
          </p>
        </div>
      </main>

      <footer className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 text-xs" data-testid="footer-home">
        <a
          href="https://github.com/NosFabrica/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          data-testid="link-home-developers"
        >
          Developers
        </a>
        <button
          type="button"
          onClick={() => setLocation("/how-search-works")}
          className="font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          data-testid="link-home-how-search-works"
        >
          How search works
        </button>
      </footer>
    </div>
  );
}
