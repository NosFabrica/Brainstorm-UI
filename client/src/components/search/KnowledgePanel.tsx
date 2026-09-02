/**
 * The Google-anatomy knowledge panel: when a query strongly matches one
 * person, their card anchors the right rail (desktop) or tops the results
 * (mobile) — avatar with tier ring, identity rows, and the deep-dive CTA.
 * Probed via the same relay typeahead the box uses; silent unless confident.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin, useTierRing, TierWordChip } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { suggestProfiles, type SearchPov } from "@/services/search";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Exact name match always; prefix only once the query has some substance. */
export function isStrongMatch(query: string, person: SearchResult): boolean {
  const q = norm(query);
  if (q.length < 2) return false;
  const names = [person.name, person.displayName].filter(Boolean).map((n) => norm(n as string));
  return names.some((n) => n === q || (q.length >= 3 && n.startsWith(q)));
}

/** Plain words only — a query carrying syntax tokens or a #tag is a search,
 *  not a person lookup, and gets no probe at all. */
export function isPanelableQuery(query: string): boolean {
  const q = query.trim();
  return q.length >= 2 && !/(^|\s)#/.test(q) && !/\S+:\S+/.test(q);
}

export function KnowledgePanel({
  query,
  pov,
  userPubkey,
  onOpen,
  className = "",
}: {
  query: string;
  pov: SearchPov;
  userPubkey?: string;
  onOpen?: (person: SearchResult) => void;
  className?: string;
}) {
  const tierRing = useTierRing();
  const [person, setPerson] = useState<SearchResult | null>(null);

  useEffect(() => {
    setPerson(null);
    if (!isPanelableQuery(query)) return;
    let alive = true;
    void suggestProfiles(query, { pov, userPubkey }, { limit: 3 }).then((people) => {
      if (!alive) return;
      const top = people[0];
      if (top && isStrongMatch(query, top)) setPerson(top);
    });
    return () => {
      alive = false;
    };
  }, [query, pov, userPubkey]);

  // Relay hits carry no rank numbers (order-only wire) — the panel's ring,
  // coin and tier word feed from the shared author-score cache like every card.
  const scoreOf = useAuthorScores(person && person.wotRank == null ? [person.pubkey] : []);
  if (!person) return null;
  const effectiveRank = person.wotRank ?? scoreOf(person.pubkey) ?? null;
  const followers = person.wotFollowers;
  return (
    <aside
      className={`w-full rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5 ${className}`}
      data-testid="search-knowledge-panel"
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className={`h-14 w-14 border-2 border-slate-200/80 dark:border-slate-800/80 ${tierRing(effectiveRank) ?? ""}`}>
            {person.picture ? <AvatarImage src={person.picture} alt="" className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
          {effectiveRank != null && (
            <VerificationCoin
              score01={effectiveRank}
              pov={pov === "mywot" ? "personalized" : "global"}
              size={22}
              className="absolute -bottom-1 -right-1"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            {getDisplayLabel(person)}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <TierWordChip score01={effectiveRank} />
            {followers != null && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                <Users className="h-2.5 w-2.5" /> {followers.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
      {person.nip05 && (
        <p className="mt-2.5 flex items-center gap-1 truncate text-xs text-brand-primary dark:text-brand-link">
          <Check className="h-3 w-3 shrink-0" /> {person.nip05.replace(/^_@/, "")}
        </p>
      )}
      {person.about && (
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300 break-words line-clamp-4">
          {person.about}
        </p>
      )}
      <Link
        href={`/p/${person.npub}`}
        onClick={() => onOpen?.(person)}
        className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
        data-testid="knowledge-panel-profile"
      >
        Full profile & trust deep-dive <ArrowRight className="h-3 w-3" />
      </Link>
    </aside>
  );
}
