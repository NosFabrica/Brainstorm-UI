import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowRight, Search as SearchIcon, X, Users } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PersonRow, type PersonLite } from "@/components/PersonRow";
import { SUGGESTED_ACCOUNTS } from "@/lib/suggestedAccounts";
import { getCurrentUser, fetchProfileMap, triggerScoringAndAnchor, SEED_FOLLOW_HEX } from "@/services/nostr";
import { followPubkeys } from "@/services/socialActions";
import { searchByText, type SearchResult } from "@/lib/profileSearch";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useToast } from "@/hooks/use-toast";

/**
 * Compact "follow a few accounts → calculate" card for the dashboard's no-follows
 * state. Reuses the same suggested list + PersonRow + follow/scoring primitives as
 * the /welcome onboarding, so a brand-new user can start their Web of Trust without
 * leaving the dashboard. On commit it publishes the follows, triggers GrapeRank,
 * and calls onDone so the dashboard can flip to its "Calculating…" state.
 */
export function FollowToCalculateCard({ onDone, className = "" }: { onDone?: () => void; className?: string }) {
  const { toast } = useToast();

  // NosFabrica is preselected (low friction so scoring can run); the rest are
  // offered, off by default.
  const curated = useMemo(() => {
    const seen = new Set<string>();
    const list: { pubkey: string; fallbackName: string; preselect: boolean }[] = [];
    const add = (pubkey: string, fallbackName: string, preselect: boolean) => {
      if (!pubkey || seen.has(pubkey)) return;
      seen.add(pubkey);
      list.push({ pubkey, fallbackName, preselect });
    };
    add(SEED_FOLLOW_HEX, "NosFabrica", true);
    for (const s of SUGGESTED_ACCOUNTS) add(s.pubkey, s.name, false);
    return list;
  }, []);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(curated.filter((c) => c.preselect).map((c) => c.pubkey)));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const profilesQuery = useQuery({
    queryKey: ["follow-card-curated", curated.map((c) => c.pubkey).join(",")],
    queryFn: () => fetchProfileMap(curated.map((c) => c.pubkey)),
    enabled: curated.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const curatedPeople: PersonLite[] = useMemo(() => {
    const map = profilesQuery.data;
    return curated.map((c) => {
      const p = map?.get(c.pubkey);
      return { pubkey: c.pubkey, name: p?.display_name || p?.name || c.fallbackName, nip05: p?.nip05, picture: p?.picture };
    });
  }, [curated, profilesQuery.data]);

  const [peopleInfo, setPeopleInfo] = useState<Map<string, PersonLite>>(() => new Map());
  useEffect(() => {
    setPeopleInfo((prev) => {
      const next = new Map(prev);
      for (const p of curatedPeople) next.set(p.pubkey, p);
      for (const r of results) next.set(r.pubkey, { pubkey: r.pubkey, name: r.displayName || r.name, nip05: r.nip05, picture: r.picture });
      return next;
    });
  }, [curatedPeople, results]);

  const selectedPeople = useMemo(() => Array.from(selected).map((pk) => peopleInfo.get(pk) ?? { pubkey: pk }), [selected, peopleInfo]);
  const preselectCount = curated.filter((c) => c.preselect).length;
  const visiblePeople = showAll ? curatedPeople : curatedPeople.slice(0, preselectCount + 2);
  const hiddenCount = curatedPeople.length - visiblePeople.length;

  const toggle = (pk: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { results: r } = await searchByText(q, "nosfabrica", undefined, 12);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const count = selected.size;

  const commit = async () => {
    const pks = Array.from(selected);
    if (!pks.length || busy) return;
    setBusy(true);
    const res = await followPubkeys(pks);
    if (!res.success) {
      setBusy(false);
      toast({ variant: "destructive", title: "Couldn't save your follows", description: res.error || "Please try again." });
      return;
    }
    const u = getCurrentUser();
    if (u?.pubkey) {
      try { localStorage.setItem(`brainstorm_calc_triggered_at:${u.pubkey}`, String(Date.now())); } catch { /* ignore */ }
      void triggerScoringAndAnchor(u.pubkey);
    }
    toast({ title: "Calculating your trust network", description: "We're scoring your follows — this can take a few minutes." });
    onDone?.();
    // leave `busy` true: the card is about to be replaced by the calculating state.
  };

  return (
    <div className={`rounded-2xl border border-indigo-200/70 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl p-4 sm:p-5 ${className}`} data-testid="dashboard-follow-card">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-4 w-4 text-brand-link" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Follow a few accounts to begin</h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Your Web of Trust is built from who you follow. Pick at least one so we can calculate your scores.</p>

      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {visiblePeople.map((p) => (
          <PersonRow key={p.pubkey} person={p} selected={selected.has(p.pubkey)} onToggle={() => toggle(p.pubkey)} />
        ))}
      </div>
      {!showAll && hiddenCount > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-1 text-xs font-semibold text-brand-link hover:underline" data-testid="follow-card-show-more">
          Show {hiddenCount} more
        </button>
      )}

      {/* Search */}
      <div className="relative mt-3">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or nip-05…"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-9 h-10 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
          data-testid="follow-card-search"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />}
      </div>
      {results.length > 0 && (
        <div className="mt-1 divide-y divide-slate-100 dark:divide-slate-800/60">
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

      {/* Selected tray + commit */}
      <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
        <p className="text-[10px] font-bold tracking-[0.12em] text-slate-400 dark:text-slate-500 uppercase mb-2">Following {count}</p>
        {count > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedPeople.slice(0, 8).map((p) => {
              const name = p.name || p.pubkey.slice(0, 8) + "…";
              return (
                <button
                  key={p.pubkey}
                  type="button"
                  onClick={() => toggle(p.pubkey)}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 pl-1 pr-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <Avatar className="h-4 w-4 rounded-full">
                    {p.picture ? <AvatarImage src={p.picture} alt={name} className="object-cover" /> : null}
                    <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
                  </Avatar>
                  {name} <X className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                </button>
              );
            })}
            {selectedPeople.length > 8 && <span className="text-xs text-slate-400 dark:text-slate-500 self-center">+{selectedPeople.length - 8}</span>}
          </div>
        )}
        <button
          type="button"
          onClick={commit}
          disabled={count === 0 || busy}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed h-11 text-sm font-semibold text-white transition-colors"
          data-testid="follow-card-commit"
        >
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : <>Follow {count > 0 ? count : ""} &amp; calculate my scores <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  );
}
