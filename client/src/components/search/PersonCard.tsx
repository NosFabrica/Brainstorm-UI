/**
 * One person in the results column — the exact card the home search has
 * always rendered (avatar + tier ring + coin, nip05/lightning/website rows,
 * follower pill, npub copy), extracted from landing.tsx so every vertical
 * shares it.
 */
import { PersonTagChips } from "@/components/search/PersonTagChips";
import type { TagChip } from "@/lib/tagCarrierPeople";
import { Check, Copy, Globe, Users, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import {
  VerificationCoin,
  useTierRing,
  TierWordChip,
  useCoinReplacedByRing,
  useQuietTrustChrome,
} from "@/components/score/VerificationCoin";
import { FlaggedChip, PersonCardSlot } from "@/components/search/EndorsementLine";
import { copyToClipboard } from "@/lib/clipboard";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { useNip05 } from "@/hooks/useNip05";

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
  tags,
  tagEmphasis,
}: {
  result: SearchResult;
  idx: number;
  pov: "nosfabrica" | "mywot";
  onOpen: (result: SearchResult) => void;
  onPrefetchEnter?: (result: SearchResult) => void;
  onPrefetchLeave?: (result: SearchResult) => void;
  /** The "Followed by …" line costs a server call — the top of the page earns it. */
  showFollowedBy?: boolean;
  /** This person's tags — the chips at the card's right edge; undefined while the lookup is out. */
  tags?: readonly TagChip[];
  /** The tags to say loudly (the ones the words matched), by `tagChipId`. */
  tagEmphasis?: ReadonlySet<string>;
}) {
  const tierRing = useTierRing();
  const quiet = useQuietTrustChrome();
  const coinReplaced = useCoinReplacedByRing();
  // The kind-0 nip05 is only a claim: check it, and drop it if the domain names someone else.
  const nip05Status = useNip05(result.nip05, result.pubkey);
  const websiteDisplay = result.website ? result.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  return (
    <div
      role="button"
      tabIndex={0}
      className="group w-full cursor-pointer overflow-hidden rounded-xl border border-slate-100 bg-white/70 text-left transition-all duration-150 hover:border-slate-200 hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 active:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/70 dark:hover:border-slate-800 dark:hover:bg-slate-900 dark:active:bg-slate-800"
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
      <div className="flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="relative shrink-0">
          <Avatar
            className={`h-10 w-10 border-2 border-slate-200/80 dark:border-slate-800/80 sm:h-12 sm:w-12 ${tierRing(result.wotRank) ?? ""}`}
          >
            {result.picture ? (
              <AvatarImage src={result.picture} alt={getDisplayLabel(result)} className="object-cover" />
            ) : null}
            <AvatarFallback className="overflow-hidden">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
          {result.wotRank != null && (
            <VerificationCoin
              score01={result.wotRank}
              pov={pov === "mywot" ? "personalized" : "global"}
              size={22}
              className={
                quiet || (tierRing(result.wotRank) && coinReplaced) ? "sr-only" : "absolute -bottom-1 -right-1"
              }
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-brand-primary dark:text-slate-100"
              data-testid={`text-result-name-${idx}`}
            >
              {getDisplayLabel(result)}
            </span>
            <TierWordChip score01={result.wotRank} />
            <FlaggedChip pubkey={result.pubkey} testId={`person-flagged-${idx}`} />
          </div>
          {result.nip05 && nip05Status !== "invalid" && (
            <p
              className={`mt-0.5 flex items-center gap-0.5 truncate text-xs ${nip05Status === "verified" ? "text-brand-primary dark:text-brand-link" : "text-slate-500 dark:text-slate-400"}`}
              data-testid={`text-nip05-${idx}`}
              data-nip05-status={nip05Status}
            >
              {nip05Status === "verified" && <Check className="h-2.5 w-2.5 shrink-0 text-brand-primary" />}
              {result.nip05.replace(/^_@/, "")}
            </p>
          )}
          {result.lud16 && (
            <p
              className="mt-0.5 flex items-center gap-0.5 truncate text-xs text-slate-500 dark:text-slate-400"
              data-testid={`text-lightning-${idx}`}
            >
              <Zap className="h-2.5 w-2.5 shrink-0 text-slate-400 dark:text-slate-500" />
              {result.lud16}
            </p>
          )}
          {websiteDisplay && (
            <p
              className="mt-0.5 flex items-center gap-0.5 truncate text-xs text-slate-500 dark:text-slate-400"
              data-testid={`text-website-${idx}`}
            >
              <Globe className="h-2.5 w-2.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <a
                href={result.website!.startsWith("http") ? result.website! : `https://${result.website}`}
                target="_blank"
                rel="noopener"
                className="truncate hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {websiteDisplay}
              </a>
            </p>
          )}
          {result.about && (
            <p
              className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 sm:text-xs"
              data-testid={`text-result-about-${idx}`}
            >
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
            {result.wotFollowers != null && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-800/60 dark:bg-slate-800 dark:text-slate-400"
                data-testid={`badge-followers-${idx}`}
              >
                <Users className="h-2.5 w-2.5" />
                {formatFollowers(result.wotFollowers)}
              </span>
            )}
            <span
              className="inline-flex hidden items-center gap-1 font-mono text-[10px] text-slate-300 dark:text-slate-600 sm:inline"
              data-testid={`text-result-npub-${idx}`}
            >
              {result.npub.slice(0, 12)}...
              <button
                type="button"
                aria-label="Copy npub"
                className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 active:bg-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
                data-testid={`button-copy-npub-${idx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(result.npub);
                }}
              >
                <Copy className="h-2.5 w-2.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300" />
              </button>
            </span>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
          {tags && (
            <PersonTagChips
              tags={tags}
              emphasis={tagEmphasis}
              testId={`person-tag-chips-${idx}`}
              className="h-auto flex-wrap"
            />
          )}
          <span className="mt-1 hidden shrink-0 text-[11px] font-medium text-slate-300 transition-colors group-hover:text-brand-primary dark:text-slate-600 sm:inline">
            View →
          </span>
        </div>
      </div>
    </div>
  );
}
