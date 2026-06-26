import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import { Loader2, ArrowRight, Search as SearchIcon, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrainLogo } from "@/components/BrainLogo";
import { PersonRow, type PersonLite } from "@/components/PersonRow";
import { SUGGESTED_ACCOUNTS } from "@/lib/suggestedAccounts";
import { getCurrentUser, fetchProfileMap, triggerScoringAndAnchor, SEED_FOLLOW_HEX } from "@/services/nostr";
import { followPubkeys } from "@/services/socialActions";
import { searchByText, type SearchResult } from "@/lib/profileSearch";
import { initialsFor } from "@/lib/profileDefaults";
import { useToast } from "@/hooks/use-toast";

function readInviterHex(): string {
  try {
    const hex = sessionStorage.getItem("brainstorm_pending_invite_hex");
    if (hex && /^[0-9a-f]{64}$/i.test(hex)) return hex.toLowerCase();
    const npub = sessionStorage.getItem("brainstorm_pending_invite");
    if (npub) {
      const d = nip19.decode(npub);
      if (d.type === "npub") return (d.data as string).toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Post-signup "Build your network" — the primary activation step. New users pick
 * accounts to follow (NosFabrica preselected + their inviter + friend search),
 * then we publish ONE kind-3 and kick off their Web-of-Trust scoring. Replaces
 * the old silent auto-follow.
 */
export default function WelcomePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = getCurrentUser();

  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const inviterHex = useMemo(readInviterHex, []);

  // Suggested follows: NosFabrica + the inviter are preselected (low friction so
  // scoring can run); the rest are offered, off by default — the user chooses.
  const curated = useMemo(() => {
    const seen = new Set<string>();
    const list: { pubkey: string; fallbackName: string; preselect: boolean }[] = [];
    const add = (pubkey: string, fallbackName: string, preselect: boolean) => {
      if (!pubkey || seen.has(pubkey)) return;
      seen.add(pubkey);
      list.push({ pubkey, fallbackName, preselect });
    };
    add(SEED_FOLLOW_HEX, "NosFabrica", true);
    if (inviterHex && inviterHex !== SEED_FOLLOW_HEX) add(inviterHex, "Who invited you", true);
    for (const s of SUGGESTED_ACCOUNTS) add(s.pubkey, s.name, false);
    return list;
  }, [inviterHex]);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(curated.filter((c) => c.preselect).map((c) => c.pubkey)),
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  const profilesQuery = useQuery({
    queryKey: ["welcome-curated", curated.map((c) => c.pubkey).join(",")],
    queryFn: () => fetchProfileMap(curated.map((c) => c.pubkey)),
    enabled: curated.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const curatedPeople: PersonLite[] = useMemo(() => {
    const map = profilesQuery.data;
    return curated.map((c) => {
      const p = map?.get(c.pubkey);
      return {
        pubkey: c.pubkey,
        name: p?.display_name || p?.name || c.fallbackName,
        nip05: p?.nip05,
        picture: p?.picture,
      };
    });
  }, [curated, profilesQuery.data]);

  // Remember profile info for everyone we've shown (suggested + every search
  // result), so the "Selected" basket can render avatars/names even after the
  // search box is cleared or a new query replaces the results.
  const [peopleInfo, setPeopleInfo] = useState<Map<string, PersonLite>>(() => new Map());
  useEffect(() => {
    setPeopleInfo((prev) => {
      const next = new Map(prev);
      for (const p of curatedPeople) next.set(p.pubkey, p);
      for (const r of results) next.set(r.pubkey, { pubkey: r.pubkey, name: r.displayName || r.name, nip05: r.nip05, picture: r.picture });
      return next;
    });
  }, [curatedPeople, results]);

  const selectedPeople = useMemo(
    () => Array.from(selected).map((pk) => peopleInfo.get(pk) ?? { pubkey: pk }),
    [selected, peopleInfo],
  );

  // Collapse the suggestions to the preselected accounts + the top 2 (jack, Lyn
  // Alden) so the step stays scannable; "Show more" reveals the rest.
  const preselectCount = curated.filter((c) => c.preselect).length;
  const visiblePeople = showAllSuggestions ? curatedPeople : curatedPeople.slice(0, preselectCount + 2);
  const hiddenCount = curatedPeople.length - visiblePeople.length;

  const toggle = (pk: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });

  // Live, debounced search — results drop in below the field as the user types
  // (like the main search page). < 2 chars clears.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { results: r } = await searchByText(q, "nosfabrica", undefined, 12);
        if (!cancelled) { setResults(r); setSearched(true); }
      } catch {
        if (!cancelled) { setResults([]); setSearched(true); }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  // Don't make the user wait on the relay publish + scoring round-trips. Navigate
  // to the search home IMMEDIATELY, then publish the follow list and trigger
  // scoring in the background. The global ScoringStatusBar keeps the "calculating"
  // state visible after this page unmounts; the toast/chip are app-wide so they
  // still render. (When the dev's "calculate with follow list" API lands, swap the
  // background trigger to pass `pks` directly so scoring doesn't wait on relay
  // propagation.)
  // If they reached onboarding via a value gate (e.g. the "build your WoT to
  // filter this thread" nudge with ?next=/e/…), return them there afterward.
  const returnPath = (() => {
    try {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" && n !== "/welcome") return n;
    } catch { /* ignore */ }
    return "/";
  })();

  const finish = () => {
    const pks = Array.from(selected);
    if (!pks.length) return;
    const u = getCurrentUser();
    // Stamp the calc marker now so the global chip shows "Calculating…" instantly,
    // before the (slower) relay publish completes.
    if (u?.pubkey) { try { localStorage.setItem(`brainstorm_calc_triggered_at:${u.pubkey}`, String(Date.now())); } catch {} }
    toast({ title: "You're all set!", description: "Your trust network is calculating — explore and finish setting up in the meantime." });
    navigate(returnPath, { replace: true });
    void (async () => {
      try {
        const res = await followPubkeys(pks);
        if (!res.success) {
          toast({ variant: "destructive", title: "Couldn't save your follows", description: res.error || "Try again from your dashboard." });
          return;
        }
        if (u?.pubkey) await triggerScoringAndAnchor(u.pubkey);
      } catch {
        /* the status chip + dashboard reflect the outcome */
      }
    })();
  };

  const count = selected.size;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-xl flex items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-2">
            <BrainLogo size={26} className="text-indigo-500" />
            <span className="text-lg font-bold text-slate-900" style={{ fontFamily: "var(--font-display)" }}>Brainstorm</span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="text-sm font-semibold text-slate-400 hover:text-slate-600"
            data-testid="welcome-skip"
          >
            Skip for now
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2.5 mb-5">
          <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
            Build your network
          </span>
          <div className="h-px w-12 bg-[#7c86ff]/40" />
        </div>
        <h1
          className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-[1.08]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Follow a few accounts <span className="text-[#333286]">to begin</span>.
        </h1>
        <p className="mt-5 text-lg text-slate-600 leading-relaxed">
          Your Web of Trust is built from who you follow. Pick at least one account so Brainstorm can
          calculate your trust scores and personalize your results.
        </p>

        {/* Suggested */}
        {curatedPeople.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Suggested</h2>
            <div className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3">
              {visiblePeople.map((p) => (
                <PersonRow key={p.pubkey} person={p} selected={selected.has(p.pubkey)} onToggle={() => toggle(p.pubkey)} />
              ))}
            </div>
            {(hiddenCount > 0 || showAllSuggestions) && (
              <button
                type="button"
                onClick={() => setShowAllSuggestions((v) => !v)}
                className="mt-2 text-sm font-semibold text-[#3730a3] hover:underline"
                data-testid="welcome-show-more"
              >
                {showAllSuggestions ? "Show fewer" : `Show ${hiddenCount} more`}
              </button>
            )}
          </section>
        )}

        {/* Find people */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Find people you know</h2>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 h-11 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20">
            <SearchIcon className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or nip-05…"
              className="flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 outline-none"
              data-testid="welcome-search-input"
            />
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
            ) : query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="shrink-0 rounded-full p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                data-testid="welcome-search-clear"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {results.length > 0 && (
            <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3 shadow-sm" data-testid="welcome-search-results">
              {results.map((r) => (
                <PersonRow
                  key={r.pubkey}
                  person={{ pubkey: r.pubkey, name: r.displayName || r.name, nip05: r.nip05, picture: r.picture }}
                  selected={selected.has(r.pubkey)}
                  onToggle={() => toggle(r.pubkey)}
                />
              ))}
            </div>
          )}
          {searched && !searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="mt-2 text-sm text-slate-400">No matches — try a different name.</p>
          )}
        </section>

        {/* Sticky footer: your selected set (basket) + the CTA. */}
        <div className="mt-8 sticky bottom-4">
          <div className="rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg p-3">
            {selectedPeople.length > 0 && (
              <div className="mb-2.5" data-testid="welcome-selected">
                <p className="px-1 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Following {selectedPeople.length}
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {selectedPeople.map((p) => {
                    const name = p.name || (p.pubkey ? nip19.npubEncode(p.pubkey).slice(0, 10) + "…" : "Unknown");
                    return (
                      <button
                        key={p.pubkey}
                        type="button"
                        onClick={() => toggle(p.pubkey)}
                        aria-label={`Remove ${name}`}
                        className="group inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 pl-1 pr-2 py-0.5 text-xs hover:border-rose-300 transition-colors"
                        data-testid={`welcome-chip-${p.pubkey.slice(0, 8)}`}
                      >
                        <Avatar className="h-5 w-5 rounded-full bg-white border border-slate-200">
                          {p.picture ? <AvatarImage src={p.picture} alt={name} className="object-cover" /> : null}
                          <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 text-[8px] font-bold">{initialsFor(name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-slate-700 truncate max-w-[90px]">{name}</span>
                        <X className="h-3 w-3 text-slate-400 group-hover:text-rose-500" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={finish}
              disabled={count === 0}
              className="w-full h-12 rounded-xl bg-[#3730a3] hover:bg-[#312e81] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
              data-testid="welcome-finish"
            >
              Follow {count > 0 ? count : ""} &amp; calculate my scores <ArrowRight className="h-4 w-4" />
            </button>
            {count === 0 && <p className="mt-2 text-center text-xs text-slate-400">Select at least one account to continue.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
