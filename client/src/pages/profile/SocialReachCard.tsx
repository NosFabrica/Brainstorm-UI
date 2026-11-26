/**
 * "Social Reach": followers, following and mutuals (each expandable to its
 * list), the influence score, and the audience-quality bar over the followers'
 * tiers.
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { toPubkeys } from "@/services/graphHelpers";
import type { ProfileResultData, SectionKey } from "./connectionModel";
import { FollowersIcon, FollowingIcon, MutualIcon } from "./icons";
import { TIER_DISPLAY_CONFIG } from "./tiers";

export function SocialReachCard({
  profileResult,
  ovCounts,
  verifiedCounts,
  mutualPubkeys,
  isOwnProfile,
  houseInfluence01,
  followerTierBreakdown,
  expandedSections,
  toggleSection,
  renderExpandedPanel,
  renderTierBadges,
}: {
  profileResult: ProfileResultData;
  ovCounts: Partial<Record<SectionKey, number>> | undefined;
  verifiedCounts: { loaded: boolean; followers: number; following: number };
  mutualPubkeys: string[];
  isOwnProfile: boolean;
  houseInfluence01: number | null;
  followerTierBreakdown: { counts: Record<string, number>; total: number } | null;
  expandedSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
  renderExpandedPanel: (key: string, pubkeys: string[]) => ReactNode;
  renderTierBadges: (sectionKey: string) => ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-900 dark:shadow-none">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900 sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
          <h4
            className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300 sm:text-xs"
            data-testid="header-social-reach"
          >
            Social Reach
          </h4>
        </div>
        <span className="hidden font-mono text-[10px] text-slate-400 dark:text-slate-500 sm:inline sm:text-xs">
          Network Position
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {profileResult.followed_by !== undefined &&
          (() => {
            const fbValue = profileResult.followed_by;
            const fbArray = Array.isArray(fbValue) ? fbValue : null;
            const fbCount = ovCounts?.followed_by ?? (fbArray ? toPubkeys(fbArray).length : (fbValue as number) || 0);
            const fbExpandable = fbCount > 0;
            return (
              <div>
                <div
                  className={`group flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3.5 ${fbExpandable ? "cursor-pointer transition-all duration-200 hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06]" : ""}`}
                  onClick={fbExpandable ? () => toggleSection("followed_by") : undefined}
                  data-testid="metric-profile-followers"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 dark:border-blue-500/25 dark:bg-blue-500/10 sm:h-8 sm:w-8">
                      <FollowersIcon className="h-3.5 w-3.5 text-blue-500 sm:h-4 sm:w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
                        {verifiedCounts.loaded ? "Verified Followers" : "Followers"}
                      </p>
                      <p className="hidden text-[10px] leading-tight text-slate-400 dark:text-slate-500 sm:block sm:text-xs">
                        People following this account
                      </p>
                      {renderTierBadges("followed_by")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p
                        className="font-mono text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                        data-testid="text-profile-followers"
                      >
                        {verifiedCounts.loaded ? verifiedCounts.followers.toLocaleString() : fbCount.toLocaleString()}
                      </p>
                      {verifiedCounts.loaded && (
                        <p
                          className="font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500"
                          data-testid="text-verified-followers"
                        >
                          of {fbCount.toLocaleString()} total
                        </p>
                      )}
                    </div>
                    {fbExpandable && (
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${expandedSections["followed_by"] ? "rotate-180" : ""}`}
                      />
                    )}
                  </div>
                </div>
                {fbExpandable && fbArray && renderExpandedPanel("followed_by", toPubkeys(fbArray))}
              </div>
            );
          })()}
        {profileResult.following !== undefined &&
          (() => {
            const fgValue = profileResult.following;
            const fgArray = Array.isArray(fgValue) ? fgValue : null;
            const fgCount = ovCounts?.following ?? (fgArray ? toPubkeys(fgArray).length : (fgValue as number) || 0);
            const fgExpandable = fgCount > 0;
            return (
              <div>
                <div
                  className={`group flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3.5 ${fgExpandable ? "cursor-pointer transition-all duration-200 hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06]" : ""}`}
                  onClick={fgExpandable ? () => toggleSection("following") : undefined}
                  data-testid="metric-profile-following"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 dark:border-blue-500/25 dark:bg-blue-500/10 sm:h-8 sm:w-8">
                      <FollowingIcon className="h-3.5 w-3.5 text-blue-500 sm:h-4 sm:w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
                        {verifiedCounts.loaded ? "Verified Following" : "Following"}
                      </p>
                      <p className="hidden text-[10px] leading-tight text-slate-400 dark:text-slate-500 sm:block sm:text-xs">
                        Accounts this person follows
                      </p>
                      {renderTierBadges("following")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p
                        className="font-mono text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                        data-testid="text-profile-following"
                      >
                        {verifiedCounts.loaded ? verifiedCounts.following.toLocaleString() : fgCount.toLocaleString()}
                      </p>
                      {verifiedCounts.loaded && (
                        <p
                          className="font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500"
                          data-testid="text-verified-following"
                        >
                          of {fgCount.toLocaleString()} total
                        </p>
                      )}
                    </div>
                    {fgExpandable && (
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${expandedSections["following"] ? "rotate-180" : ""}`}
                      />
                    )}
                  </div>
                </div>
                {fgExpandable && fgArray && renderExpandedPanel("following", toPubkeys(fgArray))}
              </div>
            );
          })()}
        {(() => {
          const mtCount = mutualPubkeys.length;
          const mtExpandable = mtCount > 0;
          if (!Array.isArray(profileResult.followed_by) || !Array.isArray(profileResult.following)) return null;
          return (
            <div>
              <div
                className={`group flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3.5 ${mtExpandable ? "cursor-pointer transition-all duration-200 hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06]" : ""}`}
                onClick={mtExpandable ? () => toggleSection("mutual") : undefined}
                data-testid="metric-profile-mutual"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-teal-100 bg-teal-50 dark:border-teal-500/25 dark:bg-teal-500/10 sm:h-8 sm:w-8">
                    <MutualIcon className="h-3.5 w-3.5 text-teal-500 sm:h-4 sm:w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">Mutual</p>
                    <p className="hidden text-[10px] leading-tight text-slate-400 dark:text-slate-500 sm:block sm:text-xs">
                      Follow each other mutually
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p
                    className="font-mono text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                    data-testid="text-profile-mutual"
                  >
                    {mtCount.toLocaleString()}
                  </p>
                  {mtExpandable && (
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform dark:text-slate-500 ${expandedSections["mutual"] ? "rotate-180" : ""}`}
                    />
                  )}
                </div>
              </div>
              {mtExpandable && renderExpandedPanel("mutual", mutualPubkeys)}
            </div>
          );
        })()}
        {(() => {
          if (profileResult.influence === undefined) return null;
          // Own profile shows the NETWORK influence (Brainstorm's
          // vantage point), not the self-POV 1.00. Null = not yet scored →
          // skip the row (the banner already explains).
          const inf = isOwnProfile
            ? houseInfluence01
            : typeof profileResult.influence === "number"
              ? profileResult.influence
              : null;
          if (isOwnProfile && inf == null) return null;
          const infNum = typeof inf === "number" ? inf : 0;
          return (
            <div
              className="group flex cursor-help items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3.5"
              title="Score from 0-1 based on social graph position. Higher means more connected to well-connected people."
              data-testid="metric-profile-influence"
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-brand-primary/15 bg-brand-primary/10 dark:border-brand-primary/25 dark:bg-brand-primary/10 sm:h-8 sm:w-8">
                  <BrainLogo size={14} className="text-brand-primary sm:hidden" />
                  <BrainLogo size={16} className="hidden text-brand-primary sm:block" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">Influence</p>
                  <p className="hidden text-[10px] leading-tight text-slate-400 dark:text-slate-500 sm:block sm:text-xs">
                    Network influence rating (0-1)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-2.5">
                <div className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 sm:w-16">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary"
                    style={{ width: `${Math.min(infNum * 100, 100)}%` }}
                  />
                </div>
                <p
                  className="font-mono text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                  data-testid="text-profile-influence"
                >
                  {typeof inf === "number" ? inf.toFixed(2) : "—"}
                </p>
              </div>
            </div>
          );
        })()}
        {followerTierBreakdown && followerTierBreakdown.total > 0 && (
          <div
            className="bg-slate-50/30 px-3 py-3 dark:bg-slate-900/30 sm:px-4 sm:py-4"
            data-testid="card-audience-quality"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-brand-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 sm:text-[11px]">
                  Audience Quality
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                {followerTierBreakdown.total.toLocaleString()} followers
              </span>
            </div>
            <div
              className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              data-testid="bar-audience-quality"
            >
              {TIER_DISPLAY_CONFIG.map((tier) => {
                const count = followerTierBreakdown.counts[tier.key] || 0;
                if (count === 0) return null;
                const widthPct = (count / followerTierBreakdown.total) * 100;
                return (
                  <div
                    key={tier.key}
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: tier.color,
                      minWidth: widthPct > 0 ? "2px" : "0",
                    }}
                    title={`${tier.name}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {TIER_DISPLAY_CONFIG.map((tier) => {
                const count = followerTierBreakdown.counts[tier.key] || 0;
                if (count === 0) return null;
                return (
                  <div key={tier.key} className="flex items-center gap-1.5" data-testid={`legend-tier-${tier.key}`}>
                    <div className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: tier.color }} />
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{tier.name}</span>
                    <span className="font-mono text-[10px] font-bold text-slate-900 dark:text-slate-100">
                      {count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
