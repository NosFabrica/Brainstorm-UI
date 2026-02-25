import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import {
  Search as SearchIcon,
  Home,
  LogOut,
  Menu,
  X,
  Loader2,
  Copy,
  Check,
  Settings as SettingsIcon,
  BookOpen,
  Users,
  Filter,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { apiClient } from "@/services/api";
import { toPubkeys, toInfluenceMap } from "../services/graphHelpers";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { NodeFollowersIcon, NodeFollowingIcon, NodeMutedByIcon, NodeReportedByIcon, NodeMutingIcon, NodeReportingIcon } from "@/components/WotIcons";

const FollowersIcon = NodeFollowersIcon;
const FollowingIcon = NodeFollowingIcon;
const MutedByIcon = NodeMutedByIcon;
const MutingIcon = NodeMutingIcon;
const ReportedByIcon = NodeReportedByIcon;
const ReportingIcon = NodeReportingIcon;

const floatingNodes = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: 8 + Math.random() * 84,
  y: 8 + Math.random() * 84,
  size: Math.random() * 2.5 + 1.5,
  popDelay: i * 1.2 + Math.random() * 2,
  floatDuration: Math.random() * 20 + 22,
  floatDelay: Math.random() * 6,
}));

const connectionPairs = [
  [0, 3], [1, 4], [2, 5], [3, 7], [4, 8],
  [5, 9], [0, 6], [1, 7], [2, 8], [6, 9],
];

const decorativeText = [
  "trust_score: 0.847",
  "npub1qd9...k7a2",
  "hops: 3",
  "relay: wss://nos.lol",
  "verify(sig)",
  "WOT(u) = f(G, seeds)",
  "muted_by: 0",
  "followers: 142",
  "influence: 1.0",
  "kind: 22242",
  "relay: wss://damus.io",
  "G = (V, E, W)",
  "score = f(hops)",
  "compute(graperank)",
  "npub1z8f...m4c9",
  "following: 87",
  "attenuation: 0.5",
  "rigor: 0.25",
];

function estimateNetworkLineLength(a: number, b: number): number {
  const dx = (floatingNodes[a].x - floatingNodes[b].x);
  const dy = (floatingNodes[a].y - floatingNodes[b].y);
  return Math.sqrt(dx * dx + dy * dy) * 12;
}

const connectionLineStyles: React.CSSProperties[] = connectionPairs.map(([a, b], i) => {
  const len = estimateNetworkLineLength(a, b);
  return {
    ["--dash" as string]: len,
    animation: `networkLineDraw ${1.2 + (i % 3) * 0.4}s ease-out ${i * 0.8 + 0.3}s forwards, networkLinePulse 12s ease-in-out ${i * 0.8 + 0.3 + 1.5}s infinite`,
  } as React.CSSProperties;
});

const connectionLineDashArrays = connectionPairs.map(([a, b]) => estimateNetworkLineLength(a, b));

const floatingNodeStyles: React.CSSProperties[] = floatingNodes.map((node) => ({
  left: `${node.x}%`,
  top: `${node.y}%`,
  width: node.size + 5,
  height: node.size + 5,
  opacity: 0,
  transform: "scale(0)",
  animation: `networkNodePop 0.6s ease-out ${node.popDelay}s forwards, networkNodeFloat ${node.floatDuration}s ease-in-out ${node.popDelay + 0.6}s infinite`,
}));

const decorativeTextStyles: React.CSSProperties[] = decorativeText.map((_, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  const left = 3 + col * 24 + ((row % 2) * 10);
  const top = 80 + row * 220;
  return {
    left: `${left}%`,
    top: `${top}px`,
    opacity: 0,
    animation: `networkCalcFloat 10s ease-in-out ${i * 1.2 + 1}s infinite`,
  };
});

const getVerificationGuidance = (pct: number, name: string) => {
  if (pct >= 50) return { label: "High confidence", color: "text-emerald-600", message: `${pct}% confidence that ${name} is a genuine participant, based on your trusted community's follows, mutes, and reports.` };
  if (pct >= 20) return { label: "Moderate confidence", color: "text-indigo-600", message: `${pct}% confidence that ${name} is a genuine participant. Your network has limited signals — consider reviewing their activity.` };
  if (pct >= 7) return { label: "Low confidence", color: "text-slate-500", message: `Only ${pct}% confidence that ${name} is a genuine participant. Your trusted community has weak or mixed signals.` };
  return { label: "Very low confidence", color: "text-amber-600", message: `${pct}% confidence that ${name} is a genuine participant. Your community's signals suggest careful scrutiny before trusting.` };
};

const detailMetrics: { key: string; label: string; desc: string; iconBg: string; iconColor: string; countColor: string }[] = [
  { key: "followed_by", label: "Followers", desc: "People following this account", iconBg: "bg-blue-50 border-blue-100", iconColor: "text-blue-500", countColor: "text-slate-900" },
  { key: "following", label: "Following", desc: "Accounts this person follows", iconBg: "bg-blue-50 border-blue-100", iconColor: "text-blue-500", countColor: "text-slate-900" },
  { key: "muted_by", label: "Muted By", desc: "Others who muted this account", iconBg: "bg-amber-50 border-amber-200", iconColor: "text-amber-500", countColor: "text-amber-700" },
  { key: "reported_by", label: "Reported By", desc: "Others who reported this account", iconBg: "bg-red-50 border-red-200", iconColor: "text-red-500", countColor: "text-red-700" },
  { key: "muting", label: "Muting", desc: "Accounts this person mutes", iconBg: "bg-amber-50 border-amber-200", iconColor: "text-amber-500", countColor: "text-slate-900" },
  { key: "reporting", label: "Reporting", desc: "Accounts this person reports", iconBg: "bg-slate-50 border-slate-200", iconColor: "text-slate-500", countColor: "text-slate-900" },
];

const metricIcons: Record<string, (cls: string) => JSX.Element> = {
  followed_by: (cls) => <FollowersIcon className={cls} />,
  following: (cls) => <FollowingIcon className={cls} />,
  muted_by: (cls) => <MutedByIcon className={cls} />,
  reported_by: (cls) => <ReportedByIcon className={cls} />,
  muting: (cls) => <MutingIcon className={cls} />,
  reporting: (cls) => <ReportingIcon className={cls} />,
};

type GroupKey = "followed_by" | "following" | "muted_by" | "muting" | "reported_by" | "reporting";

const groups = [
  { key: "followed_by" as GroupKey, label: "Followers", shortLabel: "Followers", Icon: FollowersIcon, color: "text-blue-500", bgColor: "bg-blue-50", borderColor: "border-blue-100" },
  { key: "following" as GroupKey, label: "Following", shortLabel: "Following", Icon: FollowingIcon, color: "text-blue-500", bgColor: "bg-blue-50", borderColor: "border-blue-100" },
  { key: "muted_by" as GroupKey, label: "Muted By", shortLabel: "Muted", Icon: MutedByIcon, color: "text-amber-500", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  { key: "muting" as GroupKey, label: "Muting", shortLabel: "Muting", Icon: MutingIcon, color: "text-amber-500", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  { key: "reported_by" as GroupKey, label: "Reported By", shortLabel: "Reported", Icon: ReportedByIcon, color: "text-red-500", bgColor: "bg-red-50", borderColor: "border-red-200" },
  { key: "reporting" as GroupKey, label: "Reporting", shortLabel: "Reporting", Icon: ReportingIcon, color: "text-red-500", bgColor: "bg-red-50", borderColor: "border-red-200" },
];

interface NetworkProfileCardProps {
  pk: string;
  profile: any | undefined;
  trustScore: number | null | undefined;
  graphData: any | undefined;
  detail: any | undefined;
  memberGroups: GroupKey[];
  viewMode: "grid" | "list";
  isExpanded: boolean;
  isCopied: boolean;
  isProfileLoaded: boolean;
  expandedLoading: boolean;
  activeGroup: string;
  trustCacheRef: React.RefObject<Map<string, number | null>>;
  onToggleExpanded: (pk: string) => void;
  onCopyNpub: (npub: string, pk: string) => void;
  onCloseDetail: () => void;
  onNavigate: (path: string) => void;
  getPubkeyGroups: (pk: string) => GroupKey[];
}

const NetworkProfileCard = memo(function NetworkProfileCard({
  pk, profile, trustScore, graphData, detail, memberGroups, viewMode, isExpanded, isCopied,
  isProfileLoaded, expandedLoading, activeGroup, trustCacheRef,
  onToggleExpanded, onCopyNpub, onCloseDetail, onNavigate, getPubkeyGroups,
}: NetworkProfileCardProps) {
  const npub = nip19.npubEncode(pk);
  const displayNpub = npub.slice(0, 12) + "..." + npub.slice(-6);
  const displayName = profile?.display_name || profile?.name || displayNpub;
  const pkShort = pk.slice(0, 8);

  const getVerifiedFlagCounts = () => {
    if (!graphData) return { verifiedMuters: 0, verifiedReporters: 0 };
    const TA_THRESHOLD = 0.02;
    let verifiedMuters = 0;
    let verifiedReporters = 0;
    for (const muterPk of graphData.muted_by || []) {
      const score = trustCacheRef.current?.get(muterPk);
      if (typeof score === "number" && score >= TA_THRESHOLD) verifiedMuters++;
    }
    for (const reporterPk of graphData.reported_by || []) {
      const score = trustCacheRef.current?.get(reporterPk);
      if (typeof score === "number" && score >= TA_THRESHOLD) verifiedReporters++;
    }
    return { verifiedMuters, verifiedReporters };
  };

  const renderVerifiedFlags = () => {
    const { verifiedMuters, verifiedReporters } = getVerifiedFlagCounts();
    if (verifiedMuters === 0 && verifiedReporters === 0) return null;
    return (
      <div className="flex items-center gap-1.5 flex-wrap" data-testid={`flags-verified-${pkShort}`}>
        {verifiedMuters > 0 && (
          <UITooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200 cursor-help no-default-hover-elevate no-default-active-elevate" data-testid={`badge-verified-muted-${pkShort}`}>
                Muted by {verifiedMuters} verified
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-white/95 backdrop-blur-xl border-slate-200 text-slate-700 shadow-xl p-2.5 max-w-[240px]">
              <p className="text-xs leading-relaxed">{verifiedMuters} verified {verifiedMuters === 1 ? "user has" : "users have"} muted this account. Verified users have a trust assertion score of 0.01 or above.</p>
            </TooltipContent>
          </UITooltip>
        )}
        {verifiedReporters > 0 && (
          <UITooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200 cursor-help no-default-hover-elevate no-default-active-elevate" data-testid={`badge-verified-reported-${pkShort}`}>
                Reported by {verifiedReporters} verified
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-white/95 backdrop-blur-xl border-slate-200 text-slate-700 shadow-xl p-2.5 max-w-[240px]">
              <p className="text-xs leading-relaxed">{verifiedReporters} verified {verifiedReporters === 1 ? "user has" : "users have"} reported this account. Verified users have a trust assertion score of 0.01 or above.</p>
            </TooltipContent>
          </UITooltip>
        )}
      </div>
    );
  };

  const renderTrustBadge = (compact: boolean = false) => {
    if (trustScore === undefined) {
      return (
        <div className="flex items-center gap-1" data-testid={`trust-loading-${pkShort}`}>
          <div className={`rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 ${compact ? "w-6 h-6" : "w-8 h-8"}`}>
            <Loader2 className={`text-indigo-300 animate-spin ${compact ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
          </div>
        </div>
      );
    }
    if (trustScore === null) return null;
    const score = Math.min(1, Math.max(0, trustScore));
    const pct = Math.round(score * 100);
    const ringColor = pct >= 50 ? "stroke-emerald-500" : pct >= 20 ? "stroke-indigo-500" : pct >= 7 ? "stroke-slate-400" : "stroke-amber-500";
    const circumference = 2 * Math.PI * 18;
    const offset = circumference - (score * circumference);
    const size = compact ? "w-7 h-7" : "w-9 h-9";
    const textSize = compact ? "text-[10px]" : "text-xs";
    const guidance = getVerificationGuidance(pct, displayName);
    return (
      <UITooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center shrink-0 cursor-help" data-testid={`badge-trust-${pkShort}`}>
            <div className={`relative ${size} flex items-center justify-center`}>
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-indigo-100" />
                <circle cx="22" cy="22" r="18" fill="none" strokeWidth="3" strokeLinecap="round"
                  className={ringColor} style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: "stroke-dashoffset 0.8s ease-out" }} />
              </svg>
              <span className={`${textSize} font-bold font-mono tabular-nums text-indigo-700`}>{pct}</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="bg-white/95 backdrop-blur-xl border-slate-200 text-slate-700 shadow-xl p-3 max-w-[260px]" data-testid={`tooltip-trust-${pkShort}`}>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-xs text-slate-900">Verification Score</p>
              <span className={`text-xs font-semibold ${guidance.color}`}>{guidance.label}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{guidance.message}</p>
          </div>
        </TooltipContent>
      </UITooltip>
    );
  };

  const renderDetailPanel = () => {
    if (!isExpanded) return null;
    const isLoadingDetail = expandedLoading && !detail;
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
                  <AvatarImage src={profile.picture} alt={profile?.display_name || profile?.name || ""} className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-indigo-50 text-indigo-700 text-sm font-bold">
                  {(profile?.display_name || profile?.name || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate" data-testid={`detail-name-${pkShort}`}>
                  {profile?.display_name || profile?.name || npub.slice(0, 12) + "..."}
                </p>
                {profile?.nip05 && (
                  <p className="text-xs text-indigo-500 truncate" data-testid={`detail-nip05-${pkShort}`}>{profile.nip05}</p>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs font-mono text-slate-400 truncate" data-testid={`detail-npub-${pkShort}`}>{npub.slice(0, 16) + "..." + npub.slice(-8)}</p>
                  <button
                    type="button"
                    className="p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                    onClick={(e) => { e.stopPropagation(); onCopyNpub(npub, pk); }}
                    data-testid={`button-detail-copy-npub-${pkShort}`}
                  >
                    {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
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
                onClick={(e) => { e.stopPropagation(); onCloseDetail(); }}
                data-testid={`button-close-detail-${pkShort}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {profile?.about && (
            <p className="text-xs text-slate-600 leading-relaxed mb-4 line-clamp-3" data-testid={`detail-about-${pkShort}`}>
              {profile.about}
            </p>
          )}

          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-6 gap-2" data-testid={`detail-loading-${pkShort}`}>
              <BrainLogo size={18} className="animate-pulse text-indigo-400" />
              <span className="text-xs text-slate-500">Loading details...</span>
            </div>
          ) : detail ? (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4" data-testid={`detail-metrics-${pkShort}`}>
                {detailMetrics.map((m) => {
                  const raw = detail[m.key];
                  const count = Array.isArray(raw) ? toPubkeys(raw).length : (typeof raw === "number" ? raw : 0);
                  return (
                    <div
                      key={m.key}
                      className="flex items-center gap-2.5 rounded-xl bg-white/70 backdrop-blur-sm border border-indigo-100/40 shadow-sm px-3 py-2.5"
                      data-testid={`detail-metric-${m.key}-${pkShort}`}
                    >
                      <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${m.iconBg}`}>
                        {metricIcons[m.key]?.(`h-4 w-4 ${m.iconColor}`)}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold font-mono tabular-nums ${count > 0 && (m.key === "muted_by" || m.key === "reported_by") ? m.countColor : "text-slate-900"}`}>
                          {count.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-tight truncate">{m.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {detail.influence !== undefined && (
                <div className="flex items-center gap-3 rounded-xl bg-white/70 backdrop-blur-sm border border-indigo-100/40 shadow-sm px-3.5 py-2.5 mb-4" data-testid={`detail-influence-${pkShort}`}>
                  <div className="w-8 h-8 rounded-xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50 to-indigo-100/60 flex items-center justify-center shrink-0">
                    <BrainLogo size={16} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 leading-tight">Influence Score</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#7c86ff] to-[#333286]" style={{ width: `${Math.min((typeof detail.influence === "number" ? detail.influence : 0) * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold font-mono text-slate-700">
                        {typeof detail.influence === "number" ? detail.influence.toFixed(3) : detail.influence}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const detailGroups = getPubkeyGroups(pk);
                  return detailGroups.length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap" data-testid={`detail-groups-${pkShort}`}>
                      {detailGroups.map((gk) => {
                        const groupDef = groups.find(g => g.key === gk);
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
                <button
                  className="gap-2 ml-auto inline-flex items-center h-9 px-4 text-xs font-bold rounded-xl bg-[#3730a3] text-white shadow-md hover:shadow-lg hover:bg-[#312e81] transition-all duration-200"
                  onClick={(e) => { e.stopPropagation(); onNavigate(`/search?npub=${npub}&fromGroup=${activeGroup}`); }}
                  data-testid={`button-view-full-${pkShort}`}
                >
                  <SearchIcon className="h-3.5 w-3.5" />
                  View full profile
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center" data-testid={`detail-error-${pkShort}`}>Unable to load details</p>
          )}
        </div>
      </div>
    );
  };

  if (!isProfileLoaded) {
    return (
      <>
        <div
          className={`bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] animate-pulse ${viewMode === "grid" ? "p-4" : "p-3"}`}
          data-testid={`skeleton-profile-${pkShort}`}
        >
          <div className="flex items-center gap-3">
            <div className={`rounded-full bg-slate-200 shrink-0 ${viewMode === "grid" ? "h-8 w-8" : "h-7 w-7"}`} />
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
          data-testid={`card-profile-${pkShort}`}
        >
          <Avatar className="h-7 w-7 border border-slate-200/60 shrink-0">
            {profile?.picture ? (
              <AvatarImage src={profile.picture} alt={displayName} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold">
              {(displayName || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 truncate max-w-[160px]" data-testid={`text-profile-name-${pkShort}`}>
              {displayName}
            </p>
            {profile?.nip05 && (
              <span className="text-xs text-indigo-500 truncate max-w-[140px] hidden sm:inline" data-testid={`text-profile-nip05-${pkShort}`}>
                {profile.nip05}
              </span>
            )}
            <span className="text-xs font-mono text-slate-400 truncate hidden md:inline" data-testid={`text-profile-npub-${pkShort}`}>
              {displayNpub}
            </span>
          </div>
          {memberGroups.length > 0 && (
            <div className="flex items-center gap-1 shrink-0 flex-wrap" data-testid={`row-profile-groups-${pkShort}`}>
              {memberGroups.map((gk) => {
                const groupDef = groups.find(g => g.key === gk);
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
            onClick={(e) => { e.stopPropagation(); onCopyNpub(npub, pk); }}
            data-testid={`button-copy-npub-${pkShort}`}
          >
            {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
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
        data-testid={`card-profile-${pkShort}`}
      >
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 border border-slate-200/60">
            {profile?.picture ? (
              <AvatarImage src={profile.picture} alt={displayName} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-bold">
              {(displayName || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate" data-testid={`text-profile-name-${pkShort}`}>
              {displayName}
            </p>
            {profile?.nip05 && (
              <p className="text-xs text-indigo-500 truncate" data-testid={`text-profile-nip05-${pkShort}`}>
                {profile.nip05}
              </p>
            )}
          </div>
          {renderTrustBadge(false)}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-xs font-mono text-slate-400 truncate" data-testid={`text-profile-npub-${pkShort}`}>
            {displayNpub}
          </span>
          <button
            type="button"
            className="p-0.5 rounded text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); onCopyNpub(npub, pk); }}
            data-testid={`button-copy-npub-${pkShort}`}
          >
            {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        {memberGroups.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" data-testid={`row-profile-groups-${pkShort}`}>
            {memberGroups.map((gk) => {
              const groupDef = groups.find(g => g.key === gk);
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

export default function NetworkPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [activeGroup, setActiveGroup] = useState<GroupKey>(() => {
    const params = new URLSearchParams(window.location.search);
    const group = params.get("group");
    const validGroups: GroupKey[] = ["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"];
    return group && validGroups.includes(group as GroupKey) ? (group as GroupKey) : "followed_by";
  });
  const [searchFilter, setSearchFilter] = useState("");
  type TrustTier = "all" | "high" | "medium" | "neutral" | "low" | "flagged";
  const [trustFilter, setTrustFilter] = useState<TrustTier>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("trust");
    const valid: TrustTier[] = ["high", "medium", "neutral", "low", "flagged"];
    if (t && valid.includes(t as TrustTier)) return t as TrustTier;
    return "all";
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("trust")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  const [networkData, setNetworkData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [copiedPubkey, setCopiedPubkey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") === "grid" ? "grid" : "list";
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [expandedPubkey, setExpandedPubkey] = useState<string | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const { data: grapeRankData, isPending: grapeRankLoading } = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });
  const calcDone = grapeRankData?.data?.internal_publication_status === "success";

  const PAGE_SIZE = 24;

  const profileCache = useRef<Map<string, any>>(new Map());
  const trustCache = useRef<Map<string, number | null>>(new Map());
  const graphDataCache = useRef<Map<string, { muted_by?: string[]; reported_by?: string[] }>>(new Map());
  const detailCache = useRef<Map<string, any>>(new Map());
  const [trustLoadedCount, setTrustLoadedCount] = useState(0);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/");
      return;
    }
    setUser(u);
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const loadNetwork = async () => {
      setIsLoading(true);
      try {
        const data = await apiClient.getSelf();
        const inner = data?.data || data;
        const graphObj = inner?.graph || inner;
        setNetworkData(graphObj);
        const allGroups = ["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"];
        for (const groupKey of allGroups) {
          const influenceMap = toInfluenceMap(graphObj?.[groupKey]);
          influenceMap.forEach((influence, pk) => {
            if (!trustCache.current.has(pk)) {
              trustCache.current.set(pk, influence);
            }
          });
        }
      } catch {
        setNetworkData(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadNetwork();
  }, [user]);

  const fetchProfiles = useCallback(async (pubkeys: string[]) => {
    const unfetched = pubkeys.filter(pk => !profileCache.current.has(pk));
    const batchSize = 10;
    for (let i = 0; i < unfetched.length; i += batchSize) {
      const batch = unfetched.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(pk => fetch(`/api/profile/${pk}`).then(r => r.json()))
      );
      results.forEach((res, idx) => {
        if (res.status === "fulfilled" && res.value?.event) {
          try {
            const meta = JSON.parse(res.value.event.content);
            profileCache.current.set(batch[idx], meta);
          } catch {
            profileCache.current.set(batch[idx], null);
          }
        } else {
          profileCache.current.set(batch[idx], null);
        }
      });
      setLoadedCount(prev => prev + batch.length);
    }
  }, []);

  const fetchTrustScores = useCallback(async (pubkeys: string[]) => {
    const unfetched = pubkeys.filter(pk => !trustCache.current.has(pk));
    if (unfetched.length === 0) return;
    const batchSize = 8;
    for (let i = 0; i < unfetched.length; i += batchSize) {
      const batch = unfetched.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(pk => apiClient.getUserByPubkey(pk))
      );
      results.forEach((res, idx) => {
        if (res.status === "fulfilled") {
          const graph = res.value?.data?.graph || res.value?.data || res.value;
          const influence = graph?.influence;
          trustCache.current.set(batch[idx], typeof influence === "number" ? influence : null);
          graphDataCache.current.set(batch[idx], {
            muted_by: toPubkeys(graph?.muted_by),
            reported_by: toPubkeys(graph?.reported_by),
          });
        } else {
          trustCache.current.set(batch[idx], null);
        }
      });
      setTrustLoadedCount(prev => prev + batch.length);
    }
  }, []);

  const toggleExpanded = useCallback(async (pk: string) => {
    if (expandedPubkey === pk) {
      setExpandedPubkey(null);
      return;
    }
    setExpandedPubkey(pk);
    if (detailCache.current.has(pk)) return;
    setExpandedLoading(true);
    try {
      const res = await apiClient.getUserByPubkey(pk);
      const graph = res?.data?.graph || res?.data || res;
      detailCache.current.set(pk, graph);
    } catch {
      detailCache.current.set(pk, null);
    } finally {
      setExpandedLoading(false);
    }
  }, [expandedPubkey]);

  const getGroupPubkeys = useCallback((key: GroupKey): string[] => {
    if (!networkData) return [];
    return toPubkeys(networkData[key]);
  }, [networkData]);

  const groupPubkeySets = useMemo(() => {
    if (!networkData) return null;
    const sets: Record<GroupKey, Set<string>> = {} as any;
    (["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"] as GroupKey[]).forEach(k => {
      sets[k] = new Set(toPubkeys(networkData[k]));
    });
    return sets;
  }, [networkData]);

  const getPubkeyGroups = useCallback((pubkey: string): GroupKey[] => {
    if (!groupPubkeySets) return [];
    const memberOf: GroupKey[] = [];
    (["followed_by", "following", "muted_by", "muting", "reported_by", "reporting"] as GroupKey[]).forEach(k => {
      if (groupPubkeySets[k].has(pubkey)) {
        memberOf.push(k);
      }
    });
    return memberOf;
  }, [groupPubkeySets]);

  const isVerifiableGroup = (_key: GroupKey) => true;

  const getVerifiedPubkeys = useCallback((key: GroupKey): string[] => {
    const all = getGroupPubkeys(key);
    if (!isVerifiableGroup(key)) return all;
    const TA_THRESHOLD = 0.02;
    return all.filter(pk => {
      const score = trustCache.current.get(pk);
      return typeof score === "number" && score >= TA_THRESHOLD;
    });
  }, [getGroupPubkeys, trustLoadedCount]);

  const getGroupCount = useCallback((key: GroupKey): number => {
    if (verifiedOnly && isVerifiableGroup(key)) {
      return getVerifiedPubkeys(key).length;
    }
    return getGroupPubkeys(key).length;
  }, [getGroupPubkeys, getVerifiedPubkeys, verifiedOnly]);

  const filteredPubkeys = useCallback(() => {
    let pubkeys = verifiedOnly && isVerifiableGroup(activeGroup)
      ? getVerifiedPubkeys(activeGroup)
      : getGroupPubkeys(activeGroup);
    if (searchFilter.trim()) {
      const query = searchFilter.trim().toLowerCase();
      pubkeys = pubkeys.filter(pk => {
        const profile = profileCache.current.get(pk);
        const npub = nip19.npubEncode(pk);
        if (npub.toLowerCase().includes(query)) return true;
        if (profile) {
          if (profile.name?.toLowerCase().includes(query)) return true;
          if (profile.display_name?.toLowerCase().includes(query)) return true;
          if (profile.nip05?.toLowerCase().includes(query)) return true;
        }
        return false;
      });
    }
    if (trustFilter !== "all") {
      if (trustFilter === "flagged") {
        const flaggedGroups: GroupKey[] = ["muted_by", "reported_by"];
        const flaggedSet = new Set<string>();
        for (const gk of flaggedGroups) {
          for (const pk of getGroupPubkeys(gk)) {
            flaggedSet.add(pk);
          }
        }
        pubkeys = pubkeys.filter(pk => {
          if (flaggedSet.has(pk)) return true;
          const influence = trustCache.current.get(pk);
          return typeof influence === "number" && influence < 0.02;
        });
      } else {
        pubkeys = pubkeys.filter(pk => {
          const influence = trustCache.current.get(pk);
          if (influence === undefined) return true;
          if (influence === null) return false;
          const pct = Math.round(Math.min(1, Math.max(0, influence)) * 100);
          if (trustFilter === "high") return pct >= 50;
          if (trustFilter === "medium") return pct >= 20 && pct < 50;
          if (trustFilter === "neutral") return pct >= 7 && pct < 20;
          if (trustFilter === "low") return pct >= 2 && pct < 7;
          return true;
        });
      }
    }
    return pubkeys;
  }, [activeGroup, searchFilter, trustFilter, getGroupPubkeys, getVerifiedPubkeys, verifiedOnly, loadedCount, trustLoadedCount]);

  useEffect(() => {
    if (!verifiedOnly) return;
    const allPksSet = new Set<string>();
    const allGroups: GroupKey[] = ["followed_by", "following", "muted_by", "reported_by", "muting", "reporting"];
    for (const gk of allGroups) {
      for (const pk of getGroupPubkeys(gk)) {
        allPksSet.add(pk);
      }
    }
    const allPks = Array.from(allPksSet);
    if (allPks.length > 0) {
      fetchTrustScores(allPks);
    }
  }, [networkData, verifiedOnly, getGroupPubkeys, fetchTrustScores]);

  useEffect(() => {
    const pubkeys = getGroupPubkeys(activeGroup);
    if (pubkeys.length > 0) {
      fetchProfiles(pubkeys);
    }
  }, [activeGroup, networkData, fetchProfiles, getGroupPubkeys]);

  useEffect(() => {
    if (trustFilter !== "all") {
      const allGroupPubkeys = getGroupPubkeys(activeGroup);
      if (allGroupPubkeys.length > 0) {
        fetchTrustScores(allGroupPubkeys);
      }
    } else {
      const visible = filteredPubkeys();
      if (visible.length === 0) return;
      const totalPages = Math.ceil(visible.length / PAGE_SIZE);
      const safePage = Math.min(currentPage, totalPages || 1);
      const startIdx = (safePage - 1) * PAGE_SIZE;
      const pageItems = visible.slice(startIdx, startIdx + PAGE_SIZE);
      if (pageItems.length > 0) {
        fetchTrustScores(pageItems);
      }
      if (safePage < totalPages) {
        const nextStart = safePage * PAGE_SIZE;
        const nextPageItems = visible.slice(nextStart, nextStart + PAGE_SIZE);
        if (nextPageItems.length > 0) {
          fetchProfiles(nextPageItems);
          fetchTrustScores(nextPageItems);
        }
      }
    }
  }, [filteredPubkeys, currentPage, fetchTrustScores, fetchProfiles, trustFilter, activeGroup, getGroupPubkeys]);

  useEffect(() => {
    const visible = filteredPubkeys();
    if (visible.length === 0) return;
    const totalPages = Math.ceil(visible.length / PAGE_SIZE);
    const safePage = Math.min(currentPage, totalPages || 1);
    const startIdx = (safePage - 1) * PAGE_SIZE;
    const pageItems = visible.slice(startIdx, startIdx + PAGE_SIZE);

    const muterReporterPks = new Set<string>();
    for (const pk of pageItems) {
      const gData = graphDataCache.current.get(pk);
      if (!gData) continue;
      for (const m of gData.muted_by || []) {
        if (!trustCache.current.has(m)) muterReporterPks.add(m);
      }
      for (const r of gData.reported_by || []) {
        if (!trustCache.current.has(r)) muterReporterPks.add(r);
      }
    }
    if (muterReporterPks.size > 0) {
      fetchTrustScores(Array.from(muterReporterPks));
    }
  }, [trustLoadedCount, filteredPubkeys, currentPage, fetchTrustScores]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleCopyNpub = useCallback(async (npub: string, pubkey: string) => {
    try {
      await navigator.clipboard.writeText(npub);
      setCopiedPubkey(pubkey);
      setTimeout(() => setCopiedPubkey(null), 2000);
    } catch {}
  }, []);

  const handleCloseDetail = useCallback(() => {
    setExpandedPubkey(null);
  }, []);

  const visiblePubkeys = useMemo(() => {
    const pks = filteredPubkeys();
    return [...pks].sort((a, b) => {
      const scoreA = trustCache.current.get(a);
      const scoreB = trustCache.current.get(b);
      const hasA = typeof scoreA === "number";
      const hasB = typeof scoreB === "number";
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;
      return sortDirection === "desc" ? scoreB! - scoreA! : scoreA! - scoreB!;
    });
  }, [filteredPubkeys, sortDirection, trustLoadedCount]);

  if (!user) return null;

  const truncatedNpub = user.npub.slice(0, 12) + "..." + user.npub.slice(-6);

  if (!calcDone && !grapeRankLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4" data-testid="page-network-gate">
        <div className="max-w-md w-full text-center">
          <div className="mb-6 flex justify-center">
            <BrainLogo size={64} className="text-indigo-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3" data-testid="text-network-gate-title">Your network is being calculated</h1>
          <p className="text-slate-400 mb-8 text-sm leading-relaxed" data-testid="text-network-gate-description">
            We're crunching the numbers on your social graph. Once the calculation completes, you'll be able to explore your full network here.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold transition-colors"
            onClick={() => navigate("/dashboard")}
            data-testid="button-back-to-dashboard"
          >
            <Home className="h-4 w-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-indigo-500/30 flex flex-col relative overflow-hidden"
      data-testid="page-network"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.28] pointer-events-none" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/30 blur-[130px]"
          style={{ animation: "networkBlobA 28s ease-in-out infinite" }}
        />
        <div
          className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/20 blur-[150px]"
          style={{ animation: "networkBlobB 32s ease-in-out infinite 2s" }}
        />
        <div
          className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-violet-100/15 blur-[110px]"
          style={{ animation: "networkBlobC 24s ease-in-out infinite 5s" }}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 h-[600px] overflow-hidden pointer-events-none z-0">
        <svg className="absolute inset-0 w-full h-full">
          {connectionPairs.map(([a, b], i) => (
              <line
                key={i}
                x1={`${floatingNodes[a].x}%`}
                y1={`${floatingNodes[a].y}%`}
                x2={`${floatingNodes[b].x}%`}
                y2={`${floatingNodes[b].y}%`}
                stroke="url(#networkLineGrad)"
                strokeWidth="0.5"
                strokeDasharray={connectionLineDashArrays[i]}
                strokeDashoffset={connectionLineDashArrays[i]}
                style={connectionLineStyles[i]}
              />
          ))}
          <defs>
            <linearGradient id="networkLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.14" />
            </linearGradient>
          </defs>
        </svg>

        {floatingNodes.map((node, i) => (
          <div
            key={node.id}
            className="absolute rounded-full bg-white/80 border border-slate-200/40"
            style={floatingNodeStyles[i]}
          />
        ))}
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[5]">
        {decorativeText.map((text, i) => (
            <div
              key={i}
              className="absolute text-xs font-mono text-indigo-400/50 select-none whitespace-nowrap"
              style={decorativeTextStyles[i]}
              data-testid={`text-network-bg-decorative-${i}`}
            >
              {text}
            </div>
        ))}
      </div>

      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-network">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="lg:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(true)}
                  className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
              <button
                type="button"
                className="flex items-center gap-2"
                onClick={() => navigate("/dashboard")}
                data-testid="button-brand"
              >
                <BrainLogo size={28} className="text-indigo-500" />
                <h1
                  className="text-lg sm:text-xl font-bold tracking-tight text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-logo"
                >
                  Brainstorm
                </h1>
              </button>
              <div className="hidden lg:flex gap-2" data-testid="row-nav-links">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-nav-dashboard"
                >
                  <Home className="h-4 w-4" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/5"
                  onClick={() => navigate("/search")}
                  data-testid="button-nav-search"
                >
                  <SearchIcon className="h-4 w-4" />
                  Search
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-white bg-white/10 no-default-hover-elevate no-default-active-elevate"
                  data-testid="button-nav-network"
                >
                  <Users className="h-4 w-4" />
                  Network
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5"
                    data-testid="button-user-menu"
                  >
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                      {user.picture ? (
                        <AvatarImage src={user.picture} alt={user.displayName || "Profile"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                        {user.displayName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:flex flex-col items-start mr-2">
                      <span className="text-sm font-bold text-white leading-none mb-0.5">
                        {user.displayName || "Anon"}
                      </span>
                      <span className="text-xs text-indigo-300 font-mono leading-none">
                        {user.npub.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-indigo-500/20">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-slate-900">{user.displayName || "Anonymous"}</p>
                      <p className="text-xs leading-none text-slate-500">{user.npub.slice(0, 16)}...</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-indigo-100" />
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                    onClick={handleLogout}
                    data-testid="dropdown-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            data-testid="overlay-mobile-menu"
          />
          <div
            className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm z-50 lg:hidden shadow-xl flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950"
            data-testid="panel-mobile-menu"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-[90px]" />
              <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-indigo-900/18 blur-[110px]" />
            </div>

            <div className="relative p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center">
                  <BrainLogo size={22} className="text-indigo-200" />
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-semibold tracking-[0.22em] uppercase text-indigo-300/80" data-testid="text-mobile-menu-kicker">Brainstorm</p>
                  <h2 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mobile-menu-title">Menu</h2>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-200/80 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                data-testid="button-close-mobile-menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative flex-1 flex flex-col overflow-y-auto py-4 px-3">
              <div className="space-y-2">
                <p className="px-3 text-xs font-semibold text-slate-300/70 uppercase tracking-[0.22em]">Navigation</p>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/dashboard"); }}
                  data-testid="button-mobile-nav-dashboard"
                >
                  <Home className="h-5 w-5 text-slate-200/80" />
                  Dashboard
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/search"); }}
                  data-testid="button-mobile-nav-search"
                >
                  <SearchIcon className="h-5 w-5 text-slate-200/80" />
                  Search
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-semibold text-white bg-white/10 border border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="button-mobile-nav-network"
                >
                  <Users className="h-5 w-5 text-indigo-200" />
                  Network
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/what-is-wot"); }}
                  data-testid="button-mobile-nav-wot"
                >
                  <BookOpen className="h-5 w-5 text-slate-200/80" />
                  What is WoT?
                </Button>
              </div>
              <div className="mt-auto pt-4 px-0">
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-base font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 rounded-2xl no-default-hover-elevate no-default-active-elevate"
                  onClick={() => { setMobileMenuOpen(false); navigate("/settings"); }}
                  data-testid="button-mobile-nav-settings"
                >
                  <SettingsIcon className="h-5 w-5 text-slate-200/80" />
                  Settings
                </Button>
              </div>
            </div>

            <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
              <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
                <Avatar className="h-10 w-10 border border-white/10">
                  {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "Profile"} /> : null}
                  <AvatarFallback className="bg-indigo-900 text-white font-bold">{user.displayName?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user.displayName || "Anonymous"}</p>
                  <p className="text-xs text-slate-300/70 font-mono truncate">{truncatedNpub}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-center gap-2 text-red-200 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-2xl"
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                data-testid="button-mobile-sign-out"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </>
      )}

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="space-y-8 animate-fade-up">
          <div className="text-left relative z-10 mb-8 pt-2" data-testid="section-network-header">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] bg-indigo-500/5 blur-[60px] rounded-full pointer-events-none" />
            <div className="flex flex-col items-start gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/60 border border-indigo-500/10 shadow-sm backdrop-blur-sm" data-testid="pill-network-kicker">
                <div className="w-1 h-1 rounded-full bg-indigo-500 shadow-[0_0_4px_#6366f1] animate-pulse" />
                <span className="text-xs font-bold tracking-[0.15em] text-indigo-900 uppercase">Network Explorer</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight relative" style={{ fontFamily: "var(--font-display)" }} data-testid="text-network-title">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800 bg-[length:200%_auto] animate-gradient-x drop-shadow-sm block">
                  Your Network
                </span>
              </h1>
              <p className="text-slate-500 text-xs md:text-sm max-w-xl leading-relaxed font-light" data-testid="text-network-subtitle">
                Browse and manage your social graph connections.
              </p>
            </div>
          </div>

          <Card className="bg-white/90 backdrop-blur-xl border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.07)] overflow-hidden rounded-xl relative" data-testid="card-network-filters">
            <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-indigo-800 to-indigo-500 animate-gradient-x" />

            <CardHeader className="bg-gradient-to-b from-indigo-500/15 to-white/60 border-b border-indigo-500/10 py-4 px-5">
              <div className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white border border-slate-100 shadow-sm text-indigo-800 ring-1 ring-slate-100">
                    <Filter className="h-4 w-4" />
                  </div>
                  <div className="bg-white/50 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-100 shadow-sm">
                    <CardTitle className="text-sm font-bold text-slate-800 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Network Filters</CardTitle>
                    <CardDescription className="text-slate-500 text-xs font-medium uppercase tracking-wide">Social Graph</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="toggle-verified-only">
                    <Switch
                      checked={verifiedOnly}
                      onCheckedChange={(checked) => { setVerifiedOnly(checked); setCurrentPage(1); }}
                      className="data-[state=checked]:bg-indigo-600"
                      data-testid="switch-verified-only"
                    />
                    <span className={`text-xs font-semibold transition-colors ${verifiedOnly ? "text-indigo-700" : "text-slate-400"}`}>
                      Verified
                    </span>
                  </label>
                  <div className="px-2 py-1 rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-900 border border-indigo-500/20 uppercase tracking-wider flex items-center gap-1.5 shrink-0" data-testid="badge-nostr-network">
                    <img src="/nostr-ostrich.gif" alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
                    <span>NOSTR</span>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-5 bg-white/60 space-y-3 sm:space-y-4">
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-x-visible sm:flex-wrap pb-2 sm:pb-0 scrollbar-thin" data-testid="row-group-filters">
                {groups.map((group) => {
                  const count = getGroupCount(group.key);
                  const totalCount = getGroupPubkeys(group.key).length;
                  const isActive = activeGroup === group.key;
                  const showVerifiedLabel = verifiedOnly && isVerifiableGroup(group.key);
                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => { setActiveGroup(group.key); setCurrentPage(1); }}
                      className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-medium whitespace-nowrap transition-all shrink-0 sm:shrink ${
                        isActive
                          ? "bg-indigo-800 text-white border border-indigo-800"
                          : "bg-white/60 border border-slate-200/60 text-slate-600 hover:bg-white hover:border-slate-300"
                      }`}
                      data-testid={`button-filter-${group.key}`}
                    >
                      <group.Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 ${isActive ? "text-white" : group.color}`} />
                      <span className="hidden sm:inline">{group.label}</span>
                      <span className="sm:hidden">{group.shortLabel}</span>
                      <span className={`text-[10px] sm:text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                        isActive
                          ? "bg-white/20 text-white"
                          : `${group.bgColor} ${group.color} ${group.borderColor} border`
                      }`}>
                        {showVerifiedLabel ? (
                          <>
                            <span className="sm:hidden">{count}</span>
                            <span className="hidden sm:inline">{count}/{totalCount}</span>
                          </>
                        ) : count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-thin" data-testid="row-trust-filters">
                <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider self-center mr-0.5 sm:mr-1 shrink-0">Trust</span>
                {([
                  { key: "all" as TrustTier, label: "All", shortLabel: "All", icon: null, ringFill: 0 },
                  { key: "high" as TrustTier, label: "Highly Trusted", shortLabel: "High", icon: "text-emerald-500", ringFill: 0.9 },
                  { key: "medium" as TrustTier, label: "Trusted", shortLabel: "Med", icon: "text-indigo-500", ringFill: 0.65 },
                  { key: "neutral" as TrustTier, label: "Neutral", shortLabel: "Neutral", icon: "text-slate-400", ringFill: 0.37 },
                  { key: "low" as TrustTier, label: "Low Trust", shortLabel: "Low", icon: "text-amber-500", ringFill: 0.12 },
                  { key: "flagged" as TrustTier, label: "Unverified", shortLabel: "Unverified", icon: "text-red-500", ringFill: 0 },
                ] as const).map((tier) => {
                  const isActive = trustFilter === tier.key;
                  return (
                    <button
                      key={tier.key}
                      type="button"
                      onClick={() => { setTrustFilter(tier.key); setCurrentPage(1); }}
                      className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                        isActive
                          ? "bg-indigo-800 text-white border border-indigo-800"
                          : "bg-white/60 border border-slate-200/60 text-slate-500 hover:bg-white hover:border-slate-300"
                      }`}
                      data-testid={`button-trust-filter-${tier.key}`}
                    >
                      {tier.key === "flagged" ? (
                        <svg className={`h-3 w-3 shrink-0 ${isActive ? "text-white" : "text-red-500"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                          <line x1="4" y1="22" x2="4" y2="15" />
                        </svg>
                      ) : tier.icon && (
                        <svg className={`h-3 w-3 shrink-0 ${isActive ? "text-white" : tier.icon}`} viewBox="0 0 44 44">
                          <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.3" />
                          <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                            style={{ strokeDasharray: `${2 * Math.PI * 18}`, strokeDashoffset: `${2 * Math.PI * 18 * (1 - tier.ringFill)}`, transform: "rotate(-90deg)", transformOrigin: "center" }} />
                        </svg>
                      )}
                      <span className="hidden sm:inline">{tier.label}</span>
                      <span className="sm:hidden">{tier.shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                <div className="relative group/input flex-1">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-indigo-800 rounded-lg opacity-20 group-hover/input:opacity-50 blur transition duration-500" />
                  <div className="relative flex items-center">
                    <SearchIcon className="absolute left-3 h-4 w-4 text-slate-400 z-10" />
                    <Input
                      placeholder="Search by name or npub..."
                      className="relative bg-white/90 backdrop-blur-sm border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)] text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-lg transition-all text-sm shadow-sm pl-9"
                      value={searchFilter}
                      onChange={(e) => { setSearchFilter(e.target.value); setCurrentPage(1); }}
                      data-testid="input-network-search"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/80 border border-slate-200/60 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors shrink-0"
                    onClick={() => { setSortDirection(d => d === "desc" ? "asc" : "desc"); setCurrentPage(1); }}
                    data-testid="button-sort-trust"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span>Trust {sortDirection === "desc" ? "↓" : "↑"}</span>
                  </button>
                  <div className="flex items-center bg-white/80 border border-slate-200/60 rounded-lg p-0.5 shrink-0" data-testid="row-view-toggle">
                    <button
                      type="button"
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-indigo-800 text-white" : "text-slate-400"}`}
                      onClick={() => setViewMode("grid")}
                      data-testid="button-view-grid"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-indigo-800 text-white" : "text-slate-400"}`}
                      onClick={() => setViewMode("list")}
                      data-testid="button-view-list"
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="grid-network-skeleton">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-xl p-4 animate-pulse"
                  data-testid={`skeleton-card-${i}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-200 rounded w-24" />
                      <div className="h-2 bg-slate-100 rounded w-32" />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1">
                    <div className="h-4 bg-slate-100 rounded w-14" />
                    <div className="h-4 bg-slate-100 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : visiblePubkeys.length === 0 ? (
            <Card className="bg-white border-slate-200 shadow-xl rounded-xl overflow-hidden" data-testid="card-network-empty">
              <div className="p-8 flex flex-col items-center text-center">
                <div className="h-14 w-14 rounded-2xl border border-slate-200 bg-slate-50 text-indigo-800 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-network-empty-title">
                  {searchFilter || trustFilter !== "all" ? "No matches found" : "No contacts yet"}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-md" data-testid="text-network-empty-body">
                  {searchFilter || trustFilter !== "all"
                    ? "Try a different search term, trust score range, or group filter."
                    : "Your network data will appear here once your social graph is populated."}
                </p>
              </div>
            </Card>
          ) : (
            <>
              {(() => {
                const totalPages = Math.ceil(visiblePubkeys.length / PAGE_SIZE);
                const safePage = Math.min(currentPage, totalPages || 1);
                const startIdx = (safePage - 1) * PAGE_SIZE;
                const pageItems = visiblePubkeys.slice(startIdx, startIdx + PAGE_SIZE);

                return (
                  <>
                    <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"} data-testid="grid-network-profiles">
                      {pageItems.map((pk) => (
                        <div key={pk} className={viewMode === "grid" ? "contents" : ""}>
                          <NetworkProfileCard
                            pk={pk}
                            profile={profileCache.current.get(pk)}
                            trustScore={trustCache.current.get(pk)}
                            graphData={graphDataCache.current.get(pk)}
                            detail={expandedPubkey === pk ? detailCache.current.get(pk) : undefined}
                            memberGroups={getPubkeyGroups(pk)}
                            viewMode={viewMode}
                            isExpanded={expandedPubkey === pk}
                            isCopied={copiedPubkey === pk}
                            isProfileLoaded={profileCache.current.has(pk)}
                            expandedLoading={expandedLoading}
                            activeGroup={activeGroup}
                            trustCacheRef={trustCache}
                            onToggleExpanded={toggleExpanded}
                            onCopyNpub={handleCopyNpub}
                            onCloseDetail={handleCloseDetail}
                            onNavigate={navigate}
                            getPubkeyGroups={getPubkeyGroups}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-4" data-testid="row-pagination">
                      <span className="text-xs text-slate-500">
                        {startIdx + 1}&ndash;{Math.min(startIdx + PAGE_SIZE, visiblePubkeys.length)} of {visiblePubkeys.length}
                      </span>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={safePage <= 1}
                            onClick={() => { setCurrentPage(safePage - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                            data-testid="button-page-prev"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Previous
                          </Button>
                          <span className="text-xs font-medium text-slate-600 tabular-nums px-2" data-testid="text-page-indicator">
                            {safePage} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            disabled={safePage >= totalPages}
                            onClick={() => { setCurrentPage(safePage + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                            data-testid="button-page-next"
                          >
                            Next
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      </main>

      <style>{`
        @keyframes networkBlobA {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(15px) scale(1.03); }
        }
        @keyframes networkBlobB {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(-20px) scale(1.05); }
        }
        @keyframes networkBlobC {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-25px); opacity: 0.35; }
        }
        @keyframes networkLineDraw {
          0% { stroke-dashoffset: var(--dash); opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0.18; }
        }
        @keyframes networkLinePulse {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 0.2; }
        }
        @keyframes networkNodePop {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 0.25; transform: scale(1.15); }
          100% { opacity: 0.18; transform: scale(1); }
        }
        @keyframes networkNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-12px); opacity: 0.25; }
        }
        @keyframes networkCalcFloat {
          0%, 100% { opacity: 0; transform: translateY(0); }
          20%, 80% { opacity: 0.45; transform: translateY(-6px); }
        }
      `}</style>
      <Footer />
    </div>
  );
}
