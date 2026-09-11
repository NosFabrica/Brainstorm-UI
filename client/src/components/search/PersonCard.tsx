/**
 * One person in the results column — the exact card the home search has
 * always rendered (avatar + tier ring + coin, nip05/lightning/website rows,
 * follower pill, npub copy), extracted from landing.tsx so every vertical
 * shares it.
 */
import { Check, Copy, Globe, Users, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin, useTierRing, TierWordChip, useCoinReplacedByRing, useQuietTrustChrome } from "@/components/score/VerificationCoin";
import { FlaggedChip, PersonCardSlot } from "@/components/search/EndorsementLine";
import { copyToClipboard } from "@/lib/clipboard";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";

function truncateAbout(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "...";
}

function formatFollowers(n: number): string {
  return n >= 10000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}K`
      : String(n);
}

export function PersonCard({
  result,
  idx,
  pov,
  onOpen,
  onPrefetchEnter,
  onPrefetchLeave,
  showFollowedBy = false,
}: {
  result: SearchResult;
  idx: number;
  pov: "nosfabrica" | "mywot";
  onOpen: (result: SearchResult) => void;
  onPrefetchEnter?: (result: SearchResult) => void;
  onPrefetchLeave?: (result: SearchResult) => void;
  /** The "Followed by …" line costs a server call — the top of the page earns it. */
  showFollowedBy?: boolean;
}) {
  const tierRing = useTierRing();
  const quiet = useQuietTrustChrome();
  const coinReplaced = useCoinReplacedByRing();
  const websiteDisplay = result.website
    ? result.website.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : null;
  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm active:bg-slate-50 dark:active:bg-slate-800 rounded-xl transition-all duration-150 text-left group cursor-pointer overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      onMouseEnter={() => onPrefetchEnter?.(result)}
      onMouseLeave={() => onPrefetchLeave?.(result)}
      onFocus={() => onPrefetchEnter?.(result)}
      onBlur={() => onPrefetchLeave?.(result)}
      onClick={() => onOpen(result)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(result);
        }
      }}
      data-testid={`result-profile-${idx}`}
    >
      <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4">
        <div className="relative shrink-0">
          <Avatar className={`h-10 w-10 sm:h-12 sm:w-12 border-2 border-slate-200/80 dark:border-slate-800/80 ${tierRing(result.wotRank) ?? ""}`}>
            {result.picture ? <AvatarImage src={result.picture} alt={getDisplayLabel(result)} className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
          {result.wotRank != null && (
            <VerificationCoin
              score01={result.wotRank}
              pov={pov === "mywot" ? "personalized" : "global"}
              size={22}
              className={quiet || (tierRing(result.wotRank) && coinReplaced) ? "sr-only" : "absolute -bottom-1 -right-1"}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-primary transition-colors truncate" data-testid={`text-result-name-${idx}`}>
              {getDisplayLabel(result)}
            </span>
            <TierWordChip score01={result.wotRank} />
            <FlaggedChip pubkey={result.pubkey} testId={`person-flagged-${idx}`} />
          </div>
          {result.nip05 && (
            <p className="text-xs text-brand-primary dark:text-brand-link truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-nip05-${idx}`}>
              <Check className="h-2.5 w-2.5 shrink-0 text-brand-primary" />
              {result.nip05.replace(/^_@/, "")}
            </p>
          )}
          {result.lud16 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-lightning-${idx}`}>
              <Zap className="h-2.5 w-2.5 shrink-0 text-slate-400 dark:text-slate-500" />
              {result.lud16}
            </p>
          )}
          {websiteDisplay && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-0.5" data-testid={`text-website-${idx}`}>
              <Globe className="h-2.5 w-2.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <a
                href={result.website!.startsWith("http") ? result.website! : `https://${result.website}`}
                target="_blank"
                rel="noopener"
                className="hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {websiteDisplay}
              </a>
            </p>
          )}
          {result.about && (
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2" data-testid={`text-result-about-${idx}`}>
              {truncateAbout(result.about)}
            </p>
          )}
          <PersonCardSlot
            pubkey={result.pubkey}
            npub={result.npub}
            personal={pov === "mywot"}
            enabled={showFollowedBy}
            idx={idx}
            className="mt-1.5"
          />
          <div className="flex items-center gap-1.5 sm:gap-2 mt-2 flex-wrap">
            {result.wotFollowers != null && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800/60" data-testid={`badge-followers-${idx}`}>
                <Users className="h-2.5 w-2.5" />
                {formatFollowers(result.wotFollowers)}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-300 dark:text-slate-600 font-mono hidden sm:inline" data-testid={`text-result-npub-${idx}`}>
              {result.npub.slice(0, 12)}...
              <button
                type="button"
                aria-label="Copy npub"
                className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                data-testid={`button-copy-npub-${idx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(result.npub);
                }}
              >
                <Copy className="h-2.5 w-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
              </button>
            </span>
          </div>
        </div>
        <span className="text-[11px] text-slate-300 dark:text-slate-600 group-hover:text-brand-primary transition-colors shrink-0 mt-1 hidden sm:inline font-medium">
          View →
        </span>
      </div>
    </div>
  );
}
