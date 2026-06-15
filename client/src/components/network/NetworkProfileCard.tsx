import { useState, useMemo, memo } from "react";
import { nip19 } from "nostr-tools";
import {
  Search as SearchIcon,
  Loader2,
  Copy,
  Check,
  X,
  ChevronRight,
  UserPlus,
  UserCheck,
  UserMinus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BrainLogo } from "@/components/BrainLogo";
import { getVerifiedThreshold } from "@/services/trustThreshold";
import { toPubkeys, toInfluenceMap } from "@/services/graphHelpers";
import {
  detailMetrics,
  metricIcons,
  groups,
  getVerificationGuidance,
  FlaggedIcon,
} from "@/components/network/networkGroups";
import {
  useNetworkCardActions,
  useNetworkCardView,
} from "@/components/network/cardContext";

export interface NetworkProfileCardProps {
  pk: string;
  profile: any | undefined;
  trustScore: number | null | undefined;
  graphData: any | undefined;
  detail: any | undefined;
  stats: Record<string, { verified: number; total: number }> | undefined;
  isExpanded: boolean;
  isCopied: boolean;
  isProfileLoaded: boolean;
  profileAttempted: boolean;
  expandedLoading: boolean;
  isSelf: boolean;
  isFollowingUser: boolean;
  isMutedUser: boolean;
  isFlagged: boolean;
}

export const NetworkProfileCard = memo(function NetworkProfileCard({
  pk,
  profile,
  trustScore,
  graphData,
  detail,
  stats,
  isExpanded,
  isCopied,
  isProfileLoaded,
  profileAttempted,
  expandedLoading,
  isSelf,
  isFollowingUser,
  isMutedUser,
  isFlagged,
}: NetworkProfileCardProps) {
  const {
    trustCacheRef,
    activeGroupRef,
    getPubkeyGroups,
    onToggleExpanded,
    onCopyNpub,
    onCloseDetail,
    onNavigate,
    onFollow,
    onUnfollow,
    onMute,
    onUnmute,
    onPrefetchEnter,
    onPrefetchLeave,
  } = useNetworkCardActions();
  const { viewMode, socialPending, socialListsLoading } = useNetworkCardView();

  const npub = nip19.npubEncode(pk);
  const displayNpub = npub.slice(0, 12) + "..." + npub.slice(-6);
  const displayName = profile?.display_name || profile?.name || displayNpub;
  const pkShort = pk.slice(0, 8);
  const [cardFollowHovered, setCardFollowHovered] = useState(false);
  const [cardActionPending, setCardActionPending] = useState<string | null>(
    null,
  );

  // Derive group membership from the stable `getPubkeyGroups` instead of
  // receiving a freshly-built array each render — that array prop previously
  // defeated React.memo for every card.
  const memberGroups = useMemo(
    () => getPubkeyGroups(pk),
    [getPubkeyGroups, pk],
  );

  const liveFilteredGroups = useMemo(() => {
    if (socialListsLoading) return memberGroups;
    return memberGroups.filter((gk) => {
      if (gk === "following" && !isFollowingUser) return false;
      if (gk === "muting" && !isMutedUser) return false;
      return true;
    });
  }, [memberGroups, socialListsLoading, isFollowingUser, isMutedUser]);

  const getVerifiedFlagCounts = () => {
    if (!graphData) return { verifiedMuters: 0, verifiedReporters: 0 };
    const TA_THRESHOLD = getVerifiedThreshold();
    let verifiedMuters = 0;
    let verifiedReporters = 0;
    for (const muterPk of graphData.muted_by || []) {
      const score = trustCacheRef.current?.get(muterPk);
      if (typeof score === "number" && score >= TA_THRESHOLD) verifiedMuters++;
    }
    for (const reporterPk of graphData.reported_by || []) {
      const score = trustCacheRef.current?.get(reporterPk);
      if (typeof score === "number" && score >= TA_THRESHOLD)
        verifiedReporters++;
    }
    return { verifiedMuters, verifiedReporters };
  };

  const renderVerifiedFlags = () => {
    const { verifiedMuters, verifiedReporters } = getVerifiedFlagCounts();
    if (verifiedMuters === 0 && verifiedReporters === 0) return null;
    return (
      <div
        className="flex items-center gap-1.5 flex-wrap"
        data-testid={`flags-verified-${pkShort}`}
      >
        {verifiedMuters > 0 && (
          <UITooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 cursor-help no-default-hover-elevate no-default-active-elevate"
                data-testid={`badge-verified-muted-${pkShort}`}
              >
                Muted by {verifiedMuters} verified
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="bg-white/95 backdrop-blur-xl border-slate-200 text-slate-700 shadow-xl p-2.5 max-w-[240px]"
            >
              <p className="text-xs leading-relaxed">
                {verifiedMuters} verified{" "}
                {verifiedMuters === 1 ? "user has" : "users have"} muted this
                account. Verified users have a trust assertion score of 0.01 or
                above.
              </p>
            </TooltipContent>
          </UITooltip>
        )}
        {verifiedReporters > 0 && (
          <UITooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200 cursor-help no-default-hover-elevate no-default-active-elevate"
                data-testid={`badge-verified-reported-${pkShort}`}
              >
                Reported by {verifiedReporters} verified
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="bg-white/95 backdrop-blur-xl border-slate-200 text-slate-700 shadow-xl p-2.5 max-w-[240px]"
            >
              <p className="text-xs leading-relaxed">
                {verifiedReporters} verified{" "}
                {verifiedReporters === 1 ? "user has" : "users have"} reported
                this account. Verified users have a trust assertion score of
                0.01 or above.
              </p>
            </TooltipContent>
          </UITooltip>
        )}
      </div>
    );
  };

  const renderTrustBadge = (compact: boolean = false) => {
    if (trustScore === undefined) {
      return (
        <div
          className="flex items-center gap-1"
          data-testid={`trust-loading-${pkShort}`}
        >
          <div
            className={`rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 ${compact ? "w-6 h-6" : "w-8 h-8"}`}
          >
            <Loader2
              className={`text-indigo-300 animate-spin ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`}
            />
          </div>
        </div>
      );
    }
    if (trustScore === null) return null;
    const score = Math.min(1, Math.max(0, trustScore));
    const pct = Math.round(score * 100);
    const ringColor =
      pct >= 50
        ? "stroke-emerald-500"
        : pct >= 20
          ? "stroke-indigo-500"
          : pct >= 7
            ? "stroke-orange-300"
            : "stroke-amber-500";
    const circumference = 2 * Math.PI * 18;
    const offset = circumference - score * circumference;
    const size = compact ? "w-7 h-7" : "w-9 h-9";
    const textSize = compact ? "text-[10px]" : "text-xs";
    const guidance = getVerificationGuidance(pct, displayName);
    return (
      <UITooltip>
        <TooltipTrigger asChild>
          <div
            className="flex flex-col items-center shrink-0 cursor-help"
            data-testid={`badge-trust-${pkShort}`}
          >
            <div
              className={`relative ${size} flex items-center justify-center`}
            >
              <svg
                className="absolute inset-0 w-full h-full -rotate-90"
                viewBox="0 0 44 44"
              >
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-indigo-100"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className={ringColor}
                  style={{
                    strokeDasharray: circumference,
                    strokeDashoffset: offset,
                    transition: "stroke-dashoffset 0.8s ease-out",
                  }}
                />
              </svg>
              <span
                className={`${textSize} font-bold font-mono tabular-nums text-indigo-700`}
              >
                {pct}
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          className="bg-white/95 backdrop-blur-xl border-slate-200 text-slate-700 shadow-xl p-3 max-w-[260px]"
          data-testid={`tooltip-trust-${pkShort}`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-xs text-slate-900">
                Verification Score
              </p>
              <span className={`text-xs font-semibold ${guidance.color}`}>
                {guidance.label}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              {guidance.message}
            </p>
          </div>
        </TooltipContent>
      </UITooltip>
    );
  };

  const renderDetailPanel = () => {
    if (!isExpanded) return null;
    // Seed the panel from data already on the row (graphData arrays from the
    // eager trust-score pass + the trust score itself) so counts and the
    // Influence Score render INSTANTLY on expand, even before the per-user
    // detail fetch lands. Once `detail` arrives it overrides the seed
    // (full counts for followed_by/following/muting/reporting, plus precise
    // influence). Keys not in the seed render an "—" placeholder instead of
    // a misleading "0" until the fetch completes.
    const seedDetail: any | null =
      graphData || trustScore != null
        ? {
            muted_by: graphData?.muted_by ?? [],
            reported_by: graphData?.reported_by ?? [],
            ...(trustScore != null ? { influence: trustScore } : {}),
          }
        : null;
    // Field-level merge: overview supplies totals for every metric, but
    // when the eager pass has already populated array seeds for
    // muted_by/reported_by we keep those arrays so the verified-subset
    // display (which requires per-pubkey influence maps) stays intact.
    // Influence falls back to the row's trustScore if overview omits it.
    const effectiveDetail: any | null = detail
      ? {
          ...detail,
          ...(Array.isArray(graphData?.muted_by)
            ? { muted_by: graphData!.muted_by }
            : {}),
          ...(Array.isArray(graphData?.reported_by)
            ? { reported_by: graphData!.reported_by }
            : {}),
          ...(detail.influence == null && trustScore != null
            ? { influence: trustScore }
            : {}),
        }
      : seedDetail;
    const seededKeys = new Set<string>(
      seedDetail ? Object.keys(seedDetail) : [],
    );
    // We only show an inline refresh spinner; never a full-panel blocker.
    const isRefreshing = expandedLoading && !detail;
    return (
      <div
        className={`bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl rounded-2xl border border-[#7c86ff]/20 shadow-[0_8px_30px_-12px_rgba(124,134,255,0.15)] overflow-hidden animate-fade-up relative ${viewMode === "grid" ? "col-span-full" : ""}`}
        data-testid={`detail-panel-${pkShort}`}
      >
        <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-12 w-12 border-2 border-[#7c86ff]/20 shrink-0 shadow-sm">
                {profile?.picture ? (
                  <AvatarImage
                    src={profile.picture}
                    alt={profile?.display_name || profile?.name || ""}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="bg-indigo-50 text-indigo-700 text-sm font-bold">
                  {(profile?.display_name || profile?.name || "?")
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p
                  className="text-sm font-bold text-slate-900 truncate"
                  data-testid={`detail-name-${pkShort}`}
                >
                  {profile?.display_name ||
                    profile?.name ||
                    npub.slice(0, 12) + "..."}
                </p>
                {profile?.nip05 && (
                  <p
                    className="text-xs text-indigo-500 truncate"
                    data-testid={`detail-nip05-${pkShort}`}
                  >
                    {profile.nip05}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p
                    className="text-xs font-mono text-slate-400 truncate"
                    data-testid={`detail-npub-${pkShort}`}
                  >
                    {npub.slice(0, 16) + "..." + npub.slice(-8)}
                  </p>
                  <button
                    type="button"
                    className="p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyNpub(npub, pk);
                    }}
                    data-testid={`button-detail-copy-npub-${pkShort}`}
                  >
                    {isCopied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {renderTrustBadge(false)}
              <Button
                size="icon"
                variant="ghost"
                className="rounded-xl"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseDetail();
                }}
                data-testid={`button-close-detail-${pkShort}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isFlagged && (
            <div
              className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200"
              data-testid={`detail-flagged-badge-${pkShort}`}
            >
              <FlaggedIcon className="h-4 w-4 text-red-600" />
              <span className="text-xs font-semibold text-red-700">
                Flagged
              </span>
              <span className="text-[10px] text-red-500">
                Low trust & reported by 2+ trusted accounts
              </span>
            </div>
          )}

          {profile?.about && (
            <p
              className="text-xs text-slate-600 leading-relaxed mb-4 line-clamp-3"
              data-testid={`detail-about-${pkShort}`}
            >
              {profile.about}
            </p>
          )}

          {effectiveDetail ? (
            <div>
              {isRefreshing && (
                <div
                  className="flex items-center gap-1.5 mb-2 text-[10px] text-indigo-500/80"
                  data-testid={`detail-refreshing-${pkShort}`}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Refreshing details…</span>
                </div>
              )}
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4"
                data-testid={`detail-metrics-${pkShort}`}
              >
                {detailMetrics.map((m) => {
                  const raw = effectiveDetail[m.key];
                  const hasData = raw !== undefined && raw !== null;
                  const isPending =
                    !hasData && !seededKeys.has(m.key) && isRefreshing;
                  const isVerifiable =
                    m.key === "followed_by" ||
                    m.key === "following" ||
                    m.key === "muted_by" ||
                    m.key === "reported_by";
                  // Prefer server-side stats (accurate over the full set) for
                  // verified-vs-total display. Fall back to per-pubkey
                  // influence map derived from a seed array when stats
                  // haven't landed yet — that path still works for
                  // muted_by/reported_by from the eager trust-score pass.
                  const serverStat = isVerifiable ? stats?.[m.key] : undefined;
                  let count = Array.isArray(raw)
                    ? toPubkeys(raw).length
                    : typeof raw === "number"
                      ? raw
                      : 0;
                  let verifiedCount = 0;
                  let hasVerifiedData = false;
                  if (serverStat) {
                    count = serverStat.total;
                    verifiedCount = serverStat.verified;
                    hasVerifiedData = true;
                  } else if (isVerifiable && Array.isArray(raw)) {
                    const infMap = toInfluenceMap(raw);
                    infMap.forEach((score) => {
                      if (
                        typeof score === "number" &&
                        score >= getVerifiedThreshold()
                      )
                        verifiedCount++;
                    });
                    hasVerifiedData =
                      infMap.size > 0 &&
                      Array.from(infMap.values()).some((v) => v !== null);
                  }
                  return (
                    <div
                      key={m.key}
                      className="flex items-center gap-2.5 rounded-xl bg-white/70 backdrop-blur-sm border border-indigo-100/40 shadow-sm px-3 py-2.5"
                      data-testid={`detail-metric-${m.key}-${pkShort}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${m.iconBg}`}
                      >
                        {metricIcons[m.key]?.(`h-4 w-4 ${m.iconColor}`)}
                      </div>
                      <div className="min-w-0">
                        {isPending ? (
                          <p className="text-sm font-bold font-mono tabular-nums text-slate-300">
                            —
                          </p>
                        ) : (
                          <p
                            className={`text-sm font-bold font-mono tabular-nums ${count > 0 && (m.key === "muted_by" || m.key === "reported_by") ? m.countColor : "text-slate-900"}`}
                          >
                            {isVerifiable && hasVerifiedData
                              ? verifiedCount.toLocaleString()
                              : count.toLocaleString()}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-400 leading-tight truncate">
                          {isVerifiable && hasVerifiedData
                            ? `Verified ${m.label}`
                            : m.label}
                        </p>
                        {isVerifiable && hasVerifiedData && (
                          <p className="text-[9px] text-slate-400 font-mono tabular-nums">
                            of {count.toLocaleString()} total
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {effectiveDetail.influence !== undefined && (
                <div
                  className="flex items-center gap-3 rounded-xl bg-white/70 backdrop-blur-sm border border-indigo-100/40 shadow-sm px-3.5 py-2.5 mb-4"
                  data-testid={`detail-influence-${pkShort}`}
                >
                  <div className="w-8 h-8 rounded-xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50 to-indigo-100/60 flex items-center justify-center shrink-0">
                    <BrainLogo size={16} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Influence Score
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#7c86ff] to-[#333286]"
                          style={{
                            width: `${Math.min((typeof effectiveDetail.influence === "number" ? effectiveDetail.influence : 0) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold font-mono text-slate-700">
                        {typeof effectiveDetail.influence === "number"
                          ? effectiveDetail.influence.toFixed(3)
                          : effectiveDetail.influence}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  let detailGroups = getPubkeyGroups(pk);
                  if (!socialListsLoading) {
                    detailGroups = detailGroups.filter((gk) => {
                      if (gk === "following" && !isFollowingUser) return false;
                      if (gk === "muting" && !isMutedUser) return false;
                      return true;
                    });
                  }
                  return detailGroups.length > 0 ? (
                    <div
                      className="flex items-center gap-1 flex-wrap"
                      data-testid={`detail-groups-${pkShort}`}
                    >
                      {detailGroups.map((gk) => {
                        const groupDef = groups.find((g) => g.key === gk);
                        if (!groupDef) return null;
                        return (
                          <Badge
                            key={gk}
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${groupDef.bgColor} ${groupDef.color} ${groupDef.borderColor} no-default-hover-elevate no-default-active-elevate`}
                            data-testid={`detail-badge-group-${gk}-${pkShort}`}
                          >
                            {groupDef.label}
                          </Badge>
                        );
                      })}
                    </div>
                  ) : null;
                })()}
                {renderVerifiedFlags()}
                {!isSelf && (
                  <div
                    className="flex items-center gap-1.5"
                    data-testid={`detail-social-actions-${pkShort}`}
                  >
                    {socialListsLoading ? (
                      <>
                        <div
                          className="h-7 w-20 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse"
                          data-testid={`skeleton-follow-${pkShort}`}
                        />
                        <div
                          className="h-7 w-16 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse"
                          data-testid={`skeleton-mute-${pkShort}`}
                        />
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={cardActionPending !== null || socialPending}
                          onMouseEnter={() =>
                            isFollowingUser && setCardFollowHovered(true)
                          }
                          onMouseLeave={() => setCardFollowHovered(false)}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setCardActionPending("follow");
                            try {
                              if (isFollowingUser) await onUnfollow(pk);
                              else await onFollow(pk);
                            } finally {
                              setCardActionPending(null);
                              setCardFollowHovered(false);
                            }
                          }}
                          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none ${
                            isFollowingUser
                              ? cardFollowHovered
                                ? "bg-red-50 border border-red-200 text-red-600"
                                : "bg-white border border-slate-200 text-slate-600"
                              : "bg-[#3730a3] text-white hover:bg-[#312e81]"
                          }`}
                          data-testid={`button-follow-${pkShort}`}
                        >
                          {cardActionPending === "follow" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isFollowingUser ? (
                            cardFollowHovered ? (
                              <UserMinus className="h-3 w-3" />
                            ) : (
                              <UserCheck className="h-3 w-3" />
                            )
                          ) : (
                            <UserPlus className="h-3 w-3" />
                          )}
                          <span className="hidden sm:inline">
                            {cardActionPending === "follow"
                              ? "..."
                              : isFollowingUser
                                ? cardFollowHovered
                                  ? "Unfollow"
                                  : "Following"
                                : "Follow"}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={cardActionPending !== null || socialPending}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setCardActionPending("mute");
                            try {
                              if (isMutedUser) await onUnmute(pk);
                              else await onMute(pk);
                            } finally {
                              setCardActionPending(null);
                            }
                          }}
                          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-all duration-200 border disabled:opacity-50 disabled:pointer-events-none ${
                            isMutedUser
                              ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300"
                          }`}
                          data-testid={`button-mute-${pkShort}`}
                        >
                          {cardActionPending === "mute" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isMutedUser ? (
                            <Volume2 className="h-3 w-3" />
                          ) : (
                            <VolumeX className="h-3 w-3" />
                          )}
                          <span className="hidden sm:inline">
                            {cardActionPending === "mute"
                              ? "..."
                              : isMutedUser
                                ? "Unmute"
                                : "Mute"}
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                )}
                <button
                  className="gap-2 ml-auto inline-flex items-center h-9 px-4 text-xs font-bold rounded-xl bg-[#3730a3] text-white shadow-md hover:shadow-lg hover:bg-[#312e81] transition-all duration-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(
                      `/profile/${npub}?fromGroup=${activeGroupRef.current ?? ""}`,
                    );
                  }}
                  data-testid={`button-view-full-${pkShort}`}
                >
                  <SearchIcon className="h-3.5 w-3.5" />
                  View full profile
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : isRefreshing ? (
            <div
              className="flex items-center justify-center gap-2 py-4 text-xs text-indigo-500/80"
              data-testid={`detail-loading-${pkShort}`}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading details…</span>
            </div>
          ) : (
            <p
              className="text-xs text-slate-400 py-4 text-center"
              data-testid={`detail-error-${pkShort}`}
            >
              Unable to load details
            </p>
          )}
        </div>
      </div>
    );
  };

  // Only block on the skeleton until we've actually attempted to fetch the
  // kind-0 profile. Once attempted, render the card even with no profile — the
  // body falls back to the npub (see `displayName`/`displayNpub`) and upgrades
  // in place if a profile arrives later. This prevents rows from being stuck as
  // skeletons forever when a pubkey has no resolvable kind-0 profile.
  if (!isProfileLoaded && !profileAttempted) {
    return (
      <>
        <div
          className={`bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] animate-pulse ${viewMode === "grid" ? "p-4" : "p-3"}`}
          data-testid={`skeleton-profile-${pkShort}`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`rounded-full bg-slate-200 shrink-0 ${viewMode === "grid" ? "h-8 w-8" : "h-7 w-7"}`}
            />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-200 rounded w-24" />
              <div className="h-2 bg-slate-100 rounded w-32" />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (viewMode === "list") {
    return (
      <>
        <div
          className={`bg-white/90 backdrop-blur-sm border rounded-xl px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-indigo-300/60 hover:shadow-[0_2px_8px_rgba(99,102,241,0.08)] transition-all duration-200 cursor-pointer flex items-center gap-3 ${isExpanded ? "border-indigo-300 shadow-[0_2px_8px_rgba(99,102,241,0.12)]" : "border-slate-200"}`}
          onClick={() => onToggleExpanded(pk)}
          onMouseEnter={() => onPrefetchEnter?.(pk)}
          onMouseLeave={() => onPrefetchLeave?.(pk)}
          data-testid={`card-profile-${pkShort}`}
        >
          <Avatar className="h-7 w-7 border border-slate-200/60 shrink-0">
            {profile?.picture ? (
              <AvatarImage
                src={profile.picture}
                alt={displayName}
                className="object-cover"
              />
            ) : null}
            <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold">
              {(displayName || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
            <p
              className="text-sm font-semibold text-slate-800 truncate max-w-[160px]"
              data-testid={`text-profile-name-${pkShort}`}
            >
              {displayName}
            </p>
            {profile?.nip05 && (
              <span
                className="text-xs text-indigo-500 truncate max-w-[140px] hidden sm:inline"
                data-testid={`text-profile-nip05-${pkShort}`}
              >
                {profile.nip05}
              </span>
            )}
            <span
              className="text-xs font-mono text-slate-400 truncate hidden md:inline"
              data-testid={`text-profile-npub-${pkShort}`}
            >
              {displayNpub}
            </span>
          </div>
          {liveFilteredGroups.length > 0 && (
            <div
              className="flex items-center gap-1 shrink-0 flex-wrap"
              data-testid={`row-profile-groups-${pkShort}`}
            >
              {liveFilteredGroups.map((gk) => {
                const groupDef = groups.find((g) => g.key === gk);
                if (!groupDef) return null;
                return (
                  <Badge
                    key={gk}
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${groupDef.bgColor} ${groupDef.color} ${groupDef.borderColor} no-default-hover-elevate no-default-active-elevate`}
                    data-testid={`badge-group-${gk}-${pkShort}`}
                  >
                    {groupDef.label}
                  </Badge>
                );
              })}
            </div>
          )}
          {renderVerifiedFlags()}
          {renderTrustBadge(true)}
          <button
            type="button"
            className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onCopyNpub(npub, pk);
            }}
            data-testid={`button-copy-npub-${pkShort}`}
          >
            {isCopied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
        {renderDetailPanel()}
      </>
    );
  }

  return (
    <>
      <div
        className={`bg-white/90 backdrop-blur-sm border rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-indigo-300/60 hover:shadow-[0_2px_8px_rgba(99,102,241,0.08)] transition-all duration-200 cursor-pointer group ${isExpanded ? "border-indigo-300 shadow-[0_2px_8px_rgba(99,102,241,0.12)]" : "border-slate-200"}`}
        onClick={() => onToggleExpanded(pk)}
        onMouseEnter={() => onPrefetchEnter?.(pk)}
        onMouseLeave={() => onPrefetchLeave?.(pk)}
        data-testid={`card-profile-${pkShort}`}
      >
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 border border-slate-200/60">
            {profile?.picture ? (
              <AvatarImage
                src={profile.picture}
                alt={displayName}
                className="object-cover"
              />
            ) : null}
            <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold">
              {(displayName || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold text-slate-800 truncate"
              data-testid={`text-profile-name-${pkShort}`}
            >
              {displayName}
            </p>
            {profile?.nip05 && (
              <p
                className="text-xs text-indigo-500 truncate"
                data-testid={`text-profile-nip05-${pkShort}`}
              >
                {profile.nip05}
              </p>
            )}
          </div>
          {renderTrustBadge(false)}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className="text-xs font-mono text-slate-400 truncate"
            data-testid={`text-profile-npub-${pkShort}`}
          >
            {displayNpub}
          </span>
          <button
            type="button"
            className="p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onCopyNpub(npub, pk);
            }}
            data-testid={`button-copy-npub-${pkShort}`}
          >
            {isCopied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
        {liveFilteredGroups.length > 0 && (
          <div
            className="mt-2 flex flex-wrap gap-1"
            data-testid={`row-profile-groups-${pkShort}`}
          >
            {liveFilteredGroups.map((gk) => {
              const groupDef = groups.find((g) => g.key === gk);
              if (!groupDef) return null;
              return (
                <Badge
                  key={gk}
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${groupDef.bgColor} ${groupDef.color} ${groupDef.borderColor} no-default-hover-elevate no-default-active-elevate`}
                  data-testid={`badge-group-${gk}-${pkShort}`}
                >
                  {groupDef.label}
                </Badge>
              );
            })}
          </div>
        )}
        {renderVerifiedFlags() && (
          <div className="mt-2">{renderVerifiedFlags()}</div>
        )}
      </div>
      {renderDetailPanel()}
    </>
  );
});
