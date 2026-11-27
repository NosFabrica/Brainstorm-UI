/**
 * The banners under the identity: your own card's framing, the flagged
 * verdict, or how confident the viewer's network is; and the connections you
 * share with this person.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ChevronDown, Eye, Shield, ShieldAlert, ShieldCheck, ShieldX, UserPlus } from "lucide-react";
import type { ProfileResultData } from "./connectionModel";
import { FollowersIcon, FollowingIcon, SharedConnectionIcon } from "./icons";
import type { confidenceGuidanceFor } from "./tiers";

/** Your own card's framing, else the flagged verdict, else the confidence banner. */
export function ProfileVerdictBanner({
  isOwnProfile,
  houseInfluence01,
  setShareOpen,
  isFlaggedProfile,
  verifiedCounts,
  npubParam,
  confidenceGuidance,
}: {
  isOwnProfile: boolean;
  houseInfluence01: number | null;
  setShareOpen: (open: boolean) => void;
  isFlaggedProfile: boolean;
  verifiedCounts: { reportedBy: number; mutedBy: number };
  npubParam: string;
  confidenceGuidance: ReturnType<typeof confidenceGuidanceFor> | null;
}) {
  const [, navigate] = useLocation();
  return (
    <>
      {isOwnProfile ? (
        <div
          className="mb-4 flex items-start gap-3 rounded-xl border border-brand-primary/20 bg-gradient-to-r from-brand-primary/10 via-brand-primary/10 to-white/40 px-3 py-3 backdrop-blur-sm dark:border-brand-primary/25 dark:bg-brand-primary/10 dark:bg-none sm:px-4"
          data-testid="banner-own-profile"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary/15 dark:bg-brand-primary/15 sm:h-8 sm:w-8">
            <Eye className="h-4 w-4 text-brand-primary" />
          </div>
          <div className="min-w-0 flex-1">
            {/* Was "This is how others see you" / "the score people see",
                          which promises a single universal number. The card shows the
                          HOUSE score — Brainstorm's vantage point, the default before
                          a viewer's own web of trust applies. The old copy even
                          contradicted itself by adding "scores are
                          personalized" one sentence later. */}
            <span className="text-xs font-bold text-brand-primary dark:text-brand-link sm:text-sm">
              This is how Brainstorm sees you
            </span>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 sm:text-xs">
              {houseInfluence01 != null
                ? "Your public score card — the default view before someone's own network applies. Everyone computes their own number for you, and to yourself you always score 100."
                : "Your network is still being scored. The more trusted accounts that connect to you, the stronger your card — invite people so more trusted accounts vouch for you."}
            </p>
            {houseInfluence01 == null && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-primary transition-colors hover:text-brand-primary dark:text-brand-link dark:hover:text-brand-link sm:text-xs"
                data-testid="button-own-profile-invite"
              >
                <UserPlus className="h-3.5 w-3.5" /> Invite friends
              </button>
            )}
          </div>
        </div>
      ) : isFlaggedProfile ? (
        /* Flagged leads — the same verdict the public page and the
                     dashboard's Network Alerts show, so a member who clicks
                     "View" from an alert doesn't land on a profile that looks
                     clean. Worded "your network" here: this is the signed-in,
                     personalized surface (the public page says "the network"). */
        <div
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-3 dark:border-red-500/30 dark:bg-red-500/10 sm:px-4"
          data-testid="banner-profile-flagged"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-500/15 sm:h-8 sm:w-8">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            <span className="text-xs font-bold text-red-700 dark:text-red-300 sm:text-sm">Flagged by your network</span>
            <p className="mt-0.5 text-[11px] text-red-700/90 dark:text-red-300/90 sm:text-xs">
              Reported by {verifiedCounts.reportedBy} verified{" "}
              {verifiedCounts.reportedBy === 1 ? "account" : "accounts"} in your network
              {verifiedCounts.mutedBy > 0 ? ` · muted by ${verifiedCounts.mutedBy}` : ""}.
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => navigate(`/p/${npubParam}/reporters`)}
                className="rounded font-semibold text-red-700 underline underline-offset-2 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 dark:text-red-300 dark:hover:text-red-200"
                data-testid="banner-profile-flagged-who"
              >
                See who reported
              </button>
              <button
                type="button"
                onClick={() => navigate("/what-is-wot")}
                className="rounded font-medium text-red-700/80 underline underline-offset-2 hover:text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 dark:text-red-300/80 dark:hover:text-red-200"
                data-testid="banner-profile-flagged-why"
              >
                Why am I seeing this?
              </button>
            </div>
          </div>
        </div>
      ) : (
        confidenceGuidance && (
          <div
            className={`mb-4 rounded-xl ${confidenceGuidance.bg} border ${confidenceGuidance.border} flex items-start gap-3 px-3 py-3 backdrop-blur-sm sm:px-4`}
            data-testid="banner-confidence-guidance"
          >
            <div
              className={`h-7 w-7 rounded-lg sm:h-8 sm:w-8 ${confidenceGuidance.iconBg} flex shrink-0 items-center justify-center`}
            >
              {confidenceGuidance.icon === "check" && (
                <ShieldCheck className={`h-4 w-4 ${confidenceGuidance.iconColor}`} />
              )}
              {confidenceGuidance.icon === "shield" && <Shield className={`h-4 w-4 ${confidenceGuidance.iconColor}`} />}
              {confidenceGuidance.icon === "alert" && (
                <ShieldAlert className={`h-4 w-4 ${confidenceGuidance.iconColor}`} />
              )}
              {confidenceGuidance.icon === "x" && <ShieldX className={`h-4 w-4 ${confidenceGuidance.iconColor}`} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold sm:text-sm ${confidenceGuidance.color}`}
                  data-testid="text-confidence-label"
                >
                  {confidenceGuidance.label}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${confidenceGuidance.iconBg} ${confidenceGuidance.iconColor}`}
                >
                  {confidenceGuidance.pct}%
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 sm:text-xs">
                {confidenceGuidance.message}
              </p>
            </div>
          </div>
        )
      )}
    </>
  );
}

/** How many of this person's followers and follows are yours too, each list expandable. */
export function SharedConnectionsBanner({
  profileResult,
  selfFollowedByList,
  selfFollowingList,
  sharedFollowerPubkeys,
  sharedFollowingPubkeys,
  followedByQuery,
  followingQuery,
  expandedSections,
  setExpandedSections,
  toggleSection,
  renderExpandedPanel,
}: {
  profileResult: ProfileResultData | null;
  selfFollowedByList: readonly unknown[];
  selfFollowingList: readonly unknown[];
  sharedFollowerPubkeys: string[];
  sharedFollowingPubkeys: string[];
  followedByQuery: { hasNextPage?: boolean };
  followingQuery: { hasNextPage?: boolean };
  expandedSections: Record<string, boolean>;
  setExpandedSections: Dispatch<SetStateAction<Record<string, boolean>>>;
  toggleSection: (key: string) => void;
  renderExpandedPanel: (key: string, pubkeys: string[]) => ReactNode;
}) {
  if (!profileResult || (selfFollowedByList.length === 0 && selfFollowingList.length === 0)) return null;
  const sharedUnique = new Set([...sharedFollowerPubkeys, ...sharedFollowingPubkeys]);
  const sharedCount = sharedUnique.size;
  const mutualFollowersCount = sharedFollowerPubkeys.length;
  const mutualFollowingCount = sharedFollowingPubkeys.length;
  const isExpandable = sharedCount > 0;
  const capHit = followedByQuery.hasNextPage || followingQuery.hasNextPage;
  const isAnyExpanded = expandedSections["shared_followers"] || expandedSections["shared_following"];

  return (
    <div
      className="mb-4 overflow-hidden rounded-xl border border-brand-primary/15 bg-brand-primary/10 dark:border-brand-primary/25 dark:bg-brand-primary/10"
      data-testid="banner-shared-connections"
    >
      <div
        className={`flex items-start gap-3 px-4 py-3 ${isExpandable ? "cursor-pointer transition-colors hover:bg-brand-primary/10 dark:hover:bg-brand-primary/15" : ""}`}
        onClick={
          isExpandable
            ? () => {
                if (isAnyExpanded) {
                  setExpandedSections((prev) => ({
                    ...prev,
                    shared_followers: false,
                    shared_following: false,
                  }));
                } else {
                  toggleSection("shared_followers");
                  if (mutualFollowingCount > 0) {
                    setTimeout(() => toggleSection("shared_following"), 0);
                  }
                }
              }
            : undefined
        }
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-primary/20 bg-brand-primary/15 dark:border-brand-primary/25 dark:bg-brand-primary/15">
          <SharedConnectionIcon className="h-4 w-4 text-brand-primary" />
        </div>
        <div className="min-w-0 flex-1">
          {sharedCount > 0 ? (
            <>
              <p className="text-sm font-semibold text-brand-primary dark:text-brand-link">
                You share {sharedCount.toLocaleString()} connection{sharedCount !== 1 ? "s" : ""} with this person
              </p>
              <p className="mt-0.5 text-xs text-brand-primary dark:text-brand-link">
                {mutualFollowersCount.toLocaleString()} mutual follower
                {mutualFollowersCount !== 1 ? "s" : ""} · {mutualFollowingCount.toLocaleString()} mutual following
              </p>
              {capHit && (
                <p
                  className="mt-1 text-[11px] italic text-brand-primary/60 dark:text-brand-link"
                  data-testid="text-shared-connections-cap-notice"
                >
                  Based on top 200 connections — full overlap may be larger
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-400 dark:text-slate-500">No shared connections</p>
              {capHit && (
                <p
                  className="mt-1 text-[11px] italic text-slate-400/70 dark:text-slate-500/70"
                  data-testid="text-shared-connections-cap-notice"
                >
                  Based on top 200 connections — overlap may exist beyond this sample
                </p>
              )}
            </>
          )}
        </div>
        {isExpandable && (
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-brand-link transition-transform ${isAnyExpanded ? "rotate-180" : ""}`}
          />
        )}
      </div>
      {isAnyExpanded && (
        <div className="border-t border-brand-primary/15 dark:border-brand-primary/25">
          {mutualFollowersCount > 0 && (
            <div>
              <div
                className="flex cursor-pointer items-center justify-between bg-brand-primary/10 px-4 py-2 transition-colors hover:bg-brand-primary/10 dark:bg-brand-primary/[0.06] dark:hover:bg-brand-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection("shared_followers");
                }}
                data-testid="toggle-shared-followers"
              >
                <div className="flex items-center gap-2">
                  <FollowersIcon className="h-3.5 w-3.5 text-brand-link" />
                  <span className="text-xs font-semibold text-brand-primary dark:text-brand-link">
                    Mutual Followers ({mutualFollowersCount.toLocaleString()})
                  </span>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-brand-link transition-transform ${expandedSections["shared_followers"] ? "rotate-180" : ""}`}
                />
              </div>
              {renderExpandedPanel("shared_followers", sharedFollowerPubkeys)}
            </div>
          )}
          {mutualFollowingCount > 0 && (
            <div>
              <div
                className="flex cursor-pointer items-center justify-between border-t border-brand-primary/15 bg-brand-primary/10 px-4 py-2 transition-colors hover:bg-brand-primary/10 dark:border-brand-primary/20 dark:bg-brand-primary/[0.06] dark:hover:bg-brand-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection("shared_following");
                }}
                data-testid="toggle-shared-following"
              >
                <div className="flex items-center gap-2">
                  <FollowingIcon className="h-3.5 w-3.5 text-brand-link" />
                  <span className="text-xs font-semibold text-brand-primary dark:text-brand-link">
                    Mutual Following ({mutualFollowingCount.toLocaleString()})
                  </span>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-brand-link transition-transform ${expandedSections["shared_following"] ? "rotate-180" : ""}`}
                />
              </div>
              {renderExpandedPanel("shared_following", sharedFollowingPubkeys)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
