import { useState, useEffect, useRef, useMemo, useCallback, startTransition, memo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { GlossBackground } from "@/components/GlossBackground";
import { useTrustPresetSync } from "@/hooks/useTrustPresetSync";
import { AdminBadge } from "@/components/AdminBadge";
import { useLocation, useRoute } from "wouter";
import { nip19 } from "nostr-tools";
import { ProfileRecentPosts } from "@/components/profile/ProfileRecentPosts";
import {
  Home,
  LogOut,
  X,
  Loader2,
  Copy,
  Check,
  Settings as SettingsIcon,
  BookOpen,
  ArrowLeft,
  ArrowRight,
  ArrowLeftRight,
  ChevronDown,
  Search as SearchIcon,
  User,
  ArrowUpDown,
  Filter,
  ShieldCheck,
  Shield,
  ShieldAlert,
  ShieldX,
  UserPlus,
  UserCheck,
  UserMinus,
  VolumeX,
  Volume2,
  Flag,
  MoreVertical,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Share2,
  Globe,
  Eye,
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";
import { isFlaggedByReporters } from "@/lib/trustFlags";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { ZapModal } from "@/components/ZapModal";
import { FlashIcon } from "@/components/FlashIcon";
import { WotStrengthCard } from "@/components/WotStrengthCard";
import { DEFAULT_BANNER_CLASS, DEFAULT_BANNER_SRC } from "@/lib/profileDefaults";
import { copyToClipboard } from "@/lib/clipboard";
import { REPORT_TYPE_BADGE_COLORS, formatReportTime } from "@/lib/reportMeta";
import { AgentIcon } from "@/components/AgentIcon";
import { getCurrentAssistantPubkey } from "@/lib/assistantStorage";
import { FEATURES } from "@/config/featureFlags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProfile, fetchProfiles, eventStore, fetchReportsForPubkey, fetchReportsByPubkey, fetchMuteListTimestamp, type ReportMetadata, type MuteMetadata } from "@/services/nostr";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { getProfileContent, isValidProfile } from "applesauce-core/helpers/profile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useSelfConnections, flattenConnections } from "@/hooks/useSelf";
import { getProfileSeed, setProfileSeed, clearProfileSeed, consumeStoredSearchSeed, type ProfileSeed } from "@/lib/profileSeed";
import { toPubkeys, toInfluenceMap, type GraphEntry } from "../services/graphHelpers";
import {
  expandProfileCache,
  expandProfileAttempted,
  expandTrustCache,
  reportMetadataCache,
  muteMetadataCache,
} from "@/services/profilePageCache";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import { DegreeChip } from "@/components/DegreeChip";
import { SignInButton } from "@/components/SignInButton";
import { useActivePerspective, type ActivePerspective } from "@/hooks/useActivePerspective";
import { useSocialActions } from "@/hooks/useSocialActions";
import { fetchContactList, getFollowedPubkeys, fetchMyReport, type MyReport } from "@/services/socialActions";
import { useToast } from "@/hooks/use-toast";
import { useHasSession } from "@/hooks/useHasSession";
import { TIER_LABELS } from "@/services/trustThreshold";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import { useTierRing } from "@/components/score/VerificationCoin";

interface AdminHistoryItem {
  created_at: string;
  updated_at: string;
  private_id: number;
  status: string;
  ta_status: string | null;
  internal_publication_status: string | null;
  error: { code: string; message: string | null } | null;
  count_values: string | null;
  password: string | null;
  algorithm: string | null;
  parameters: string | null;
  how_many_others_with_priority: number;
  pubkey: string;
  trigger_source: string | null;
}

const FollowersIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2.5 19.5c0-3.5 2.8-6 6.5-6s6.5 2.5 6.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="17.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.6" />
    <path d="M17.5 13c2.2 0 4 1.5 4.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
  </svg>
);

const FollowingIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 20c0-3.5 3-6.5 7-6.5s7 3 7 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 4l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.7" />
    <path d="M12 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
  </svg>
);

const MutedByIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 10v4a2 2 0 002 2h2l5 4V6L7 10H5a2 2 0 00-2 0z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M17 9l-5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 9l5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ReportedByIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 3L4 9v11a1 1 0 001 1h14a1 1 0 001-1V9l-8-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06" />
    <path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="16" r="1" fill="currentColor" />
  </svg>
);

const MutingIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M3 10v4a2 2 0 002 2h2l5 4V6L7 10H5a2 2 0 00-2 0z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M16 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ReportingIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M5 4h10l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M14 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 11v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="12" cy="17.5" r="0.75" fill="currentColor" />
  </svg>
);

const FlaggedIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M5 4v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5 4h10l-3 4 3 4H5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.1" />
  </svg>
);

const MutualIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="16" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 19c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 19c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
    <path d="M10 14l2-1.5 2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5" />
  </svg>
);

const SharedConnectionIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="18" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1" fill="currentColor" fillOpacity="0.4" />
    <path d="M6 9.5V6a2 2 0 012-2h8a2 2 0 012 2v3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4" />
    <path d="M6 14.5V18a2 2 0 002 2h8a2 2 0 002-2v-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.4" />
  </svg>
);



function AdminHistoryStatusBadge({ value, type }: { value: string | null; type: "status" | "ta" | "pub" }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const lower = value.toLowerCase();
  const colors = lower === "success" || lower === "done" || lower === "published"
    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/25"
    : lower === "failure" || lower === "failed" || lower === "error"
    ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/25"
    : lower === "pending" || lower === "queued" || lower === "in_progress"
    ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25"
    : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800";
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors}`}>{value}</span>;
}

// Why this run was queued: manual (user asked), scheduled (tier auto-scheduler),
// admin (admin action), periodic (cron). Colored distinctly from status badges.
function AdminHistoryTriggerBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const lower = value.toLowerCase();
  const colors = lower === "scheduled"
    ? "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/20 dark:border-brand-primary/25"
    : lower === "periodic"
    ? "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/25"
    : lower === "admin"
    ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/25"
    : "bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800";
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${colors}`}>{value}</span>;
}

type AdminHistoryFailureStage = "calculation" | "ta" | "publication";

const ADMIN_HISTORY_FAILURE_HINTS: Record<AdminHistoryFailureStage, { label: string; hint: string }> = {
  calculation: {
    label: "Calculation",
    hint: "Common causes: user has too few trusted follows for graperank to converge, invalid algorithm parameters, or a calculation timeout. Re-trigger first; if it fails again, check server logs for the algorithm worker.",
  },
  ta: {
    label: "Trust Attestation",
    hint: "Common causes: TA pubkey unreachable or not configured. Check relay status and TA service health.",
  },
  publication: {
    label: "Publication",
    hint: "Common causes: relay outage, signing failure, or rate limiting. Check that the publisher is reaching at least one configured relay.",
  },
};

function AdminHistoryRow({ item, idx }: { item: AdminHistoryItem; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const userTimeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const parseServerDate = (d: string): Date => {
    const trimmed = d.trim();
    const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
    const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
    return new Date(hasTz ? normalized : `${normalized}Z`);
  };
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      const date = parseServerDate(d);
      if (isNaN(date.getTime())) return d;
      return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: userTimeZone,
      });
    } catch { return d; }
  };
  const fmtDateFull = (d: string | null) => {
    if (!d) return "—";
    try {
      const date = parseServerDate(d);
      if (isNaN(date.getTime())) return d;
      return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
        timeZone: userTimeZone,
      });
    } catch { return d; }
  };
  const statusFailed = (item.status || "").toLowerCase() === "failure";
  const taFailed = (item.ta_status || "").toLowerCase() === "failure";
  const pubLower = (item.internal_publication_status || "").toLowerCase();
  const pubFailed = pubLower === "failure" || pubLower === "failed";
  const failureStage: AdminHistoryFailureStage | null = statusFailed
    ? "calculation"
    : taFailed
    ? "ta"
    : pubFailed
    ? "publication"
    : null;
  const failureInfo = failureStage ? ADMIN_HISTORY_FAILURE_HINTS[failureStage] : null;
  const errorText = item.error?.message?.trim() || "";
  return (
    <>
      <tr
        className={`border-b border-amber-100/40 dark:border-amber-500/20 cursor-pointer hover:bg-amber-50/40 dark:hover:bg-amber-500/10 transition-colors ${idx % 2 === 0 ? "bg-white/40 dark:bg-slate-900/40" : "bg-amber-50/20 dark:bg-amber-500/[0.06]"}`}
        onClick={() => setExpanded(prev => !prev)}
        data-testid={`row-admin-history-${item.private_id || idx}`}
      >
        <td className="px-2 py-2 font-mono text-slate-600 dark:text-slate-300">{item.private_id}</td>
        <td className="px-2 py-2"><AdminHistoryTriggerBadge value={item.trigger_source} /></td>
        <td className="px-2 py-2"><AdminHistoryStatusBadge value={item.status} type="status" /></td>
        <td className="px-2 py-2"><AdminHistoryStatusBadge value={item.ta_status} type="ta" /></td>
        <td className="px-2 py-2"><AdminHistoryStatusBadge value={item.internal_publication_status} type="pub" /></td>
        <td className="px-2 py-2 font-mono text-slate-600 dark:text-slate-300">{item.algorithm || "—"}</td>
        <td className="px-2 py-2 text-center text-slate-600 dark:text-slate-300">{item.how_many_others_with_priority}</td>
        <td className="px-2 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap" title={fmtDateFull(item.created_at)}>{fmtDate(item.created_at)}</td>
        <td className="px-2 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap" title={fmtDateFull(item.updated_at)}>{fmtDate(item.updated_at)}</td>
      </tr>
      {expanded && (
        <tr className="bg-amber-50/30 dark:bg-amber-500/[0.06]">
          <td colSpan={9} className="px-4 py-3">
            {failureInfo && (
              <div
                className="mb-3 rounded border border-red-200 dark:border-red-500/25 bg-red-50/60 dark:bg-red-500/10 px-3 py-2"
                data-testid={`panel-failure-hint-${item.private_id || idx}`}
              >
                {errorText ? (
                  <p className="text-[11px] text-red-700 dark:text-red-300 font-mono break-all">{errorText}</p>
                ) : (
                  <p className="text-[11px] text-red-600/80 dark:text-red-400/80 italic">No error details captured — check server logs.</p>
                )}
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-snug mt-1">
                  <span className="font-semibold">Where to look · {failureInfo.label}:</span> {failureInfo.hint}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px]">
              {item.error?.message && (
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Error</span>
                  <p className="text-slate-700 dark:text-slate-200 font-mono mt-0.5 break-all">{item.error.message}</p>
                </div>
              )}
              {item.count_values && (
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Count Values</span>
                  <p className="text-slate-700 dark:text-slate-200 font-mono mt-0.5 break-all">{item.count_values}</p>
                </div>
              )}
              {item.parameters && (
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Parameters</span>
                  <p className="text-slate-700 dark:text-slate-200 font-mono mt-0.5 break-all">{item.parameters}</p>
                </div>
              )}
              {item.password && (
                <div>
                  <span className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Password</span>
                  <p className="text-slate-700 dark:text-slate-200 font-mono mt-0.5 break-all">{item.password}</p>
                </div>
              )}
              <div>
                <span className="font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Pubkey</span>
                <p className="text-slate-700 dark:text-slate-200 font-mono mt-0.5 break-all">{item.pubkey}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface ProfileResultData {
  influence?: number;
  followed_by?: GraphEntry[] | number;
  following?: GraphEntry[] | number;
  muted_by?: GraphEntry[] | number;
  reported_by?: GraphEntry[] | number;
  muting?: GraphEntry[] | number;
  reporting?: GraphEntry[] | number;
  hops?: number;
  personalizedPageRank?: number;
  influenceRank?: number;
  followerInput?: number;
  muterInput?: number;
  reporterInput?: number;
  verifiedFollowerCount?: number;
  verifiedMuterCount?: number;
  verifiedReporterCount?: number;
  latestContentEventCreatedAt?: number;
  whitelisted?: boolean;
  blacklisted?: boolean;
}

type ProfileSections = Partial<Record<string, GraphEntry[]>>;

const getSection = (data: ProfileResultData | null | undefined, key: string): GraphEntry[] | undefined => {
  if (!data) return undefined;
  return (data as unknown as ProfileSections)[key];
};

type SortMode = "trust-desc" | "trust-asc" | "name-asc" | "name-desc";
type FilterMode = "all" | "verified" | "high" | "trusted" | "neutral" | "low" | "unverified";
type ReportTypeFilter = "all" | "spam" | "impersonation" | "nudity" | "illegal" | "profanity" | "other" | "unavailable";

interface GroupDef { key: string; label: string; colors: string }

const CONNECTION_GROUP_KEYS = new Set([
  "followed_by",
  "following",
  "mutual",
  "shared_followers",
  "shared_following",
]);

type OwnerLink = "mutual" | "follower" | "following";
type YouLink = "mutual_with_you" | "follows_you" | "you_follow";

function deriveConnectionClusters(groupKeys: Set<string>): { owner: OwnerLink | null; you: YouLink | null } {
  const hasMutual = groupKeys.has("mutual");
  const hasFollowedBy = groupKeys.has("followed_by");
  const hasFollowing = groupKeys.has("following");
  const owner: OwnerLink | null = hasMutual
    ? "mutual"
    : hasFollowedBy
      ? "follower"
      : hasFollowing
        ? "following"
        : null;

  const hasSharedFollower = groupKeys.has("shared_followers");
  const hasSharedFollowing = groupKeys.has("shared_following");
  const you: YouLink | null = hasSharedFollower && hasSharedFollowing
    ? "mutual_with_you"
    : hasSharedFollower
      ? "follows_you"
      : hasSharedFollowing
        ? "you_follow"
        : null;

  return { owner, you };
}

const OWNER_PILL_META: Record<OwnerLink, { label: string; Icon: typeof ArrowLeft }> = {
  mutual: { label: "Mutual", Icon: ArrowLeftRight },
  follower: { label: "Follower", Icon: ArrowLeft },
  following: { label: "Following", Icon: ArrowRight },
};

const YOU_PILL_META: Record<YouLink, { label: string; Icon: typeof ArrowLeft }> = {
  mutual_with_you: { label: "Mutual with you", Icon: ArrowLeftRight },
  follows_you: { label: "Follows you", Icon: ArrowLeft },
  you_follow: { label: "You follow", Icon: ArrowRight },
};

const GROUP_DEFS: GroupDef[] = [
  { key: "followed_by", label: "Follower", colors: "bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-100 dark:border-blue-500/25" },
  { key: "following", label: "Following", colors: "bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-100 dark:border-blue-500/25" },
  { key: "mutual", label: "Mutual", colors: "bg-teal-50 dark:bg-teal-500/10 text-teal-500 dark:text-teal-400 border-teal-100 dark:border-teal-500/25" },
  { key: "shared_followers", label: "Shared Follower", colors: "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/15 dark:border-brand-primary/25" },
  { key: "shared_following", label: "Shared Following", colors: "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/15 dark:border-brand-primary/25" },
  { key: "muted_by", label: "Muted By", colors: "bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-200 dark:border-amber-500/25" },
  { key: "muting", label: "Muting", colors: "bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-200 dark:border-amber-500/25" },
  { key: "reported_by", label: "Reported", colors: "bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 border-red-200 dark:border-red-500/25" },
  { key: "reporting", label: "Reporting", colors: "bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800" },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "trust-desc", label: "Trust \u2193" },
  { value: "trust-asc", label: "Trust \u2191" },
  { value: "name-asc", label: "A\u2013Z" },
  { value: "name-desc", label: "Z\u2013A" },
];

const FILTER_OPTIONS: { value: FilterMode; label: string; color: string }[] = [
  { value: "all", label: "All", color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" },
  { value: "verified", label: "Verified", color: "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link" },
  { value: "high", label: TIER_LABELS.high, color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { value: "trusted", label: TIER_LABELS.trusted, color: "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { value: "neutral", label: "Neutral", color: "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link" },
  { value: "low", label: TIER_LABELS.low, color: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { value: "unverified", label: "Unverified", color: "bg-zinc-50 dark:bg-zinc-500/10 text-zinc-500 dark:text-zinc-400" },
];

const REPORT_TYPE_OPTIONS: { value: ReportTypeFilter; label: string; dotColor: string }[] = [
  { value: "all", label: "All Types", dotColor: "bg-slate-300 dark:bg-slate-700" },
  { value: "spam", label: "Spam", dotColor: "bg-amber-500" },
  { value: "impersonation", label: "Impersonation", dotColor: "bg-red-500" },
  { value: "nudity", label: "Nudity", dotColor: "bg-pink-500" },
  { value: "illegal", label: "Illegal", dotColor: "bg-red-700" },
  { value: "profanity", label: "Profanity", dotColor: "bg-orange-500" },
  { value: "other", label: "Other", dotColor: "bg-slate-400 dark:bg-slate-600" },
  { value: "unavailable", label: "Unavailable", dotColor: "bg-slate-300 dark:bg-slate-700" },
];

const SECTION_BORDER_COLORS: Record<string, string> = {
  followed_by: "border-blue-300 dark:border-blue-500/30",
  following: "border-blue-300 dark:border-blue-500/30",
  mutual: "border-teal-300 dark:border-teal-500/30",
  shared_followers: "border-brand-primary/25 dark:border-brand-primary/[0.3]",
  shared_following: "border-brand-primary/25 dark:border-brand-primary/[0.3]",
  muted_by: "border-amber-300 dark:border-amber-500/30",
  reported_by: "border-red-300 dark:border-red-500/30",
  muting: "border-amber-200 dark:border-amber-500/25",
  reporting: "border-slate-300 dark:border-slate-700",
};

// Backend GR bucket name → the display key TIER_DISPLAY_CONFIG uses. The page
// has no dedicated flagged slice, so flagged folds into unverified (same as
// `grTierCountsToUI`).
const GR_TIER_TO_UI: Record<string, string> = {
  high: "high",
  medium_high: "trusted",
  medium: "neutral",
  medium_low: "low",
  low: "unverified",
  low_and_reported_by_2_or_more_trusted_pubkeys: "unverified",
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

function getTrustForPkFromMaps(pk: string, sectionInfluenceMaps: Record<string, Map<string, number | null>>): number {
  const cached = expandTrustCache.get(pk);
  if (cached !== undefined && cached !== null) return cached;
  for (const groupKey of ["followed_by", "following", "muted_by", "reported_by", "muting", "reporting"] as const) {
    const val = sectionInfluenceMaps[groupKey]?.get(pk);
    if (val !== undefined && val !== null) return val;
  }
  return -1;
}

function computeProcessedPubkeys(
  key: string,
  pubkeys: string[],
  filter: FilterMode,
  sort: SortMode,
  search: string,
  reportTypeFilter: ReportTypeFilter,
  sectionInfluenceMaps: Record<string, Map<string, number | null>>,
  getReportForPubkey: (sectionKey: string, pubkey: string) => ReportMetadata | undefined,
): string[] {
  // tier / verified filtering is applied server-side via /connections query
  // params, so the items reaching us already match `filter`.
  let filtered = pubkeys;
  if (reportTypeFilter !== "all" && (key === "reported_by" || key === "reporting")) {
    filtered = filtered.filter(pk => {
      const report = getReportForPubkey(key, pk);
      if (reportTypeFilter === "unavailable") return !report;
      return report?.reportType === reportTypeFilter;
    });
  }
  const trimmed = search.toLowerCase().trim();
  if (trimmed) {
    filtered = filtered.filter(pk => {
      const profile = expandProfileCache.get(pk);
      const name = (profile?.display_name || profile?.name || "").toLowerCase();
      const nip05 = (profile?.nip05 || "").toLowerCase();
      if (name.includes(trimmed) || nip05.includes(trimmed)) return true;
      if (trimmed.startsWith("npub")) {
        try {
          const npub = nip19.npubEncode(pk).toLowerCase();
          return npub.includes(trimmed);
        } catch { return false; }
      }
      return false;
    });
  }
  const sorted = [...filtered];
  if (sort === "trust-desc" || sort === "trust-asc") {
    sorted.sort((a, b) => {
      const sa = getTrustForPkFromMaps(a, sectionInfluenceMaps);
      const sb = getTrustForPkFromMaps(b, sectionInfluenceMaps);
      return sort === "trust-desc" ? sb - sa : sa - sb;
    });
  } else {
    sorted.sort((a, b) => {
      const pa = expandProfileCache.get(a);
      const pb = expandProfileCache.get(b);
      const na = (pa?.display_name || pa?.name || "").toLowerCase();
      const nb = (pb?.display_name || pb?.name || "").toLowerCase();
      if (!na && !nb) return 0;
      if (!na) return 1;
      if (!nb) return -1;
      return sort === "name-asc" ? na.localeCompare(nb) : nb.localeCompare(na);
    });
  }
  return sorted;
}

interface ExpandedPanelProps {
  sectionKey: string;
  pubkeys: string[];
  filter: FilterMode;
  sort: SortMode;
  search: string;
  reportTypeFilter: ReportTypeFilter;
  visibleCount: number;
  sectionTotal?: number; // Server-truth total for this section/filter, if known.
  filterDropdownOpen: boolean;
  reportTypeDropdownOpen: boolean;
  reportMetaLoading: boolean;
  sectionInfluenceMaps: Record<string, Map<string, number | null>>;
  groupsByPubkey: Map<string, GroupDef[]>;
  getReportForPubkey: (sectionKey: string, pubkey: string) => ReportMetadata | undefined;
  formatRelativeTime: (timestamp: number) => string;
  navigateToProfile: (pk: string) => void;
  onSetSort: (k: string, v: SortMode) => void;
  onSetFilter: (k: string, v: FilterMode) => void;
  onSetSearch: (k: string, v: string) => void;
  onSetReportTypeFilter: (k: string, v: ReportTypeFilter) => void;
  onSetVisibleCount: (k: string, n: number) => void;
  onToggleFilterDropdown: (k: string, open: boolean) => void;
  onToggleReportTypeDropdown: (k: string, open: boolean) => void;
  onShowMore: (k: string, processed: string[], currentVisible: number) => void;
  onEnsureVisibleFetched: (k: string, visiblePubkeys: string[]) => void;
  renderToken: number;
}

const ExpandedPanel = memo(function ExpandedPanel(props: ExpandedPanelProps) {
  const tierRing = useTierRing();
  const [granularity] = useTierGranularity();
  // Decision 7: under Simple the menu offers the three buckets' worth of choices
  // — All / Verified / Unknown — not five shades it never draws.
  const visibleFilterOptions =
    granularity === "simple"
      ? FILTER_OPTIONS.filter((o) => o.value === "all" || o.value === "verified" || o.value === "unverified").map((o) =>
          o.value === "unverified" ? { ...o, label: "Unknown" } : o,
        )
      : FILTER_OPTIONS;
  const {
    sectionKey: key, pubkeys, filter, sort, search, reportTypeFilter, visibleCount,
    sectionTotal,
    filterDropdownOpen, reportTypeDropdownOpen, reportMetaLoading,
    sectionInfluenceMaps, groupsByPubkey, getReportForPubkey, formatRelativeTime,
    navigateToProfile, onSetSort, onSetFilter, onSetSearch, onSetReportTypeFilter,
    onSetVisibleCount, onToggleFilterDropdown, onToggleReportTypeDropdown, onShowMore,
    onEnsureVisibleFetched, renderToken,
  } = props;

  const debouncedSearch = useDebouncedValue(search, 250);
  const processed = useMemo(
    () => computeProcessedPubkeys(key, pubkeys, filter, sort, debouncedSearch, reportTypeFilter, sectionInfluenceMaps, getReportForPubkey),
    // renderToken in deps so name-sort updates as profiles stream in
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, pubkeys, filter, sort, debouncedSearch, reportTypeFilter, sectionInfluenceMaps, getReportForPubkey, renderToken],
  );

  const isReportFilterSection = key === "reported_by" || key === "reporting";
  const isFiltered = filter !== "all" || debouncedSearch.trim().length > 0 || reportTypeFilter !== "all";
  const visiblePubkeys = useMemo(() => processed.slice(0, visibleCount), [processed, visibleCount]);
  const borderColor = SECTION_BORDER_COLORS[key] || "border-slate-300 dark:border-slate-700";

  useEffect(() => {
    if (visiblePubkeys.length === 0) return;
    const needsFetch = visiblePubkeys.some(pk => !expandProfileCache.has(pk) || !expandTrustCache.has(pk));
    if (needsFetch) onEnsureVisibleFetched(key, visiblePubkeys);
  }, [key, visiblePubkeys, onEnsureVisibleFetched]);

  return (
    <div className="border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
      <div className="px-3 py-2 space-y-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 mr-1">
            <ArrowUpDown className="h-3 w-3 text-slate-400 dark:text-slate-500" />
            <div className="flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-800">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={(e) => { e.stopPropagation(); onSetSort(key, opt.value); }}
                  className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${sort === opt.value ? "bg-brand-primary text-white" : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"}`}
                  data-testid={`sort-${opt.value}-${key}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFilterDropdown(key, !filterDropdownOpen); }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${filter !== "all" ? "border-brand-primary/25 dark:border-brand-primary/[0.3] bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"}`}
              data-testid={`filter-toggle-${key}`}
            >
              <Filter className="h-3 w-3" />
              {filter !== "all" ? visibleFilterOptions.find(f => f.value === filter)?.label : "Filter"}
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {filterDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onToggleFilterDropdown(key, false); }} />
                <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 py-1 min-w-[140px]">
                  {visibleFilterOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetFilter(key, opt.value);
                        onSetVisibleCount(key, 10);
                        onToggleFilterDropdown(key, false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors flex items-center gap-2 ${filter === opt.value ? "bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"}`}
                      data-testid={`filter-${opt.value}-${key}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${opt.value === "all" ? "bg-slate-300 dark:bg-slate-700" : opt.value === "verified" ? "bg-brand-primary" : opt.value === "high" ? "bg-emerald-500" : opt.value === "trusted" ? "bg-sky-400" : opt.value === "neutral" ? "bg-brand-primary" : opt.value === "low" ? "bg-amber-400" : "bg-slate-400 dark:bg-slate-600"}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {isReportFilterSection && (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleReportTypeDropdown(key, !reportTypeDropdownOpen); }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-medium transition-colors ${reportTypeFilter !== "all" ? "border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"}`}
                data-testid={`report-type-filter-toggle-${key}`}
              >
                <span className="w-2 h-2 rounded-full bg-current opacity-50" />
                {reportTypeFilter !== "all" ? reportTypeFilter : "Type"}
                <ChevronDown className="h-2.5 w-2.5" />
              </button>
              {reportTypeDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onToggleReportTypeDropdown(key, false); }} />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 py-1 min-w-[140px]">
                    {REPORT_TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetReportTypeFilter(key, opt.value);
                          onSetVisibleCount(key, 10);
                          onToggleReportTypeDropdown(key, false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors flex items-center gap-2 ${reportTypeFilter === opt.value ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900"}`}
                        data-testid={`report-type-filter-${opt.value}-${key}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${opt.dotColor}`} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {reportMetaLoading && (
            <span className="flex items-center gap-1 text-[10px] text-brand-link ml-auto">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              <span>fetching relay data</span>
            </span>
          )}
          {isFiltered && (
            <span className={`text-[10px] text-slate-400 dark:text-slate-500 ${reportMetaLoading ? "" : "ml-auto"}`} data-testid={`filter-count-${key}`}>
              {processed.length} of {pubkeys.length}
            </span>
          )}
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { onSetSearch(key, e.target.value); onSetVisibleCount(key, 10); }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Search by name or npub..."
            className="w-full pl-7 pr-7 py-1 text-[11px] rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:border-brand-primary/25 focus:ring-1 focus:ring-brand-primary/20"
            data-testid={`search-input-${key}`}
          />
          {search && (
            <button
              onClick={(e) => { e.stopPropagation(); onSetSearch(key, ""); onSetVisibleCount(key, 10); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              data-testid={`search-clear-${key}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className={`border-l-2 ${borderColor} ml-4`}>
        {visiblePubkeys.map(pk => {
          const profile = expandProfileCache.get(pk);
          const trustScore = expandTrustCache.get(pk);
          const displayName = profile?.display_name || profile?.name || nip19.npubEncode(pk).slice(0, 12) + "...";
          const overlappingGroups = (groupsByPubkey.get(pk) ?? []).filter(g => g.key !== key);

          const trustPct = trustScore !== undefined && trustScore !== null ? Math.round(Math.min(1, Math.max(0, trustScore)) * 100) : null;
          const circ = 2 * Math.PI * 18;
          const trustOffset = trustPct !== null ? circ - (trustPct / 100) * circ : circ;
          const ringColor = trustPct !== null ? (trustPct >= 50 ? "text-brand-primary" : trustPct >= 20 ? "text-brand-link" : trustPct >= 7 ? "text-brand-link" : "text-brand-link") : "text-brand-link";

          if (profile === undefined && !expandProfileAttempted.has(pk)) {
            return (
              <div key={pk} className="flex items-center gap-3 px-4 py-2" data-testid={`expand-profile-${pk.slice(0,8)}`}>
                <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="h-2 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                </div>
              </div>
            );
          }

          const isReportSection = key === "reported_by" || key === "reporting";
          const isMuteSection = key === "muted_by" || key === "muting";
          const reportMeta = isReportSection ? getReportForPubkey(key, pk) : undefined;
          const muteMeta = isMuteSection ? muteMetadataCache.get(pk) : undefined;

          return (
            <div
              key={pk}
              className="flex items-center gap-3 px-4 py-2 hover:bg-white/80 dark:hover:bg-slate-900/80 cursor-pointer transition-colors"
              onClick={() => navigateToProfile(pk)}
              data-testid={`expand-profile-${pk.slice(0,8)}`}
            >
              <Avatar className={`h-7 w-7 border border-slate-200/60 dark:border-slate-800/60 shrink-0 ${tierRing(trustScore) ?? ""}`}>
                <AvatarImage src={profile?.picture} />
                <AvatarFallback className="bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link text-xs font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{displayName}</p>
                {profile?.nip05 && <p className="text-xs text-brand-primary truncate">{profile.nip05}</p>}
                {isReportSection && reportMeta && (
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-medium no-default-hover-elevate no-default-active-elevate ${REPORT_TYPE_BADGE_COLORS[reportMeta.reportType] || REPORT_TYPE_BADGE_COLORS.other}`} data-testid={`report-type-${pk.slice(0,8)}`}>
                      {reportMeta.reportType}
                    </Badge>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500" data-testid={`report-time-${pk.slice(0,8)}`}>{formatRelativeTime(reportMeta.timestamp)}</span>
                    {reportMeta.reason && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 italic truncate max-w-[140px]" title={reportMeta.reason} data-testid={`report-reason-${pk.slice(0,8)}`}>"{reportMeta.reason}"</span>
                    )}
                  </div>
                )}
                {isReportSection && !reportMeta && reportMetaLoading && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className="h-2 w-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                    <div className="h-2 w-8 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  </div>
                )}
                {isReportSection && !reportMeta && !reportMetaLoading && (
                  <span className="text-[10px] text-slate-300 dark:text-slate-600 italic mt-0.5 block" data-testid={`report-unavailable-${pk.slice(0,8)}`}>report details unavailable</span>
                )}
                {isMuteSection && muteMeta && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500" data-testid={`mute-time-${pk.slice(0,8)}`}>{formatRelativeTime(muteMeta.timestamp)}</span>
                )}
              </div>
              {(() => {
                const overlapKeySet = new Set(overlappingGroups.map(g => g.key));
                const { owner, you } = deriveConnectionClusters(overlapKeySet);
                const nonConnectionGroups = overlappingGroups.filter(g => !CONNECTION_GROUP_KEYS.has(g.key));
                if (!owner && !you && nonConnectionGroups.length === 0) return null;
                return (
                  <div className="flex gap-1 flex-wrap justify-end">
                    {owner && (() => {
                      const meta = OWNER_PILL_META[owner];
                      return (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-1 no-default-hover-elevate no-default-active-elevate bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-500/25"
                          data-testid={`pill-owner-${owner}-${pk.slice(0,8)}`}
                        >
                          <meta.Icon className="h-2.5 w-2.5" />
                          {meta.label}
                        </Badge>
                      );
                    })()}
                    {you && (() => {
                      const meta = YOU_PILL_META[you];
                      return (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-1 no-default-hover-elevate no-default-active-elevate bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link border-brand-primary/20 dark:border-brand-primary/25"
                          data-testid={`pill-you-${you}-${pk.slice(0,8)}`}
                        >
                          <meta.Icon className="h-2.5 w-2.5" />
                          {meta.label}
                        </Badge>
                      );
                    })()}
                    {nonConnectionGroups.map(g => (
                      <Badge key={g.key} variant="outline" className={`text-[10px] px-1 py-0 no-default-hover-elevate no-default-active-elevate ${g.colors}`}>{g.label}</Badge>
                    ))}
                  </div>
                );
              })()}
              {trustScore !== undefined && trustScore !== null && (
                <div className="w-6 h-6 relative shrink-0">
                  <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
                    <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" className="text-brand-link dark:text-brand-primary/20" />
                    <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" strokeLinecap="round"
                      className={ringColor} style={{ strokeDasharray: circ, strokeDashoffset: trustOffset }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-brand-primary dark:text-brand-link">{trustPct}</span>
                </div>
              )}
              {trustScore === undefined && (
                <Loader2 className="h-3 w-3 text-brand-link animate-spin shrink-0" />
              )}
            </div>
          );
        })}
        {processed.length > visibleCount && (
          <div className="px-3 py-2">
            <button
              onClick={(e) => { e.stopPropagation(); onShowMore(key, processed, visibleCount); }}
              className="w-full py-2 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-medium transition-all shadow-sm hover:shadow-md"
              data-testid={`button-show-more-${key}`}
            >
              Show {Math.min(10, processed.length - visibleCount)} more <span className="text-white/60 font-mono ml-1">({processed.length - visibleCount} remaining{typeof sectionTotal === "number" && sectionTotal > processed.length ? ` of ${sectionTotal.toLocaleString()} total` : ""})</span>
            </button>
          </div>
        )}
        {processed.length === 0 && isFiltered && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">No users match this filter</p>
            <button
              onClick={(e) => { e.stopPropagation(); onSetFilter(key, "all"); onSetReportTypeFilter(key, "all"); }}
              className="text-xs text-brand-link font-medium mt-1.5 hover:underline"
              data-testid={`filter-clear-${key}`}
            >
              Clear filter
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default function ProfilePage() {
  const tierRing = useTierRing();
  const [location, navigate] = useLocation();
  const [, params] = useRoute("/profile/:npub");
  const npubParam = params?.npub || "";

  const user = useActiveAccountDisplay();
  const hasSession = useHasSession();

  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [zapOpen, setZapOpen] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [sectionVisibleCount, setSectionVisibleCount] = useState<Record<string, number>>({});
  const [reportMetadataLoading, setReportMetadataLoading] = useState<Record<string, boolean>>({});
  const [forceRender, setForceRender] = useState(0);
  const hasExpandedRef = useRef(false);
  const rafBumpRef = useRef<number | null>(null);
  const bumpRerender = useCallback(() => {
    if (rafBumpRef.current !== null) return;
    rafBumpRef.current = requestAnimationFrame(() => {
      rafBumpRef.current = null;
      startTransition(() => setForceRender((c) => c + 1));
    });
  }, []);

  const [sectionSort, setSectionSort] = useState<Record<string, SortMode>>({});
  const [sectionFilter, setSectionFilter] = useState<Record<string, FilterMode>>({});
  const [sectionSearch, setSectionSearch] = useState<Record<string, string>>({});
  const [filterDropdownOpen, setFilterDropdownOpen] = useState<Record<string, boolean>>({});
  const [reportTypeFilterState, setReportTypeFilterState] = useState<Record<string, ReportTypeFilter>>({});
  const [reportTypeDropdownOpen, setReportTypeDropdownOpen] = useState<Record<string, boolean>>({});

  const [fromGroup, setFromGroup] = useState<string | null>(null);
  const [fromAdmin, setFromAdmin] = useState<string | null>(null);
  const [fromSearch, setFromSearch] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [followHovered, setFollowHovered] = useState(false);
  const { toast } = useToast();

  const hexPubkey = useMemo(() => {
    try {
      if (/^npub1[02-9ac-hj-np-z]{20,}$/i.test(npubParam)) {
        const decoded = nip19.decode(npubParam);
        if (decoded.type === "npub" && typeof decoded.data === "string") return decoded.data;
      } else if (/^[0-9a-f]{64}$/i.test(npubParam)) {
        return npubParam.toLowerCase();
      }
    } catch {}
    return "";
  }, [npubParam]);

  const social = useSocialActions(user?.pubkey);
  const relQueryClient = useQueryClient();

  // "Follows you": does the target follow ME? (my pubkey ∈ their kind-3 contact list)
  const theyFollowMeQuery = useQuery({
    queryKey: ["they-follow-me", user?.pubkey, hexPubkey],
    queryFn: async () => getFollowedPubkeys(await fetchContactList(hexPubkey)).has(user!.pubkey),
    enabled: !!user?.pubkey && !!hexPubkey && user?.pubkey !== hexPubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const theyFollowMe = theyFollowMeQuery.data === true;

  // "You reported this": have I published a kind-1984 report targeting them?
  const myReportQuery = useQuery({
    queryKey: ["my-report", user?.pubkey, hexPubkey],
    queryFn: () => fetchMyReport(hexPubkey),
    enabled: !!user?.pubkey && !!hexPubkey && user?.pubkey !== hexPubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const myReport = myReportQuery.data ?? null;
  // Write the "you reported this" state straight into the cache instead of
  // re-fetching kind-1984 from relays (which lags 8s / until propagation) — so
  // the chip appears/clears instantly. Shared key, so the /p line updates too.
  const setMyReport = (value: MyReport | null) => relQueryClient.setQueryData(["my-report", user?.pubkey, hexPubkey], value);

  const { data: grapeRankData } = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const isAdmin = user?.isAdmin === true;

  const adminHistoryQuery = useQuery<{ items: AdminHistoryItem[]; total: number; page: number; pages: number }>({
    queryKey: ["/api/admin/users", hexPubkey, "history"],
    queryFn: () => apiClient.getAdminUserHistory(hexPubkey),
    enabled: isAdmin && !!hexPubkey,
    staleTime: 60_000,
    retry: false,
  });
  const calcDoneNow = grapeRankData?.data?.internal_publication_status === "success";
  const calcDone = useMemo(() => {
    if (calcDoneNow) {
      try { localStorage.setItem("brainstorm_calc_completed", "true"); } catch {}
      return true;
    }
    try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; }
  }, [calcDoneNow]);

  // Members-only gate: /profile is the personalized (signed-in) surface. Logged-out
  // visitors are redirected to the PUBLIC share page (/p/:npub) — the join-funnel
  // view — no matter how they arrived (search, a shared link, a bookmark).
  //
  // "Logged out" means holding no Account, not holding no Session. An Account
  // stays active with its Session cleared — a deferred re-auth, or a 401 that
  // `handleUnauthorized` decided not to redirect over — and `RequireAuth` lets
  // that in. Bouncing on the Session sent those users to a public page that
  // carries no unlock prompt, and every attempt to come back bounced again.
  useEffect(() => {
    if (npubParam && !user) {
      navigate(`/p/${npubParam}`, { replace: true });
    }
  }, [npubParam, navigate, user]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const group = urlParams.get("fromGroup");
    setFromGroup(group || null);
    const adminFrom = urlParams.get("from");
    const adminPubkey = urlParams.get("pubkey");
    setFromAdmin(adminFrom === "admin" ? (adminPubkey || "1") : null);
    setFromSearch(urlParams.get("fromSearch") === "1");
  }, [location, npubParam]);

  const { preset: trustPreset } = useTrustPresetSync(!!user);

  // Self's own follower/following lists drive the mutual-followers/following
  // banner. `useSelfConnections` calls `/user/{pk}/connections` via
  // `optionalAuthFetch`, which on an existing-but-stale session triggers
  // wipe-and-redirect (Profile is a public page). Gate the pubkey on a real
  // session token — anon and stale-token visitors see the public overview
  // without their browsing being hijacked.
  const selfMutualsPubkey = hasSession ? user?.pubkey : undefined;
  const selfFollowedByConn = useSelfConnections(selfMutualsPubkey, "followed_by", { enabled: !!selfMutualsPubkey });
  const selfFollowingConn = useSelfConnections(selfMutualsPubkey, "following", { enabled: !!selfMutualsPubkey });
  const selfFollowedByList = useMemo(() => flattenConnections(selfFollowedByConn.data?.pages), [selfFollowedByConn.data?.pages]);
  const selfFollowingList = useMemo(() => flattenConnections(selfFollowingConn.data?.pages), [selfFollowingConn.data?.pages]);

  const seed = useMemo<ProfileSeed | null>(() => {
    if (!hexPubkey) return null;
    const inMem = getProfileSeed(hexPubkey);
    if (inMem) return inMem;
    // Refresh-surviving fallback: if the search-click set ?showNosfabricaResult=1,
    // hydrate from sessionStorage once, then strip the flag from the URL so a
    // second refresh doesn't re-trigger a now-empty read.
    if (typeof window === "undefined") return null;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("showNosfabricaResult") !== "1") return null;
      const stored = consumeStoredSearchSeed(hexPubkey);
      if (!stored) {
        url.searchParams.delete("showNosfabricaResult");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        return null;
      }
      setProfileSeed(hexPubkey, stored);
      url.searchParams.delete("showNosfabricaResult");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      return stored;
    } catch {
      return null;
    }
  }, [hexPubkey]);

  // Overview drives the header (influence + counts). Lists load lazily on expand.
  // `flagged_by_observer` reflects "is this user flagged from the JWT user's
  // perspective" — used by isProfileFlagged below.
  const profileOverviewQuery = useQuery<{
    pubkey: string;
    influence: number | null;
    // The subject's own bucket under the viewer's saved preset — the server
    // owns the verified line, so we never re-derive it from a threshold here.
    tier: string | null;
    flagged_by_observer: boolean;
    counts: {
      followed_by: number;
      following: number;
      muted_by: number;
      muting: number;
      reported_by: number;
      reporting: number;
    };
  } | null>({
    queryKey: ["profile-overview", hexPubkey, trustPreset],
    queryFn: async () => {
      const res = await apiClient.getUserOverview(hexPubkey);
      return res?.data ?? null;
    },
    enabled: !!hexPubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Per-section stats (total + verified + tier counts) for all 6 relationships.
  // Fires in parallel with overview on profile open. Server runs 6 Cypher scans
  // in parallel; first paint of badges depends on this landing.
  type SectionStats = {
    total: number;
    verified: number;
    tier_counts: {
      high: number;
      medium_high: number;
      medium: number;
      medium_low: number;
      low: number;
      low_and_reported_by_2_or_more_trusted_pubkeys: number;
    };
  };
  const profileStatsQuery = useQuery<{
    followed_by: SectionStats;
    following: SectionStats;
    muted_by: SectionStats;
    muting: SectionStats;
    reported_by: SectionStats;
    reporting: SectionStats;
  } | null>({
    queryKey: ["profile-stats", hexPubkey, trustPreset],
    queryFn: async () => {
      const res = await apiClient.getUserStats(hexPubkey);
      return res?.data ?? null;
    },
    enabled: !!hexPubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Per-section connection queries (cursor-paginated).
  //  - followed_by + following: eager (drive mutual/shared computations).
  //  - the other four: lazy, only fire when their section is expanded.
  const SECTION_LIMIT = 200;
  // Map per-section SortMode → backend `order`. Name sorts stay client-side
  // (no backend name index), and fall back to DESC for fetch purposes.
  const orderFor = (kind: string): "asc" | "desc" =>
    sectionSort[kind] === "trust-asc" ? "asc" : "desc";

  // Map per-section FilterMode → backend `tier` + `verified_only`. "verified"
  // is the union of every banded tier, so it goes through `verified_only`;
  // specific tiers go through `tier`.
  // Map UI FilterMode keys → backend GR-style tier names.
  const UI_TO_GR_TIER: Record<string, "high" | "medium_high" | "medium" | "medium_low" | "low" | "low_and_reported_by_2_or_more_trusted_pubkeys"> = {
    high: "high",
    trusted: "medium_high",
    neutral: "medium",
    low: "medium_low",
    unverified: "low",
  };
  // Collapse backend tier_counts onto the FE display keys via the same
  // GR_TIER_TO_UI map that names a single row's tier, so a bucket count and a
  // row badge can't land in different slices. Slices still sum to `total`.
  const grTierCountsToUI = (tc: any): Record<string, number> => {
    const counts: Record<string, number> = { high: 0, trusted: 0, neutral: 0, low: 0, unverified: 0 };
    for (const [grTier, uiKey] of Object.entries(GR_TIER_TO_UI)) {
      counts[uiKey] += tc?.[grTier] ?? 0;
    }
    return counts;
  };
  const filterFor = (
    kind: string,
  ): {
    tier?: "high" | "medium_high" | "medium" | "medium_low" | "low" | "low_and_reported_by_2_or_more_trusted_pubkeys";
    verified_only?: boolean;
  } => {
    const f = sectionFilter[kind] || "all";
    if (f === "all") return {};
    if (f === "verified") return { verified_only: true };
    return { tier: UI_TO_GR_TIER[f] };
  };

  const useConnectionsQuery = (
    kind:
      | "followed_by"
      | "following"
      | "muted_by"
      | "muting"
      | "reported_by"
      | "reporting",
    eager: boolean = false,
  ) => {
    const order = orderFor(kind);
    const { tier, verified_only } = filterFor(kind);
    return useInfiniteQuery<
      { items: GraphEntry[]; next_cursor: string | null },
      Error,
      { pages: { items: GraphEntry[]; next_cursor: string | null }[]; pageParams: (string | undefined)[] },
      readonly unknown[],
      string | undefined
    >({
      queryKey: ["profile-conn", hexPubkey, kind, trustPreset, order, tier ?? null, verified_only ?? false],
      queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
        const res = await apiClient.getUserConnections(hexPubkey, kind, {
          limit: SECTION_LIMIT,
          cursor: pageParam || undefined,
          order,
          tier,
          verified_only,
        });
        return {
          items: (res?.data?.items ?? []) as GraphEntry[],
          next_cursor: (res?.data?.next_cursor ?? null) as string | null,
        };
      },
      initialPageParam: undefined,
      getNextPageParam: (lastPage: { next_cursor: string | null }) =>
        lastPage?.next_cursor ?? undefined,
      enabled:
        !!hexPubkey && (eager || !!expandedSections[kind]),
      staleTime: 5 * 60_000,
      retry: false,
    });
  };

  const followedByQuery = useConnectionsQuery("followed_by", true);
  const followingQuery = useConnectionsQuery("following", true);
  const mutedByQuery = useConnectionsQuery("muted_by");
  const mutingQuery = useConnectionsQuery("muting");
  const reportedByQuery = useConnectionsQuery("reported_by");
  const reportingQuery = useConnectionsQuery("reporting");

  // Flatten paginated items per section.
  const flattenItems = (q: { data?: { pages?: { items: GraphEntry[] }[] } }) =>
    q.data?.pages?.flatMap((p) => p.items) ?? null;

  const followedByItems = flattenItems(followedByQuery);
  const followingItems = flattenItems(followingQuery);
  const mutedByItems = flattenItems(mutedByQuery);
  const mutingItems = flattenItems(mutingQuery);
  const reportedByItems = flattenItems(reportedByQuery);
  const reportingItems = flattenItems(reportingQuery);

  const sectionStats = useMemo<Record<string, SectionStats | null>>(
    () => ({
      followed_by: profileStatsQuery.data?.followed_by ?? null,
      following: profileStatsQuery.data?.following ?? null,
      muted_by: profileStatsQuery.data?.muted_by ?? null,
      muting: profileStatsQuery.data?.muting ?? null,
      reported_by: profileStatsQuery.data?.reported_by ?? null,
      reporting: profileStatsQuery.data?.reporting ?? null,
    }),
    [profileStatsQuery.data],
  );

  // Seed expandTrustCache from any loaded section items so subsequent
  // ExpandedPanel renders don't fire a per-pubkey getUserOverview() each.
  useEffect(() => {
    const seedFrom = (items: GraphEntry[] | null) => {
      if (!items) return;
      for (const it of items) {
        if (typeof it === "string") continue;
        if (!expandTrustCache.has(it.pubkey)) {
          expandTrustCache.set(it.pubkey, it.influence ?? null);
        }
      }
    };
    seedFrom(followedByItems);
    seedFrom(followingItems);
    seedFrom(mutedByItems);
    seedFrom(mutingItems);
    seedFrom(reportedByItems);
    seedFrom(reportingItems);
  }, [
    followedByItems,
    followingItems,
    mutedByItems,
    mutingItems,
    reportedByItems,
    reportingItems,
  ]);

  // Composed ProfileResultData: counts as numbers (from overview) until each
  // section's lazy query lands its array. UI already handles the number-or-array
  // dual shape via Array.isArray() checks.
  const profileQuery = {
    data: useMemo<ProfileResultData | null>(() => {
      const ov = profileOverviewQuery.data;
      if (!ov) return null;
      return {
        influence: ov.influence ?? undefined,
        followed_by: followedByItems ?? ov.counts.followed_by,
        following: followingItems ?? ov.counts.following,
        muted_by: mutedByItems ?? ov.counts.muted_by,
        muting: mutingItems ?? ov.counts.muting,
        reported_by: reportedByItems ?? ov.counts.reported_by,
        reporting: reportingItems ?? ov.counts.reporting,
      } as ProfileResultData;
    }, [
      profileOverviewQuery.data,
      followedByItems,
      followingItems,
      mutedByItems,
      mutingItems,
      reportedByItems,
      reportingItems,
    ]),
    isLoading: profileOverviewQuery.isLoading,
    isError: profileOverviewQuery.isError,
    isFetched: profileOverviewQuery.isFetched,
    isSuccess: profileOverviewQuery.isSuccess,
  };

  const nostrProfileQuery = useQuery<ProfileContent | null>({
    queryKey: ["nostr-profile", hexPubkey],
    queryFn: async () => (await fetchProfile(hexPubkey)) ?? null,
    enabled: !!hexPubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const profileResult = profileQuery.data ?? null;
  const nostrProfile = nostrProfileQuery.data ?? null;

  useEffect(() => {
    if (hexPubkey && profileQuery.isSuccess && nostrProfileQuery.isFetched) {
      clearProfileSeed(hexPubkey);
    }
  }, [hexPubkey, profileQuery.isSuccess, nostrProfileQuery.isFetched]);

  const seedAsNostrProfile = useMemo<ProfileContent | null>(() => {
    if (!seed) return null;
    return {
      name: seed.name,
      display_name: seed.displayName,
      picture: seed.picture,
      nip05: seed.nip05,
      about: seed.about,
      banner: seed.banner,
      website: seed.website,
      lud16: seed.lud16,
    };
  }, [seed]);

  // When you're viewing your *own* profile, the locally-known current-user
  // profile (updated on every in-app save) is the freshest source — a just-
  // created/edited kind 0 may not have propagated to the HTTP gateways/relays
  // that `fetchProfile` queries yet. Use it to fill gaps (esp. picture/banner)
  // so your own avatar shows immediately instead of the initials fallback.
  const ownProfileFallback = useMemo<ProfileContent | null>(() => {
    if (!user || !hexPubkey || user.pubkey !== hexPubkey) return null;
    if (user.picture || user.displayName) {
      return {
        name: user.displayName,
        display_name: user.displayName,
        picture: user.picture,
        nip05: user.nip05,
      } as ProfileContent;
    }
    return null;
  }, [user, hexPubkey]);

  const displayNostrProfile = useMemo<ProfileContent | null>(() => {
    const base = nostrProfile ?? seedAsNostrProfile;
    if (!ownProfileFallback) return base;
    if (!base) return ownProfileFallback;
    // Network values win when present; the local copy backfills empty fields.
    const nonEmpty = Object.fromEntries(
      Object.entries(base).filter(([, v]) => v != null && v !== ""),
    );
    return { ...ownProfileFallback, ...nonEmpty } as ProfileContent;
  }, [nostrProfile, seedAsNostrProfile, ownProfileFallback]);

  const loadError = useMemo<string | null>(() => {
    if (!npubParam) return null;
    if (user && !hexPubkey) return "Invalid profile identifier";
    if (profileQuery.isError) return "No profile data found for this identity on the Brainstorm backend.";
    if (profileQuery.isFetched && !profileQuery.data) return "No profile data found for this identity on the Brainstorm backend.";
    return null;
  }, [npubParam, user, hexPubkey, profileQuery.isError, profileQuery.isFetched, profileQuery.data]);

  const isLoading = !seed && !profileResult && profileQuery.isLoading;

  useEffect(() => {
    setExpandedSections({});
    setSectionVisibleCount({});
    setReportMetadataLoading({});
    hasExpandedRef.current = false;
    metadataFetchedRef.current.clear();
    prefetchedRef.current.clear();
  }, [hexPubkey]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const renderLinkedText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
        urlRegex.lastIndex = 0;
        const display = part.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return (
          <a key={i} href={part} target="_blank" rel="noopener" className="text-brand-primary underline underline-offset-2 decoration-brand-primary/25 break-all" data-testid={`link-about-url-${i}`}>
            {display}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const fetchAbortRef = useRef<number>(0);
  const prefetchedRef = useRef<Set<string>>(new Set());

  const fetchSectionProfiles = useCallback(async (key: string, pubkeys: string[], startIdx = 0, count = 10) => {
    const fetchId = ++fetchAbortRef.current;
    const toFetch = pubkeys.slice(startIdx, startIdx + count).filter(
      pk => !expandProfileCache.has(pk)
    );
    if (toFetch.length === 0) return;
    const missingProfiles: string[] = [];
    for (const pk of toFetch) {
      const event = eventStore.getReplaceable(0, pk);
      if (event) {
        if (isValidProfile(event)) expandProfileCache.set(pk, getProfileContent(event));
      } else {
        missingProfiles.push(pk);
      }
    }
    if (fetchAbortRef.current !== fetchId) return;
    if (missingProfiles.length > 0) {
      bumpRerender();
    }
    await Promise.allSettled([
      ...(missingProfiles.length > 0 ? [fetchProfiles(missingProfiles, (pubkey, profile) => {
        expandProfileCache.set(pubkey, profile);
        bumpRerender();
      })] : []),
    ]);
    if (fetchAbortRef.current !== fetchId) return;
    // Every pubkey in this batch has now had a fetch attempt (eventStore hit or
    // a settled relay request). Mark them so rows with no resolvable kind-0
    // profile fall back to the npub instead of a skeleton forever.
    toFetch.forEach(pk => expandProfileAttempted.set(pk, true));
    bumpRerender();
    const nextStart = startIdx + count;
    if (nextStart < pubkeys.length) {
      const nextBatch = pubkeys.slice(nextStart, nextStart + count).filter(
        pk => !expandProfileCache.has(pk) && !eventStore.getReplaceable(0, pk)
      );
      if (nextBatch.length > 0) {
        nextBatch.forEach(pk => prefetchedRef.current.add(pk));
        fetchProfiles(nextBatch, (pubkey, profile) => {
          expandProfileCache.set(pubkey, profile);
        });
      }
    }
  }, [bumpRerender]);

  const metadataFetchedRef = useRef<Set<string>>(new Set());

  const fetchSectionMetadata = useCallback(async (sectionKey: string, extraPubkeys?: string[]) => {
    if (!hexPubkey) return;
    const cacheKey = `${sectionKey}:${hexPubkey}`;

    if (sectionKey === "reported_by" || sectionKey === "reporting") {
      if (metadataFetchedRef.current.has(cacheKey)) return;
      metadataFetchedRef.current.add(cacheKey);
    }

    if (sectionKey === "muting") {
      if (muteMetadataCache.has(hexPubkey)) return;
    }

    setReportMetadataLoading(prev => ({ ...prev, [sectionKey]: true }));

    try {
      if (sectionKey === "reported_by") {
        const reports = await fetchReportsForPubkey(hexPubkey);
        reportMetadataCache.set(cacheKey, reports);
      } else if (sectionKey === "reporting") {
        const reports = await fetchReportsByPubkey(hexPubkey);
        reportMetadataCache.set(cacheKey, reports);
      } else if (sectionKey === "muted_by") {
        const pubkeysToFetch = extraPubkeys || toPubkeys(getSection(profileResult, sectionKey)).slice(0, 50);
        const unfetched = pubkeysToFetch.filter(pk => !muteMetadataCache.has(pk));
        if (unfetched.length > 0) {
          const results = await Promise.allSettled(
            unfetched.map(pk => fetchMuteListTimestamp(pk))
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value) {
              muteMetadataCache.set(r.value.muterPubkey, r.value);
            }
          }
        }
      } else if (sectionKey === "muting") {
        const result = await fetchMuteListTimestamp(hexPubkey);
        if (result) {
          muteMetadataCache.set(hexPubkey, result);
        }
      }
    } catch {}

    setReportMetadataLoading(prev => ({ ...prev, [sectionKey]: false }));
    bumpRerender();
  }, [hexPubkey, profileResult, bumpRerender]);

  const getReportForPubkey = useCallback((sectionKey: string, pubkey: string): ReportMetadata | undefined => {
    const cacheKey = `${sectionKey}:${hexPubkey}`;
    const reports = reportMetadataCache.get(cacheKey);
    if (!reports) return undefined;
    const matching = sectionKey === "reported_by"
      ? reports.filter(r => r.reporterPubkey === pubkey)
      : sectionKey === "reporting"
      ? reports.filter(r => r.targetPubkey === pubkey)
      : [];
    if (matching.length === 0) return undefined;
    return matching.reduce((latest, r) => r.timestamp > latest.timestamp ? r : latest, matching[0]);
  }, [hexPubkey]);

  const formatRelativeTime = useCallback((timestamp: number) => formatReportTime(timestamp), []);


  const mutualPubkeys = useMemo(() => {
    if (!profileResult) return [];
    const followedBy = toPubkeys(getSection(profileResult, "followed_by"));
    const following = toPubkeys(getSection(profileResult, "following"));
    const followingSet = new Set(following);
    return followedBy.filter((pk: string) => followingSet.has(pk));
  }, [profileResult]);

  const sharedFollowerPubkeys = useMemo(() => {
    if (!profileResult || selfFollowedByList.length === 0) return [];
    const selfFollowedBySet = new Set(selfFollowedByList.map((e) => e.pubkey));
    const searchedFollowedBy = toPubkeys(getSection(profileResult, "followed_by"));
    return searchedFollowedBy.filter((pk: string) => selfFollowedBySet.has(pk));
  }, [selfFollowedByList, profileResult]);

  const sharedFollowingPubkeys = useMemo(() => {
    if (!profileResult || selfFollowingList.length === 0) return [];
    const selfFollowingSet = new Set(selfFollowingList.map((e) => e.pubkey));
    const searchedFollowing = toPubkeys(getSection(profileResult, "following"));
    return searchedFollowing.filter((pk: string) => selfFollowingSet.has(pk));
  }, [selfFollowingList, profileResult]);

  // `flagged_by_observer` is computed server-side on /user/{viewedPubkey}/overview
  // from the JWT user's perspective: at or below their saved preset's verified
  // line AND reported by 2+ trusted accounts. See UserOverviewData.
  const isProfileFlagged = profileOverviewQuery.data?.flagged_by_observer ?? false;

  useEffect(() => {
    if (!profileResult) return;
    const runPrefetch = () => {
      if (hasExpandedRef.current) return;
      const allPubkeys: string[] = [];
      for (const key of ["followed_by", "following", "muted_by", "reported_by", "muting", "reporting"]) {
        const pks = toPubkeys(getSection(profileResult, key));
        allPubkeys.push(...pks.slice(0, 10));
      }
      for (const pk of mutualPubkeys.slice(0, 10)) allPubkeys.push(pk);
      for (const pk of sharedFollowerPubkeys.slice(0, 10)) allPubkeys.push(pk);
      for (const pk of sharedFollowingPubkeys.slice(0, 10)) allPubkeys.push(pk);
      const unique = [...new Set(allPubkeys)].filter(pk => {
        if (prefetchedRef.current.has(pk)) return false;
        const cached = eventStore.getReplaceable(0, pk);
        return !cached;
      });
      if (unique.length > 0) {
        unique.forEach(pk => prefetchedRef.current.add(pk));
        fetchProfiles(unique, (pubkey, profile) => {
          expandProfileCache.set(pubkey, profile);
        });
      }
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    let handle: number;
    let isIdle = false;
    if (typeof ric === "function") {
      handle = ric(runPrefetch, { timeout: 2000 });
      isIdle = true;
    } else {
      handle = window.setTimeout(runPrefetch, 0);
    }
    return () => {
      if (isIdle && typeof cic === "function") cic(handle);
      else window.clearTimeout(handle);
    };
  }, [profileResult, mutualPubkeys, sharedFollowerPubkeys, sharedFollowingPubkeys]);

  const sectionInfluenceMaps = useMemo(() => {
    const out: Record<string, Map<string, number | null>> = {
      followed_by: new Map(),
      following: new Map(),
      muted_by: new Map(),
      muting: new Map(),
      reported_by: new Map(),
      reporting: new Map(),
    };
    if (!profileResult) return out;
    for (const key of Object.keys(out)) {
      out[key] = toInfluenceMap(getSection(profileResult, key));
    }
    return out;
  }, [profileResult]);

  const groupsByPubkey = useMemo(() => {
    const map = new Map<string, GroupDef[]>();
    if (!profileResult) return map;
    const push = (pk: string, def: GroupDef) => {
      const existing = map.get(pk);
      if (existing) existing.push(def);
      else map.set(pk, [def]);
    };
    const defsByKey = Object.fromEntries(GROUP_DEFS.map(d => [d.key, d]));
    const followedSet = new Set<string>();
    const followingSet = new Set<string>();
    sectionInfluenceMaps.followed_by.forEach((_v, pk) => { followedSet.add(pk); push(pk, defsByKey.followed_by); });
    sectionInfluenceMaps.following.forEach((_v, pk) => { followingSet.add(pk); push(pk, defsByKey.following); });
    sectionInfluenceMaps.muted_by.forEach((_v, pk) => push(pk, defsByKey.muted_by));
    sectionInfluenceMaps.muting.forEach((_v, pk) => push(pk, defsByKey.muting));
    sectionInfluenceMaps.reported_by.forEach((_v, pk) => push(pk, defsByKey.reported_by));
    sectionInfluenceMaps.reporting.forEach((_v, pk) => push(pk, defsByKey.reporting));
    for (const pk of followedSet) if (followingSet.has(pk)) push(pk, defsByKey.mutual);
    for (const pk of sharedFollowerPubkeys) push(pk, defsByKey.shared_followers);
    for (const pk of sharedFollowingPubkeys) push(pk, defsByKey.shared_following);
    return map;
  }, [profileResult, sectionInfluenceMaps, sharedFollowerPubkeys, sharedFollowingPubkeys]);

  // Brand-aligned trust ramp (mirrors TRUST_TIER_COLORS): Aurora Purple → Cyan
  // for the top tiers, muted violet for neutral, amber (semantic caution) for
  // low, brand grey for unverified.
  //
  // No `min` here: the line moves with the preset, so a subject's bucket is
  // read off the backend `tier` rather than rederived from a number.
  const TIER_DISPLAY_CONFIG = [
    { key: "high", name: TIER_LABELS.high, color: "#7237ff", bg: "bg-brand-primary/10 dark:bg-brand-primary/10", text: "text-brand-primary dark:text-brand-link", border: "border-brand-primary/20 dark:border-brand-primary/25", ring: "stroke-brand-primary" },
    { key: "trusted", name: TIER_LABELS.trusted, color: "#13d2e5", bg: "bg-cyan-50 dark:bg-cyan-500/10", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-500/25", ring: "stroke-cyan-500" },
    { key: "neutral", name: "Neutral", color: "#665487", bg: "bg-[#665487]/10 dark:bg-[#665487]/20", text: "text-[#665487] dark:text-brand-link", border: "border-[#665487]/30 dark:border-[#665487]/50", ring: "stroke-[#665487]" },
    { key: "low", name: TIER_LABELS.low, color: "#f59e0b", bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-500/25", ring: "stroke-amber-400" },
    { key: "unverified", name: "Unverified", color: "#8c929e", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-500 dark:text-slate-400", border: "border-slate-200 dark:border-slate-800", ring: "stroke-slate-400" },
  ];

  const [granularity] = useTierGranularity();
  const profileTier = useMemo(() => {
    const backendTier = profileOverviewQuery.data?.tier;
    if (!backendTier) return null;
    const uiKey = GR_TIER_TO_UI[backendTier] ?? "unverified";
    // Decision 1/7: under Simple the backend's verdict folds to Verified (any
    // tier at or above the line) or Unknown — Flagged is the banner's job here.
    if (granularity === "simple") {
      return uiKey === "unverified"
        ? { key: "unknown", name: "Unknown", color: "#8c929e", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-500 dark:text-slate-400", border: "border-slate-200 dark:border-slate-800", ring: "stroke-slate-400" }
        : { key: "verified", name: "Verified", color: "#13d2e5", bg: "bg-cyan-50 dark:bg-cyan-500/10", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-500/25", ring: "stroke-cyan-500" };
    }
    return TIER_DISPLAY_CONFIG.find(t => t.key === uiKey) ?? null;
  }, [profileOverviewQuery.data]);

  const confidenceGuidance = useMemo(() => {
    if (!profileResult || profileResult.influence === undefined) return null;
    const score = typeof profileResult.influence === "number" ? profileResult.influence : 0;
    const pct = Math.round(score * 100);
    const name = nostrProfile?.display_name || nostrProfile?.name || "this identity";
    if (pct >= 50) return { label: "High confidence", color: "text-emerald-700 dark:text-emerald-300", iconColor: "text-emerald-500 dark:text-emerald-400", iconBg: "bg-emerald-100 dark:bg-emerald-500/15", bg: "bg-gradient-to-r from-emerald-50/90 via-emerald-50/60 to-white/40 dark:bg-none dark:bg-emerald-500/10", border: "border-emerald-200/60 dark:border-emerald-500/25", message: `Strong trust signals from your community for ${name}.`, pct, icon: "check" as const };
    if (pct >= 20) return { label: "Moderate confidence", color: "text-brand-primary dark:text-brand-link", iconColor: "text-brand-primary dark:text-brand-link", iconBg: "bg-brand-primary/15 dark:bg-brand-primary/15", bg: "bg-gradient-to-r from-brand-primary/10 via-brand-primary/10 to-white/40 dark:bg-none dark:bg-brand-primary/10", border: "border-brand-primary/20 dark:border-brand-primary/25", message: `Some trust signals present. Your network has limited data on ${name}.`, pct, icon: "shield" as const };
    if (pct >= 7) return { label: "Low confidence", color: "text-slate-600 dark:text-slate-300", iconColor: "text-slate-400 dark:text-slate-500", iconBg: "bg-slate-100 dark:bg-slate-800", bg: "bg-gradient-to-r from-slate-50/90 via-slate-50/60 to-white/40 dark:bg-none dark:bg-slate-800/50", border: "border-slate-200/60 dark:border-slate-800/60", message: `Weak or mixed signals from your trusted community for ${name}.`, pct, icon: "alert" as const };
    return { label: "Very low confidence", color: "text-amber-700 dark:text-amber-300", iconColor: "text-amber-500 dark:text-amber-400", iconBg: "bg-amber-100 dark:bg-amber-500/15", bg: "bg-gradient-to-r from-amber-50/90 via-amber-50/60 to-white/40 dark:bg-none dark:bg-amber-500/10", border: "border-amber-200/60 dark:border-amber-500/25", message: `Your community's signals suggest careful scrutiny before trusting ${name}.`, pct, icon: "x" as const };
  }, [profileResult, nostrProfile]);

  const verifiedCounts = useMemo(() => {
    // Verified counts come only from /stats — the preset applied to the FULL
    // relationship, which a loaded page of items can't reproduce. `loaded` (not
    // `count > 0`) gates the "Verified X" labels, so a real 0 under a strict
    // preset reads as 0. Totals aren't preset-derived, so they still fall back.
    const ov = profileOverviewQuery.data?.counts;
    const fbStats = sectionStats.followed_by;
    const fgStats = sectionStats.following;
    const mbStats = sectionStats.muted_by;
    const rbStats = sectionStats.reported_by;
    return {
      loaded: !!profileStatsQuery.data,
      followers: fbStats?.verified ?? 0,
      followersTotal: fbStats?.total ?? ov?.followed_by ?? sectionInfluenceMaps.followed_by.size,
      following: fgStats?.verified ?? 0,
      followingTotal: fgStats?.total ?? ov?.following ?? sectionInfluenceMaps.following.size,
      mutedBy: mbStats?.verified ?? 0,
      mutedByTotal: mbStats?.total ?? ov?.muted_by ?? sectionInfluenceMaps.muted_by.size,
      reportedBy: rbStats?.verified ?? 0,
      reportedByTotal: rbStats?.total ?? ov?.reported_by ?? sectionInfluenceMaps.reported_by.size,
    };
  }, [sectionInfluenceMaps, profileOverviewQuery.data, profileStatsQuery.data, sectionStats]);

  // Same predicate the public page (/p/:id) and Network Alerts use, so one
  // account never reads as "flagged" on one surface and clean on another.
  const isFlaggedProfile = useMemo(
    () => isFlaggedByReporters(verifiedCounts.reportedBy, verifiedCounts.followers),
    [verifiedCounts.reportedBy, verifiedCounts.followers],
  );

  const followerTierBreakdown = useMemo(() => {
    // Server counts only: bucketing falls through the preset's verified line,
    // which this side doesn't know. Render nothing rather than guess it.
    const serverStats = sectionStats.followed_by;
    if (!serverStats || serverStats.total === 0) return null;
    return { counts: grTierCountsToUI(serverStats.tier_counts), total: serverStats.total };
  }, [sectionStats]);

  const getTrustForPk = useCallback((pk: string): number => {
    const cached = expandTrustCache.get(pk);
    if (cached !== undefined && cached !== null) return cached;
    for (const groupKey of ["followed_by", "following", "muted_by", "reported_by", "muting", "reporting"] as const) {
      const val = sectionInfluenceMaps[groupKey].get(pk);
      if (val !== undefined && val !== null) return val;
    }
    return -1;
  }, [sectionInfluenceMaps]);

  const getNameForPk = useCallback((pk: string): string => {
    const profile = expandProfileCache.get(pk);
    return (profile?.display_name || profile?.name || "").toLowerCase();
  }, []);

  const getTierBreakdown = useCallback((sectionKey: string): { tier: string; count: number; color: string }[] | null => {
    // Server-side tier counts only — see followerTierBreakdown.
    const serverStats = (sectionStats as Record<string, SectionStats | null | undefined>)[sectionKey];
    if (!serverStats) return null;
    const counts = grTierCountsToUI(serverStats.tier_counts);
    const tierDefs: { tier: string; label: string; color: string }[] = [
      { tier: "high", label: TIER_LABELS.high, color: "text-emerald-600" },
      { tier: "trusted", label: TIER_LABELS.trusted, color: "text-sky-500" },
      { tier: "neutral", label: "Neutral", color: "text-brand-link" },
      { tier: "low", label: "Low", color: "text-amber-500" },
      { tier: "unverified", label: "Unverified", color: "text-zinc-400" },
    ];
    const rows = tierDefs.filter(t => counts[t.tier] > 0).map(t => ({ tier: t.label, count: counts[t.tier], color: t.color }));
    if (granularity !== "simple") return rows;
    const verified = tierDefs.filter(t => t.tier !== "unverified").reduce((a, t) => a + (counts[t.tier] ?? 0), 0);
    const unknown = counts.unverified ?? 0;
    return [
      { tier: "Verified", count: verified, color: "text-cyan-600" },
      { tier: "Unknown", count: unknown, color: "text-zinc-400" },
    ].filter(r => r.count > 0);
  }, [sectionStats, granularity]);

  const seedTrustForSection = useCallback((key: string, pubkeys: string[]) => {
    // Seed expandTrustCache from already-known influence values so we never
    // need a per-pubkey apiClient.getUserByPubkey() call for these.
    const seed = (pk: string, val: number | null | undefined) => {
      if (val === undefined) return;
      if (!expandTrustCache.has(pk)) expandTrustCache.set(pk, val);
    };
    if (key === "mutual" || key === "shared_followers" || key === "shared_following") {
      for (const pk of pubkeys) {
        const fromFollowedBy = sectionInfluenceMaps.followed_by.get(pk);
        if (fromFollowedBy !== undefined) { seed(pk, fromFollowedBy); continue; }
        const fromFollowing = sectionInfluenceMaps.following.get(pk);
        if (fromFollowing !== undefined) { seed(pk, fromFollowing); continue; }
        seed(pk, null);
      }
      return;
    }
    const map = (sectionInfluenceMaps as Record<string, Map<string, number | null> | undefined>)[key];
    if (!map) return;
    map.forEach((inf, pk) => seed(pk, inf));
  }, [sectionInfluenceMaps]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!prev[key]) {
        hasExpandedRef.current = true;
        setSectionVisibleCount(vc => ({ ...vc, [key]: 10 }));
        const pubkeys = key === "mutual" ? mutualPubkeys
          : key === "shared_followers" ? sharedFollowerPubkeys
          : key === "shared_following" ? sharedFollowingPubkeys
          : toPubkeys(getSection(profileResult, key));
        if (pubkeys.length > 0) {
          seedTrustForSection(key, pubkeys);
          fetchSectionProfiles(key, pubkeys);
        }
        if (["reported_by", "reporting", "muted_by", "muting"].includes(key)) {
          fetchSectionMetadata(key);
        }
      } else {
        setSectionVisibleCount(vc => {
          const copy = { ...vc };
          delete copy[key];
          return copy;
        });
        setSectionSort(prev => { const copy = { ...prev }; delete copy[key]; return copy; });
        setSectionFilter(prev => { const copy = { ...prev }; delete copy[key]; return copy; });
        setSectionSearch(prev => { const copy = { ...prev }; delete copy[key]; return copy; });
        setFilterDropdownOpen(prev => { const copy = { ...prev }; delete copy[key]; return copy; });
      }
      return next;
    });
  };

  const renderTierBadges = (sectionKey: string) => {
    const breakdown = getTierBreakdown(sectionKey);
    if (!breakdown || breakdown.length === 0) return null;
    return (
      <div className="flex items-center gap-1.5 flex-wrap mt-0.5" data-testid={`tier-breakdown-${sectionKey}`}>
        {breakdown.map(t => (
          <span key={t.tier} className={`text-[9px] font-medium ${t.color} flex items-center gap-0.5`}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${t.color.replace("text-", "bg-")}`} />
            {t.count}
          </span>
        ))}
      </div>
    );
  };

  const navigateToProfile = useCallback((pk: string) => {
    const targetNpub = nip19.npubEncode(pk);
    const params = new URLSearchParams();
    if (fromGroup) params.set("fromGroup", fromGroup);
    if (fromAdmin) {
      params.set("from", "admin");
      if (fromAdmin !== "1") params.set("pubkey", fromAdmin);
    }
    if (fromSearch) params.set("fromSearch", "1");
    const qs = params.toString();
    navigate(`/profile/${targetNpub}${qs ? `?${qs}` : ""}`);
  }, [navigate, fromGroup, fromAdmin, fromSearch]);

  const handleSetSort = useCallback((k: string, v: SortMode) => {
    setSectionSort(prev => ({ ...prev, [k]: v }));
  }, []);
  const handleSetFilter = useCallback((k: string, v: FilterMode) => {
    setSectionFilter(prev => ({ ...prev, [k]: v }));
  }, []);
  const handleSetSearch = useCallback((k: string, v: string) => {
    setSectionSearch(prev => ({ ...prev, [k]: v }));
  }, []);
  const handleSetReportTypeFilter = useCallback((k: string, v: ReportTypeFilter) => {
    setReportTypeFilterState(prev => ({ ...prev, [k]: v }));
  }, []);
  const handleSetVisibleCount = useCallback((k: string, n: number) => {
    setSectionVisibleCount(prev => ({ ...prev, [k]: n }));
  }, []);
  const handleToggleFilterDropdown = useCallback((k: string, open: boolean) => {
    setFilterDropdownOpen(prev => ({ ...prev, [k]: open }));
  }, []);
  const handleToggleReportTypeDropdown = useCallback((k: string, open: boolean) => {
    setReportTypeDropdownOpen(prev => ({ ...prev, [k]: open }));
  }, []);
  const handleEnsureVisibleFetched = useCallback((k: string, visiblePubkeys: string[]) => {
    fetchSectionProfiles(k, visiblePubkeys, 0, visiblePubkeys.length);
  }, [fetchSectionProfiles]);

  // Map section key → infinite query (for cursor-paginated fetchNextPage).
  const sectionQueries: Record<string, {
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage: () => void;
  }> = {
    followed_by: followedByQuery,
    following: followingQuery,
    muted_by: mutedByQuery,
    muting: mutingQuery,
    reported_by: reportedByQuery,
    reporting: reportingQuery,
  };

  const handleShowMore = useCallback((k: string, processed: string[], currentVisible: number) => {
    setSectionVisibleCount(prev => ({ ...prev, [k]: currentVisible + 10 }));
    fetchSectionProfiles(k, processed, currentVisible, 10);
    if (k === "muted_by") {
      const nextBatch = processed.slice(currentVisible, currentVisible + 10);
      if (nextBatch.length > 0) fetchSectionMetadata("muted_by", nextBatch);
    }
    // If we're approaching the end of what's loaded server-side, fetch the
    // next page. The connection query will append items; profileResult
    // re-composes; the panel will see the larger list on the next render.
    const q = sectionQueries[k];
    if (q && q.hasNextPage && !q.isFetchingNextPage) {
      if (currentVisible + 10 >= processed.length - 30) {
        q.fetchNextPage();
      }
    }
  }, [fetchSectionProfiles, fetchSectionMetadata, sectionQueries]);

  const renderExpandedPanel = (key: string, pubkeys: string[]) => {
    const isExpanded = expandedSections[key];
    if (!isExpanded || pubkeys.length === 0) return null;
    return (
      <ExpandedPanel
        sectionKey={key}
        pubkeys={pubkeys}
        filter={sectionFilter[key] || "all"}
        sort={sectionSort[key] || "trust-desc"}
        search={sectionSearch[key] || ""}
        reportTypeFilter={reportTypeFilterState[key] || "all"}
        visibleCount={sectionVisibleCount[key] || 10}
        sectionTotal={sectionStats[key]?.total}
        filterDropdownOpen={filterDropdownOpen[key] || false}
        reportTypeDropdownOpen={reportTypeDropdownOpen[key] || false}
        reportMetaLoading={!!reportMetadataLoading[key]}
        sectionInfluenceMaps={sectionInfluenceMaps}
        groupsByPubkey={groupsByPubkey}
        getReportForPubkey={getReportForPubkey}
        formatRelativeTime={formatRelativeTime}
        navigateToProfile={navigateToProfile}
        onSetSort={handleSetSort}
        onSetFilter={handleSetFilter}
        onSetSearch={handleSetSearch}
        onSetReportTypeFilter={handleSetReportTypeFilter}
        onSetVisibleCount={handleSetVisibleCount}
        onToggleFilterDropdown={handleToggleFilterDropdown}
        onToggleReportTypeDropdown={handleToggleReportTypeDropdown}
        onShowMore={handleShowMore}
        onEnsureVisibleFetched={handleEnsureVisibleFetched}
        renderToken={forceRender}
      />
    );
  };

  const handleCopyNpub = async (text: string) => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayNpub = useMemo(() => {
    if (/^npub1/.test(npubParam)) return npubParam;
    try { return nip19.npubEncode(npubParam); } catch { return npubParam; }
  }, [npubParam]);

  // Fetch the NosFabrica ("house") perspective influence (0..1) for the viewed
  // profile on mount, so the dual-meter widget renders regardless of entry point
  // (Search, Network, deep link, etc). Uses an unauthenticated overview request
  // (always house POV). Skipped when the search-click seed already supplied a value.
  const nosfabricaRankQuery = useQuery<number | null>({
    queryKey: ["profile-nosfabrica-rank", hexPubkey],
    queryFn: async () => {
      if (!hexPubkey) return null;
      return await apiClient.getHouseInfluence(hexPubkey);
    },
    enabled: !!hexPubkey && (seed?.wotRankNosfabrica == null),
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Viewing your OWN profile, the personalized score is always self-POV (you
  // trust yourself → 100), which is meaningless. So on your own profile we show
  // the network/house score instead — Brainstorm's own vantage point, the same
  // default shown on your shareable /p page. Framed as "how Brainstorm sees you",
  // NOT "how others see you": every viewer with their own web of trust computes a
  // different number, so there is no single score to promise.
  const isOwnProfile = !!user?.pubkey && !!hexPubkey && user.pubkey === hexPubkey;
  const houseInfluence01 = useMemo(() => {
    const r = seed?.wotRankNosfabrica ?? nosfabricaRankQuery.data;
    if (typeof r !== "number" || !Number.isFinite(r)) return null;
    const v01 = r > 1 ? r / 100 : r;
    return Math.min(1, Math.max(0, v01));
  }, [seed?.wotRankNosfabrica, nosfabricaRankQuery.data]);

  if (isAuthRedirecting()) return null;

  const isAnon = !user;
  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6) : "";
  // X-style stat numbers: full under 10k ("1,234"), compact above ("114K").
  const fmtStat = (n: number) =>
    n >= 10000 ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString();

  const renderTrustBadge = (idSuffix: string = "") => {
    if (!profileResult || profileResult.influence === undefined || !profileTier) return null;

    // Own profile → the network's view of you (null = not yet scored, shown as
    // such in the card); anyone else → your personalized view of them.
    const score01 = isOwnProfile
      ? houseInfluence01
      : Math.min(1, Math.max(0, typeof profileResult.influence === "number" ? profileResult.influence : 0));
    // Other profiles: primary = your personal POV, secondary = the network score
    // (shown only when they differ → naturally hidden when logged out, where both
    // resolve to the house score). Own profile: network primary, no secondary.
    return (
      <WotStrengthCard
        score01={score01}
        secondaryScore01={isOwnProfile ? null : houseInfluence01}
        primaryLabel="To you"
        secondaryLabel="Brainstorm"
        className="w-full md:w-64 md:shrink-0"
      />
    );
  };

  return (
    <div
      className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-brand-primary/[0.3] flex flex-col relative overflow-hidden"
      data-testid="page-profile"
    >
      <GlossBackground />

      {isAnon ? (
        <header className="relative z-20 flex items-center justify-between px-4 sm:px-8 py-4" data-testid="header-profile-anon">
          <button
            type="button"
            onClick={() => navigate("/about")}
            className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-brand-primary transition-colors"
            data-testid="link-profile-about"
          >
            About
          </button>
          <SignInButton
            variant="primary"
            label="Sign in"
            className="!rounded-full sm:px-5"
            data-testid="button-profile-sign-in"
          />
        </header>
      ) : (
      <AppHeader user={user} onLogout={handleLogout} calcDone={calcDone} />
      )}

      <ShareProfileModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        npub={displayNpub}
        displayName={displayNostrProfile?.display_name || displayNostrProfile?.name || displayNpub.slice(0, 18) + "…"}
        picture={displayNostrProfile?.picture}
        nip05={displayNostrProfile?.nip05}
        canonicalUrl={typeof window !== "undefined" && displayNpub ? `${window.location.origin}/p/${displayNpub}` : ""}
        score01={typeof nosfabricaRankQuery.data === "number" ? nosfabricaRankQuery.data : null}
      />

      {hexPubkey && displayNostrProfile?.lud16 && (
        <ZapModal
          open={zapOpen}
          onOpenChange={setZapOpen}
          recipientPubkey={hexPubkey}
          lud16={displayNostrProfile.lud16}
          displayName={displayNostrProfile?.display_name || displayNostrProfile?.name || displayNpub.slice(0, 18) + "…"}
          picture={displayNostrProfile?.picture}
        />
      )}

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="flex items-center gap-2 mb-6">
          {(() => {
            const goBack = (fallback: string) => {
              // Prefer real browser history so "back" returns to wherever you came
              // from — the dashboard, search, or a chained profile — instead of a
              // hardcoded destination. Fall back only on a cold deep-link.
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                navigate(fallback);
              }
            };
            if (fromAdmin) {
              const fallback = `/admin?tab=users${fromAdmin !== "1" ? `&highlight=${fromAdmin}` : ""}`;
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50/60 dark:hover:bg-amber-500/10 -ml-1 no-default-hover-elevate no-default-active-elevate"
                  onClick={() => goBack(fallback)}
                  data-testid="button-back-to-admin"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Admin
                </Button>
              );
            }
            if (fromGroup) {
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-500 dark:text-slate-400 hover:text-brand-primary dark:hover:text-brand-link hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10 -ml-1 no-default-hover-elevate no-default-active-elevate"
                  onClick={() => goBack(`/network?group=${fromGroup}`)}
                  data-testid="button-back-to-network"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Network
                </Button>
              );
            }
            return (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-slate-500 dark:text-slate-400 hover:text-brand-primary dark:hover:text-brand-link hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10 -ml-1 no-default-hover-elevate no-default-active-elevate"
                onClick={() => goBack("/")}
                data-testid="button-back-to-search"
              >
                <ArrowLeft className="h-4 w-4" />
                {fromSearch ? "Back to Search" : "Back"}
              </Button>
            );
          })()}
        </div>

        {isLoading && (
          <div data-testid="panel-profile-skeleton">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none rounded-xl overflow-hidden">
              <div className="p-6 sm:p-8 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-2.5 pt-1">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-36" />
                    <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-48" />
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-3/4" />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                  <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                  <div className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="h-12 bg-slate-50 dark:bg-slate-900 rounded-xl" />
                  <div className="h-12 bg-slate-50 dark:bg-slate-900 rounded-xl" />
                </div>
              </div>
            </Card>
          </div>
        )}

        {!isLoading && loadError && (
          <div style={{ animation: "profileFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none rounded-xl overflow-hidden relative" data-testid="card-profile-error">
              <div className="p-7 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-2xl blur-md opacity-70 bg-gradient-to-br from-brand-primary/[0.4] to-brand-primary/25" />
                  <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-brand-primary dark:text-brand-link shadow-sm dark:shadow-none flex items-center justify-center" data-testid="icon-profile-error">
                    <User className="h-6 w-6" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">Profile</p>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    Profile not found
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{loadError}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => navigate("/")}
                      className="h-10 rounded-xl px-4 font-bold tracking-wide text-xs shadow-sm bg-brand-primary hover:bg-brand-primary-hover text-white"
                      data-testid="button-profile-new-search"
                    >
                      New Search
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {!loadError && !profileResult && seed && (
          <div data-testid="card-profile-seed-preview">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none rounded-2xl overflow-hidden relative">
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-3 sm:gap-4 mb-4">
                  <Avatar className={`h-12 w-12 sm:h-16 sm:w-16 border-2 border-brand-primary/15 dark:border-brand-primary/25 shadow-md shrink-0 ${tierRing(houseInfluence01) ?? ""}`}>
                    {displayNostrProfile?.picture && (
                      <AvatarImage src={displayNostrProfile.picture} alt={displayNostrProfile?.display_name || displayNostrProfile?.name || "Profile"} className="object-cover" />
                    )}
                    <AvatarFallback className="bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link text-base sm:text-lg font-bold">
                      {(displayNostrProfile?.display_name || displayNostrProfile?.name || displayNpub.slice(0, 2)).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate" style={{ fontFamily: "var(--font-display)" }} data-testid="text-profile-title-seed">
                            {displayNostrProfile?.display_name || displayNostrProfile?.name || displayNpub.slice(0, 18) + "..."}
                          </h3>
                          <Badge variant="secondary" className="text-[10px] font-bold tracking-wider uppercase bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                            <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                            Loading
                          </Badge>
                        </div>
                        {displayNostrProfile?.nip05 && (
                          <p className="text-xs text-brand-primary font-medium mt-0.5 truncate">{displayNostrProfile.nip05}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <code className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate max-w-[120px] sm:max-w-[300px]">{displayNpub}</code>
                        </div>
                      </div>
                      <div
                        className="flex flex-col items-center gap-0.5 bg-brand-primary/10 dark:bg-brand-primary/10 border border-brand-primary/20 dark:border-brand-primary/25 rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 backdrop-blur-sm shrink-0"
                        data-testid="badge-trust-score-seed"
                        aria-label="Brainstorm Verification Score loading"
                      >
                        <div className="flex items-center gap-1">
                          <BrainLogo size={8} className="text-brand-link sm:hidden" />
                          <BrainLogo size={10} className="text-brand-link hidden sm:block" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-link">Brainstorm</span>
                        </div>
                        <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 44 44">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand-link dark:text-brand-primary/20" />
                          </svg>
                          <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-brand-link" />
                        </div>
                        <div className="h-3 w-12 rounded bg-brand-primary/15 dark:bg-brand-primary/20 animate-pulse" />
                      </div>
                    </div>
                  </div>
                </div>
                {displayNostrProfile?.about && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 mb-4" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                    {displayNostrProfile.about}
                  </p>
                )}
                <div className="animate-pulse space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                    <div className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                    <div className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {!isLoading && !loadError && profileResult && (
          <div style={{ animation: "profileFadeIn 0.7s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none rounded-2xl overflow-hidden relative" data-testid="card-profile-result">

              <div className="relative overflow-hidden">
                {/* Cover banner — matches the public /p page; fills the top space. */}
                <div className="relative w-full h-24 sm:h-32">
                  {displayNostrProfile?.banner ? (
                    <img src={displayNostrProfile.banner} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className={`absolute inset-0 ${DEFAULT_BANNER_CLASS}`}>
                      <img src={DEFAULT_BANNER_SRC} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-br from-brand-accent/30 via-brand-accent-hover/20 to-brand-deep/40 mix-blend-multiply" />
                    </div>
                  )}
                </div>
                

                <div className="px-5 sm:px-6 pb-5 sm:pb-6 relative z-10">
                {/* Avatar overlaps the banner on its own line, so the name, npub,
                    stats and actions below all share one left edge (like /p). */}
                {(() => {
                    const isOwnAssistant = !!hexPubkey && getCurrentAssistantPubkey() === hexPubkey;
                    const assistantDefaultPicture = typeof window !== "undefined" ? `${window.location.origin}/assistant-default.webp` : "/assistant-default.webp";
                    const effectivePicture = displayNostrProfile?.picture || (isOwnAssistant ? assistantDefaultPicture : undefined);
                    return (
                      <Avatar className={`h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-white dark:border-slate-900 shadow-lg bg-white dark:bg-slate-900 shrink-0 -mt-12 sm:-mt-16 ${tierRing(profileResult?.influence ?? houseInfluence01) ?? ""}`}>
                        <AvatarImage src={effectivePicture} alt={displayNostrProfile?.display_name || displayNostrProfile?.name || "Profile"} className="object-cover" />
                        <AvatarFallback className="bg-brand-primary/10 dark:bg-brand-primary/10 text-brand-primary dark:text-brand-link text-base sm:text-lg font-bold">
                          {(displayNostrProfile?.display_name || displayNostrProfile?.name || displayNpub.slice(0, 2)).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    );
                  })()}
                {/* Two-column hero — identity + stats + actions on the left, the
                    Web of Trust card as a top-aligned right sidebar (desktop),
                    matching the public /p page. */}
                <div className="mt-2.5 md:flex md:gap-6 md:items-start">
                <div className="md:flex-1 min-w-0">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
                          <h3 className="w-full sm:w-auto text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate" style={{ fontFamily: "var(--font-display)" }} data-testid="text-profile-title">
                            {displayNostrProfile?.display_name || displayNostrProfile?.name || displayNpub.slice(0, 18) + "..."}
                          </h3>
                          {displayNostrProfile?.nip05 && (
                            <span className="inline-flex items-center gap-1 min-w-0 max-w-full text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 font-medium" data-testid="text-profile-nip05" title="Verified handle (NIP-05)">
                              <BadgeCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-brand-primary" />
                              <span className="truncate">{displayNostrProfile.nip05}</span>
                            </span>
                          )}
                          {hexPubkey && getCurrentAssistantPubkey() === hexPubkey && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-bold tracking-wider uppercase bg-brand-accent/10 text-brand-deep border border-brand-accent/30 self-center"
                              data-testid="badge-brainstorm-assistant"
                              title="This is your Brainstorm Assistant — a bot that publishes your scores to Nostr."
                            >
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-accent mr-1" />
                              Brainstorm Assistant
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <code className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate max-w-[120px] sm:max-w-[300px]" data-testid="text-profile-npub">{displayNpub}</code>
                          <button onClick={() => handleCopyNpub(displayNpub)} className="p-0.5 text-slate-400 dark:text-slate-500 hover:text-brand-primary transition-colors shrink-0" data-testid="button-copy-profile-npub">
                            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        {/* Web of Trust — mobile inline; on desktop it renders in the right sidebar. */}
                        <div className="md:hidden mt-3">{renderTrustBadge()}</div>
                    </div>
                {/* X-style inline counts — full-width so they sit on one line. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[13px] sm:text-sm" data-testid="row-profile-stats">
                  <span data-testid="stat-profile-following">
                    <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtStat(verifiedCounts.followingTotal)}</span>
                    <span className="text-slate-500 dark:text-slate-400 ml-1">Following</span>
                  </span>
                  <span data-testid="stat-profile-followers">
                    <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtStat(verifiedCounts.followersTotal)}</span>
                    <span className="text-slate-500 dark:text-slate-400 ml-1">Followers</span>
                  </span>
                  <span data-testid="stat-profile-mutual">
                    <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtStat(mutualPubkeys.length)}</span>
                    <span className="text-slate-500 dark:text-slate-400 ml-1">Mutual</span>
                  </span>
                  {/* Degree (1st/2nd/3rd) — signed-in + scored viewers, not your own profile. */}
                  {hasSession && !isOwnProfile && user?.pubkey && hexPubkey &&
                    localStorage.getItem("brainstorm_calc_completed") === "true" && (
                      <DegreeChip fromPubkey={user.pubkey} toPubkey={hexPubkey} rawId={npubParam} pov="personalized" variant="bold" />
                    )}
                  {theyFollowMe && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 dark:bg-brand-primary/10 px-2 py-0.5 text-[11px] font-semibold text-brand-link" data-testid="badge-follows-you">
                      <ArrowLeft className="h-3 w-3" /> Follows you
                    </span>
                  )}
                </div>
                {/* One tidy action bar — full-width, aligned with the stats above.
                    Follow is primary; the rest tuck into a "more" menu. */}
                <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="row-profile-actions">
                  {hexPubkey && !isAnon && !social.isSelf(hexPubkey) ? (
                    <>
                      {social.listsLoading ? (
                        <div className="h-8 w-24 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" data-testid="skeleton-follow-button" />
                      ) : (() => {
                        const following = social.isFollowing(hexPubkey);
                        const pending = social.isPending("follow", hexPubkey) || social.isPending("unfollow", hexPubkey);
                        return (
                          <button
                            type="button"
                            disabled={pending || social.isAnyPending}
                            onMouseEnter={() => following && setFollowHovered(true)}
                            onMouseLeave={() => setFollowHovered(false)}
                            onClick={async () => {
                              const result = following ? await social.unfollow(hexPubkey) : await social.follow(hexPubkey);
                              // A declined unlock is a deliberate no — say nothing.
                              if (result.cancelled) { setFollowHovered(false); return; }
                              if (result.success) {
                                toast({ title: following ? "Unfollowed" : "Followed", description: following ? "Removed from your contact list" : "Added to your contact list" });
                              } else {
                                toast({ title: "Error", description: result.error || "Action failed", variant: "destructive" });
                              }
                              setFollowHovered(false);
                            }}
                            className={`inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none ${
                              following
                                ? followHovered
                                  ? "bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20"
                                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
                                : "bg-brand-primary text-white hover:bg-brand-primary-hover shadow-sm"
                            }`}
                            data-testid="button-follow-toggle"
                          >
                            {following ? (followHovered ? <UserMinus className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />) : <UserPlus className="h-3.5 w-3.5" />}
                            <span>{following ? (followHovered ? "Unfollow" : "Following") : "Follow"}</span>
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => navigate(`/p/${displayNpub}`)}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                        data-testid="link-public-page"
                        title="See the public, shareable version of this profile"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" /> Public page
                      </button>
                      {displayNostrProfile?.lud16 && (
                        <button
                          type="button"
                          onClick={() => setZapOpen(true)}
                          className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                          data-testid="button-zap"
                          title="Send a zap"
                        >
                          <FlashIcon className="h-3.5 w-3.5 text-amber-500" /> Zap
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors" aria-label="More actions" data-testid="button-profile-more">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
                          <DropdownMenuItem className="cursor-pointer" onClick={() => setShareOpen(true)} data-testid="button-share-profile">
                            <Share2 className="h-4 w-4 mr-2 text-slate-500 dark:text-slate-400" /> Share
                          </DropdownMenuItem>
                          {(() => {
                            const muted = social.isMuted(hexPubkey);
                            return (
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={async () => {
                                  const result = muted ? await social.unmute(hexPubkey) : await social.mute(hexPubkey);
                                  if (result.cancelled) return;
                                  if (result.success) {
                                    toast({ title: muted ? "Unmuted" : "Muted", description: muted ? "Removed from your mute list" : "Added to your mute list" });
                                  } else {
                                    toast({ title: "Error", description: result.error || "Action failed", variant: "destructive" });
                                  }
                                }}
                                data-testid="button-mute-toggle"
                              >
                                {muted ? <Volume2 className="h-4 w-4 mr-2 text-slate-500 dark:text-slate-400" /> : <VolumeX className="h-4 w-4 mr-2 text-slate-500 dark:text-slate-400" />}
                                {muted ? "Unmute" : "Mute"}
                              </DropdownMenuItem>
                            );
                          })()}
                          {myReport ? (
                            <DropdownMenuItem
                              className="cursor-pointer text-amber-700 dark:text-amber-400 focus:text-amber-800 dark:focus:text-amber-300"
                              onClick={async () => {
                                const snapshot = myReport;
                                setMyReport(null); // optimistic: chip + menu flip instantly
                                const result = await social.unreport(hexPubkey);
                                if (result.cancelled) { setMyReport(snapshot); return; }
                                if (result.success) {
                                  toast({ title: "Report removed", description: "Scores may take a little while to reflect this." });
                                } else {
                                  setMyReport(snapshot); // rollback
                                  toast({ title: "Error", description: result.error || "Couldn't remove report", variant: "destructive" });
                                }
                              }}
                              data-testid="button-unreport"
                            >
                              <Flag className="h-4 w-4 mr-2" /> Undo report
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300" onClick={() => setReportDialogOpen(true)} data-testid="button-report">
                              <Flag className="h-4 w-4 mr-2" /> Report
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {myReport && (
                        <Chip
                          tone="amber"
                          icon={Flag}
                          className="text-[11px]"
                          title="Your report is published. Undo it from the ⋯ menu. Scores may take a little while to reflect changes."
                          data-testid="chip-you-reported"
                        >
                          You reported this{myReport.reportType ? ` (${myReport.reportType})` : ""}
                        </Chip>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate(`/p/${displayNpub}`)}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-brand-primary/20 dark:border-brand-primary/25 bg-white dark:bg-slate-900 text-xs font-semibold text-brand-primary dark:text-brand-link hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10 hover:border-brand-primary/25 dark:hover:border-brand-primary/[0.4] transition-colors"
                        data-testid="link-public-page"
                        title="See the public, shareable version of this profile"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" /> Public page
                      </button>
                      {!isOwnProfile && displayNostrProfile?.lud16 && (
                        <button
                          type="button"
                          onClick={() => setZapOpen(true)}
                          className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                          data-testid="button-zap"
                          title="Send a zap"
                        >
                          <FlashIcon className="h-3.5 w-3.5 text-amber-500" /> Zap
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShareOpen(true)}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-brand-primary text-xs font-semibold text-white hover:bg-brand-primary transition-colors"
                        data-testid="button-share-profile"
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" /> Share
                      </button>
                    </>
                  )}
                </div>
                </div>
                {/* Web of Trust — desktop right sidebar, top-aligned beside the identity. */}
                <div className="hidden md:block md:w-64 md:shrink-0 mt-1">{renderTrustBadge()}</div>
                </div>
                {displayNostrProfile?.about && (
                  <div className="mb-4 overflow-hidden" data-testid="text-profile-about">
                    <p className={`text-xs text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-line break-words overflow-wrap-anywhere ${!aboutExpanded ? "line-clamp-3" : ""}`} style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      {renderLinkedText(displayNostrProfile.about)}
                    </p>
                    {displayNostrProfile.about.length > 140 && (
                      <button
                        onClick={() => setAboutExpanded(!aboutExpanded)}
                        className="text-xs text-brand-primary font-medium mt-1"
                        data-testid="button-about-toggle"
                      >
                        {aboutExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )}

                {isOwnProfile ? (
                  <div className="mb-4 rounded-xl bg-gradient-to-r from-brand-primary/10 via-brand-primary/10 to-white/40 dark:bg-none dark:bg-brand-primary/10 border border-brand-primary/20 dark:border-brand-primary/25 backdrop-blur-sm px-3 sm:px-4 py-3 flex items-start gap-3" data-testid="banner-own-profile">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-primary/15 dark:bg-brand-primary/15 flex items-center justify-center shrink-0">
                      <Eye className="h-4 w-4 text-brand-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Was "This is how others see you" / "the score people see",
                          which promises a single universal number. The card shows the
                          HOUSE score — Brainstorm's vantage point, the default before
                          a viewer's own web of trust applies. The old copy even
                          contradicted itself by adding "scores are
                          personalized" one sentence later. */}
                      <span className="text-xs sm:text-sm font-bold text-brand-primary dark:text-brand-link">This is how Brainstorm sees you</span>
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {houseInfluence01 != null
                          ? "Your public score card — the default view before someone's own network applies. Everyone computes their own number for you, and to yourself you always score 100."
                          : "Your network is still being scored. The more trusted accounts that connect to you, the stronger your card — invite people so more trusted accounts vouch for you."}
                      </p>
                      {houseInfluence01 == null && (
                        <button
                          type="button"
                          onClick={() => setShareOpen(true)}
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-brand-primary dark:text-brand-link hover:text-brand-primary dark:hover:text-brand-link transition-colors"
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
                  <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 sm:px-4 py-3" data-testid="banner-profile-flagged">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="min-w-0 flex-1 text-xs leading-relaxed">
                      <span className="text-xs sm:text-sm font-bold text-red-700 dark:text-red-300">Flagged by your network</span>
                      <p className="mt-0.5 text-[11px] sm:text-xs text-red-700/90 dark:text-red-300/90">
                        Reported by {verifiedCounts.reportedBy} verified {verifiedCounts.reportedBy === 1 ? "account" : "accounts"} in your network
                        {verifiedCounts.mutedBy > 0 ? ` · muted by ${verifiedCounts.mutedBy}` : ""}.
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button type="button" onClick={() => navigate(`/p/${npubParam}/reporters`)} className="font-semibold text-red-700 dark:text-red-300 underline underline-offset-2 hover:text-red-800 dark:hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 rounded" data-testid="banner-profile-flagged-who">
                          See who reported
                        </button>
                        <button type="button" onClick={() => navigate("/what-is-wot")} className="font-medium text-red-700/80 dark:text-red-300/80 underline underline-offset-2 hover:text-red-800 dark:hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 rounded" data-testid="banner-profile-flagged-why">
                          Why am I seeing this?
                        </button>
                      </div>
                    </div>
                  </div>
                ) : confidenceGuidance && (
                  <div className={`mb-4 rounded-xl ${confidenceGuidance.bg} border ${confidenceGuidance.border} backdrop-blur-sm px-3 sm:px-4 py-3 flex items-start gap-3`} data-testid="banner-confidence-guidance">
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${confidenceGuidance.iconBg} flex items-center justify-center shrink-0`}>
                      {confidenceGuidance.icon === "check" && <ShieldCheck className={`h-4 w-4 ${confidenceGuidance.iconColor}`} />}
                      {confidenceGuidance.icon === "shield" && <Shield className={`h-4 w-4 ${confidenceGuidance.iconColor}`} />}
                      {confidenceGuidance.icon === "alert" && <ShieldAlert className={`h-4 w-4 ${confidenceGuidance.iconColor}`} />}
                      {confidenceGuidance.icon === "x" && <ShieldX className={`h-4 w-4 ${confidenceGuidance.iconColor}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs sm:text-sm font-bold ${confidenceGuidance.color}`} data-testid="text-confidence-label">{confidenceGuidance.label}</span>
                        <span className={`text-[10px] font-bold font-mono tabular-nums px-1.5 py-0.5 rounded ${confidenceGuidance.iconBg} ${confidenceGuidance.iconColor}`}>{confidenceGuidance.pct}%</span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{confidenceGuidance.message}</p>
                    </div>
                  </div>
                )}

                {(() => {
                  if (!profileResult || (selfFollowedByList.length === 0 && selfFollowingList.length === 0)) return null;
                  const sharedUnique = new Set([...sharedFollowerPubkeys, ...sharedFollowingPubkeys]);
                  const sharedCount = sharedUnique.size;
                  const mutualFollowersCount = sharedFollowerPubkeys.length;
                  const mutualFollowingCount = sharedFollowingPubkeys.length;
                  const isExpandable = sharedCount > 0;
                  const capHit = followedByQuery.hasNextPage || followingQuery.hasNextPage;
                  const isAnyExpanded = expandedSections["shared_followers"] || expandedSections["shared_following"];

                  return (
                    <div className="mb-4 rounded-xl border border-brand-primary/15 dark:border-brand-primary/25 bg-brand-primary/10 dark:bg-brand-primary/10 overflow-hidden" data-testid="banner-shared-connections">
                      <div
                        className={`px-4 py-3 flex items-start gap-3 ${isExpandable ? "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/15 transition-colors" : ""}`}
                        onClick={isExpandable ? () => {
                          if (isAnyExpanded) {
                            setExpandedSections(prev => ({ ...prev, shared_followers: false, shared_following: false }));
                          } else {
                            toggleSection("shared_followers");
                            if (mutualFollowingCount > 0) {
                              setTimeout(() => toggleSection("shared_following"), 0);
                            }
                          }
                        } : undefined}
                      >
                        <div className="w-8 h-8 rounded-lg bg-brand-primary/15 dark:bg-brand-primary/15 border border-brand-primary/20 dark:border-brand-primary/25 flex items-center justify-center shrink-0 mt-0.5">
                          <SharedConnectionIcon className="h-4 w-4 text-brand-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {sharedCount > 0 ? (
                            <>
                              <p className="text-sm font-semibold text-brand-primary dark:text-brand-link">
                                You share {sharedCount.toLocaleString()} connection{sharedCount !== 1 ? "s" : ""} with this person
                              </p>
                              <p className="text-xs text-brand-primary dark:text-brand-link mt-0.5">
                                {mutualFollowersCount.toLocaleString()} mutual follower{mutualFollowersCount !== 1 ? "s" : ""} · {mutualFollowingCount.toLocaleString()} mutual following
                              </p>
                              {capHit && (
                                <p className="text-[11px] text-brand-primary/60 dark:text-brand-link italic mt-1" data-testid="text-shared-connections-cap-notice">
                                  Based on top 200 connections — full overlap may be larger
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">No shared connections</p>
                              {capHit && (
                                <p className="text-[11px] text-slate-400/70 dark:text-slate-500/70 italic mt-1" data-testid="text-shared-connections-cap-notice">
                                  Based on top 200 connections — overlap may exist beyond this sample
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        {isExpandable && (
                          <ChevronDown className={`h-4 w-4 text-brand-link shrink-0 mt-1 transition-transform ${isAnyExpanded ? "rotate-180" : ""}`} />
                        )}
                      </div>
                      {isAnyExpanded && (
                        <div className="border-t border-brand-primary/15 dark:border-brand-primary/25">
                          {mutualFollowersCount > 0 && (
                            <div>
                              <div
                                className="flex items-center justify-between px-4 py-2 bg-brand-primary/10 dark:bg-brand-primary/[0.06] cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10 transition-colors"
                                onClick={(e) => { e.stopPropagation(); toggleSection("shared_followers"); }}
                                data-testid="toggle-shared-followers"
                              >
                                <div className="flex items-center gap-2">
                                  <FollowersIcon className="h-3.5 w-3.5 text-brand-link" />
                                  <span className="text-xs font-semibold text-brand-primary dark:text-brand-link">
                                    Mutual Followers ({mutualFollowersCount.toLocaleString()})
                                  </span>
                                </div>
                                <ChevronDown className={`h-3.5 w-3.5 text-brand-link transition-transform ${expandedSections["shared_followers"] ? "rotate-180" : ""}`} />
                              </div>
                              {renderExpandedPanel("shared_followers", sharedFollowerPubkeys)}
                            </div>
                          )}
                          {mutualFollowingCount > 0 && (
                            <div>
                              <div
                                className="flex items-center justify-between px-4 py-2 bg-brand-primary/10 dark:bg-brand-primary/[0.06] cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10 transition-colors border-t border-brand-primary/15 dark:border-brand-primary/20"
                                onClick={(e) => { e.stopPropagation(); toggleSection("shared_following"); }}
                                data-testid="toggle-shared-following"
                              >
                                <div className="flex items-center gap-2">
                                  <FollowingIcon className="h-3.5 w-3.5 text-brand-link" />
                                  <span className="text-xs font-semibold text-brand-primary dark:text-brand-link">
                                    Mutual Following ({mutualFollowingCount.toLocaleString()})
                                  </span>
                                </div>
                                <ChevronDown className={`h-3.5 w-3.5 text-brand-link transition-transform ${expandedSections["shared_following"] ? "rotate-180" : ""}`} />
                              </div>
                              {renderExpandedPanel("shared_following", sharedFollowingPubkeys)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {hexPubkey && <ProfileRecentPosts pubkey={hexPubkey} />}

                {(profileResult.followed_by || profileResult.following || profileResult.influence !== undefined) && (() => {
                  const _ovCounts = profileOverviewQuery.data?.counts;
                  const mutedByCount = _ovCounts?.muted_by ?? (Array.isArray(profileResult.muted_by) ? toPubkeys(profileResult.muted_by).length : (profileResult.muted_by || 0));
                  const reportedByCount = _ovCounts?.reported_by ?? (Array.isArray(profileResult.reported_by) ? toPubkeys(profileResult.reported_by).length : (profileResult.reported_by || 0));
                  const mutingCount = _ovCounts?.muting ?? (Array.isArray(profileResult.muting) ? toPubkeys(profileResult.muting).length : (profileResult.muting || 0));
                  const reportingCount = _ovCounts?.reporting ?? (Array.isArray(profileResult.reporting) ? toPubkeys(profileResult.reporting).length : (profileResult.reporting || 0));
                  const hasRiskSignals = mutedByCount > 0 || reportedByCount > 0 || isProfileFlagged;
                  const totalNegativeSignals = mutedByCount + reportedByCount;
                  const vMuted = verifiedCounts.mutedBy;
                  const vReported = verifiedCounts.reportedBy;

                  return (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 overflow-hidden shadow-sm dark:shadow-none">
                      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                          <h4 className="text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-widest" data-testid="header-social-reach">Social Reach</h4>
                        </div>
                        <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">Network Position</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {profileResult.followed_by !== undefined && (() => {
                          const fbValue = profileResult.followed_by;
                          const fbArray = Array.isArray(fbValue) ? fbValue : null;
                          const fbCount = _ovCounts?.followed_by ?? (fbArray ? toPubkeys(fbArray).length : ((fbValue as number) || 0));
                          const fbExpandable = fbCount > 0;
                          return (
                          <div>
                            <div
                              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group ${fbExpandable ? "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06] transition-all duration-200" : ""}`}
                              onClick={fbExpandable ? () => toggleSection("followed_by") : undefined}
                              data-testid="metric-profile-followers"
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/25 flex items-center justify-center shrink-0">
                                  <FollowersIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                                </div>
                                <div>
                                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">{verifiedCounts.loaded ? "Verified Followers" : "Followers"}</p>
                                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">People following this account</p>
                                  {renderTierBadges("followed_by")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums tracking-tight" data-testid="text-profile-followers">
                                    {verifiedCounts.loaded ? verifiedCounts.followers.toLocaleString() : fbCount.toLocaleString()}
                                  </p>
                                  {verifiedCounts.loaded && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums" data-testid="text-verified-followers">of {fbCount.toLocaleString()} total</p>
                                  )}
                                </div>
                                {fbExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${expandedSections["followed_by"] ? "rotate-180" : ""}`} />}
                              </div>
                            </div>
                            {fbExpandable && fbArray && renderExpandedPanel("followed_by", toPubkeys(fbArray))}
                          </div>
                          );
                        })()}
                        {profileResult.following !== undefined && (() => {
                          const fgValue = profileResult.following;
                          const fgArray = Array.isArray(fgValue) ? fgValue : null;
                          const fgCount = _ovCounts?.following ?? (fgArray ? toPubkeys(fgArray).length : ((fgValue as number) || 0));
                          const fgExpandable = fgCount > 0;
                          return (
                          <div>
                            <div
                              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group ${fgExpandable ? "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06] transition-all duration-200" : ""}`}
                              onClick={fgExpandable ? () => toggleSection("following") : undefined}
                              data-testid="metric-profile-following"
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/25 flex items-center justify-center shrink-0">
                                  <FollowingIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                                </div>
                                <div>
                                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">{verifiedCounts.loaded ? "Verified Following" : "Following"}</p>
                                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">Accounts this person follows</p>
                                  {renderTierBadges("following")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums tracking-tight" data-testid="text-profile-following">
                                    {verifiedCounts.loaded ? verifiedCounts.following.toLocaleString() : fgCount.toLocaleString()}
                                  </p>
                                  {verifiedCounts.loaded && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums" data-testid="text-verified-following">of {fgCount.toLocaleString()} total</p>
                                  )}
                                </div>
                                {fgExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${expandedSections["following"] ? "rotate-180" : ""}`} />}
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
                              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group ${mtExpandable ? "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06] transition-all duration-200" : ""}`}
                              onClick={mtExpandable ? () => toggleSection("mutual") : undefined}
                              data-testid="metric-profile-mutual"
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-teal-50 dark:bg-teal-500/10 border border-teal-100 dark:border-teal-500/25 flex items-center justify-center shrink-0">
                                  <MutualIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-teal-500" />
                                </div>
                                <div>
                                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">Mutual</p>
                                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">Follow each other mutually</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums tracking-tight" data-testid="text-profile-mutual">
                                  {mtCount.toLocaleString()}
                                </p>
                                {mtExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${expandedSections["mutual"] ? "rotate-180" : ""}`} />}
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
                            : (typeof profileResult.influence === "number" ? profileResult.influence : null);
                          if (isOwnProfile && inf == null) return null;
                          const infNum = typeof inf === "number" ? inf : 0;
                          return (
                          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 group cursor-help" title="Score from 0-1 based on social graph position. Higher means more connected to well-connected people." data-testid="metric-profile-influence">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-primary/10 dark:bg-brand-primary/10 border border-brand-primary/15 dark:border-brand-primary/25 flex items-center justify-center shrink-0">
                                <BrainLogo size={14} className="text-brand-primary sm:hidden" />
                                <BrainLogo size={16} className="text-brand-primary hidden sm:block" />
                              </div>
                              <div>
                                <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">Influence</p>
                                <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">Network influence rating (0-1)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-2.5">
                              <div className="w-10 sm:w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-primary" style={{ width: `${Math.min(infNum * 100, 100)}%` }} />
                              </div>
                              <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums tracking-tight" data-testid="text-profile-influence">
                                {typeof inf === "number" ? inf.toFixed(2) : "—"}
                              </p>
                            </div>
                          </div>
                          );
                        })()}
                        {followerTierBreakdown && followerTierBreakdown.total > 0 && (
                          <div className="px-3 sm:px-4 py-3 sm:py-4 bg-slate-50/30 dark:bg-slate-900/30" data-testid="card-audience-quality">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-brand-primary" />
                                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Audience Quality</span>
                              </div>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{followerTierBreakdown.total.toLocaleString()} followers</span>
                            </div>
                            <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800" data-testid="bar-audience-quality">
                              {TIER_DISPLAY_CONFIG.map(tier => {
                                const count = followerTierBreakdown.counts[tier.key] || 0;
                                if (count === 0) return null;
                                const widthPct = (count / followerTierBreakdown.total) * 100;
                                return (
                                  <div
                                    key={tier.key}
                                    className="h-full transition-all duration-500"
                                    style={{ width: `${widthPct}%`, backgroundColor: tier.color, minWidth: widthPct > 0 ? "2px" : "0" }}
                                    title={`${tier.name}: ${count}`}
                                  />
                                );
                              })}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                              {TIER_DISPLAY_CONFIG.map(tier => {
                                const count = followerTierBreakdown.counts[tier.key] || 0;
                                if (count === 0) return null;
                                return (
                                  <div key={tier.key} className="flex items-center gap-1.5" data-testid={`legend-tier-${tier.key}`}>
                                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: tier.color }} />
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{tier.name}</span>
                                    <span className="text-[10px] text-slate-900 dark:text-slate-100 font-bold font-mono">{count.toLocaleString()}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 overflow-hidden shadow-sm dark:shadow-none">
                      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-r from-slate-50/60 via-slate-50/40 to-white/60 dark:bg-none dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${hasRiskSignals ? "bg-brand-primary" : "bg-slate-300 dark:bg-slate-700"}`} />
                          <h4 className="text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-widest" data-testid="header-social-context">Social Context</h4>
                        </div>
                        <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">{totalNegativeSignals > 0 ? `${totalNegativeSignals.toLocaleString()} total` : ""}</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {isProfileFlagged && (
                          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3.5 bg-red-50/60 dark:bg-red-500/10" data-testid="metric-profile-flagged-indicator">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-100 dark:bg-red-500/15 border border-red-200 dark:border-red-500/25 flex items-center justify-center shrink-0">
                              <FlaggedIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xs sm:text-sm font-semibold text-red-700 dark:text-red-300">Flagged</p>
                              <p className="text-[10px] sm:text-xs text-red-500 dark:text-red-400 leading-tight">Low trust & reported by 2+ of your trusted contacts</p>
                            </div>
                          </div>
                        )}
                        {profileResult.muted_by !== undefined && (() => {
                          const mbIsArray = Array.isArray(profileResult.muted_by);
                          const mbExpandable = mutedByCount > 0;
                          return (
                          <div>
                            <div
                              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 ${mbExpandable ? "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06] transition-all duration-200" : "cursor-help"}`}
                              title="A soft negative signal. Muting means someone chose to hide this account's content from their feed."
                              onClick={mbExpandable ? () => toggleSection("muted_by") : undefined}
                              data-testid="metric-profile-muted-by"
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center shrink-0 ${mutedByCount > 0 ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25" : "bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800/60"}`}>
                                  <MutedByIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${mutedByCount > 0 ? "text-amber-500" : "text-slate-400 dark:text-slate-500"}`} />
                                </div>
                                <div>
                                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">{verifiedCounts.loaded ? "Verified Muted By" : "Muted By"}</p>
                                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">Others who muted this account</p>
                                  {renderTierBadges("muted_by")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className={`text-lg sm:text-xl font-bold font-mono tabular-nums tracking-tight ${mutedByCount > 0 ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-slate-100"}`} data-testid="text-profile-muted-by">
                                    {verifiedCounts.loaded ? verifiedCounts.mutedBy.toLocaleString() : mutedByCount.toLocaleString()}
                                  </p>
                                  {verifiedCounts.loaded && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums" data-testid="text-verified-muted-by">of {mutedByCount.toLocaleString()} total</p>
                                  )}
                                </div>
                                {mbExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${expandedSections["muted_by"] ? "rotate-180" : ""}`} />}
                              </div>
                            </div>
                            {mbExpandable && Array.isArray(profileResult.muted_by) && renderExpandedPanel("muted_by", toPubkeys(profileResult.muted_by))}
                          </div>
                          );
                        })()}
                        {profileResult.reported_by !== undefined && (() => {
                          const rbIsArray = Array.isArray(profileResult.reported_by);
                          const rbExpandable = reportedByCount > 0;
                          return (
                          <div>
                            <div
                              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 ${rbExpandable ? "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06] transition-all duration-200" : "cursor-help"}`}
                              title="A stronger negative signal than muting. Reports indicate someone flagged this account for harmful or inappropriate behavior."
                              onClick={rbExpandable ? () => toggleSection("reported_by") : undefined}
                              data-testid="metric-profile-reported-by"
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center shrink-0 ${reportedByCount > 0 ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25" : "bg-slate-50 dark:bg-slate-900 border-slate-100 dark:border-slate-800/60"}`}>
                                  <ReportedByIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${reportedByCount > 0 ? "text-red-500" : "text-slate-400 dark:text-slate-500"}`} />
                                </div>
                                <div>
                                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">{verifiedCounts.loaded ? "Verified Reported By" : "Reported By"}</p>
                                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">Reports filed against this account</p>
                                  {renderTierBadges("reported_by")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className={`text-lg sm:text-xl font-bold font-mono tabular-nums tracking-tight ${reportedByCount > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`} data-testid="text-profile-reported-by">
                                    {verifiedCounts.loaded ? verifiedCounts.reportedBy.toLocaleString() : reportedByCount.toLocaleString()}
                                  </p>
                                  {verifiedCounts.loaded && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums" data-testid="text-verified-reported-by">of {reportedByCount.toLocaleString()} total</p>
                                  )}
                                </div>
                                {rbExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${expandedSections["reported_by"] ? "rotate-180" : ""}`} />}
                              </div>
                            </div>
                            {rbExpandable && Array.isArray(profileResult.reported_by) && renderExpandedPanel("reported_by", toPubkeys(profileResult.reported_by))}
                          </div>
                          );
                        })()}
                        {profileResult.muting !== undefined && (() => {
                          const mtIsArray = Array.isArray(profileResult.muting);
                          const mtExpandable = mutingCount > 0;
                          return (
                          <div>
                            <div
                              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 ${mtExpandable ? "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06] transition-all duration-200" : ""}`}
                              onClick={mtExpandable ? () => toggleSection("muting") : undefined}
                              data-testid="metric-profile-muting"
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 flex items-center justify-center shrink-0">
                                  <MutingIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 dark:text-slate-500" />
                                </div>
                                <div>
                                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">Muting</p>
                                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">Accounts this person has muted</p>
                                  {renderTierBadges("muting")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums tracking-tight" data-testid="text-profile-muting">
                                  {mutingCount.toLocaleString()}
                                </p>
                                {mtExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${expandedSections["muting"] ? "rotate-180" : ""}`} />}
                              </div>
                            </div>
                            {mtExpandable && Array.isArray(profileResult.muting) && renderExpandedPanel("muting", toPubkeys(profileResult.muting))}
                          </div>
                          );
                        })()}
                        {profileResult.reporting !== undefined && (() => {
                          const rpIsArray = Array.isArray(profileResult.reporting);
                          const rpExpandable = reportingCount > 0;
                          return (
                          <div>
                            <div
                              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3.5 ${rpExpandable ? "cursor-pointer hover:bg-brand-primary/10 dark:hover:bg-brand-primary/[0.06] transition-all duration-200" : ""}`}
                              onClick={rpExpandable ? () => toggleSection("reporting") : undefined}
                              data-testid="metric-profile-reporting"
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 flex items-center justify-center shrink-0">
                                  <ReportingIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 dark:text-slate-500" />
                                </div>
                                <div>
                                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">Reporting</p>
                                  <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 leading-tight hidden sm:block">Reports filed by this person</p>
                                  {renderTierBadges("reporting")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums tracking-tight" data-testid="text-profile-reporting">
                                  {reportingCount.toLocaleString()}
                                </p>
                                {rpExpandable && <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${expandedSections["reporting"] ? "rotate-180" : ""}`} />}
                              </div>
                            </div>
                            {rpExpandable && Array.isArray(profileResult.reporting) && renderExpandedPanel("reporting", toPubkeys(profileResult.reporting))}
                          </div>
                          );
                        })()}
                      </div>
                    </div>

                    {hasRiskSignals && (() => {
                      const barTotal = mutedByCount + reportedByCount;
                      const mutedPct = barTotal > 0 ? (mutedByCount / barTotal) * 100 : 0;
                      const reportedPct = barTotal > 0 ? (reportedByCount / barTotal) * 100 : 0;
                      return (
                      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 overflow-hidden shadow-sm dark:shadow-none" data-testid="alert-profile-trust-warning">
                        <div className="px-3 sm:px-4 py-3 sm:py-4 bg-slate-50/30 dark:bg-slate-900/30">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-brand-primary" />
                              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Social Context</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isProfileFlagged && (
                                <span className="text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/25 px-1.5 py-0.5 rounded-md">Flagged</span>
                              )}
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{barTotal.toLocaleString()} total</span>
                            </div>
                          </div>
                          {barTotal > 0 && (
                            <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800" data-testid="bar-social-context">
                              {mutedByCount > 0 && (
                                <div
                                  className="h-full transition-all duration-500"
                                  style={{ width: `${mutedPct}%`, backgroundColor: "#f59e0b", minWidth: "2px" }}
                                  title={`Muted by: ${mutedByCount}`}
                                />
                              )}
                              {reportedByCount > 0 && (
                                <div
                                  className="h-full transition-all duration-500"
                                  style={{ width: `${reportedPct}%`, backgroundColor: "#ef4444", minWidth: "2px" }}
                                  title={`Reported by: ${reportedByCount}`}
                                />
                              )}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                            {mutedByCount > 0 && (
                              <div className="flex items-center gap-1.5" data-testid="legend-muted-by">
                                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: "#f59e0b" }} />
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Muted by</span>
                                {vMuted > 0 ? (
                                  <>
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold font-mono">{vMuted} verified</span>
                                    <span className="text-[10px] text-slate-300 dark:text-slate-600 font-medium">of {mutedByCount.toLocaleString()}</span>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-slate-900 dark:text-slate-100 font-bold font-mono">{mutedByCount.toLocaleString()}</span>
                                )}
                              </div>
                            )}
                            {reportedByCount > 0 && (
                              <div className="flex items-center gap-1.5" data-testid="legend-reported-by">
                                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: "#ef4444" }} />
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Reported by</span>
                                {vReported > 0 ? (
                                  <>
                                    <span className="text-[10px] text-red-600 dark:text-red-400 font-bold font-mono">{vReported} verified</span>
                                    <span className="text-[10px] text-slate-300 dark:text-slate-600 font-medium">of {reportedByCount.toLocaleString()}</span>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-slate-900 dark:text-slate-100 font-bold font-mono">{reportedByCount.toLocaleString()}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })()}
                  </div>
                  );
                })()}

                {isAdmin && hexPubkey && (
                  <div className="mt-6 rounded-xl border border-amber-300/60 dark:border-amber-500/25 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 dark:bg-none dark:bg-slate-900 overflow-hidden" data-testid="card-admin-history">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200/60 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/10">
                      <Shield className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">Admin — Brainstorm History</span>
                      <Badge className="ml-auto bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30 text-[10px]">
                        /admin/users/{"{pubkey}"}/history
                      </Badge>
                    </div>
                    <div className="p-4">
                      {adminHistoryQuery.isLoading ? (
                        <div className="flex items-center gap-2 justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                          <span className="text-xs text-slate-500 dark:text-slate-400">Loading history...</span>
                        </div>
                      ) : adminHistoryQuery.isError ? (
                        <div className="text-center py-6">
                          <p className="text-xs text-red-500 dark:text-red-400">Failed to load admin history</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{adminHistoryQuery.error instanceof Error ? adminHistoryQuery.error.message : "Unknown error"}</p>
                        </div>
                      ) : !adminHistoryQuery.data?.items?.length ? (
                        <div className="text-center py-6" data-testid="empty-admin-history">
                          <Shield className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                          <p className="text-xs text-slate-500 dark:text-slate-400">No Brainstorm calculation history for this user</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{adminHistoryQuery.data.total} calculation record{adminHistoryQuery.data.total !== 1 ? "s" : ""}</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-amber-200/40 dark:border-amber-500/20">
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">ID</th>
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Source</th>
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">TA Status</th>
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Pub Status</th>
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Algorithm</th>
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Queue</th>
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Created</th>
                                  <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Updated</th>
                                </tr>
                              </thead>
                              <tbody>
                                {adminHistoryQuery.data.items.map((item: AdminHistoryItem, idx: number) => (
                                  <AdminHistoryRow key={item.private_id || idx} item={item} idx={idx} />
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/")}
                    className="h-10 rounded-xl px-4 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    data-testid="button-profile-new-search"
                  >
                    New Search
                  </Button>
                </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      <style>{`
        @keyframes profileBlobA {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(15px) scale(1.03); }
        }
        @keyframes profileBlobB {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(-20px) scale(1.05); }
        }
        @keyframes profileLineDraw {
          0% { stroke-dashoffset: var(--dash); opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0.18; }
        }
        @keyframes profileLinePulse {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 0.2; }
        }
        @keyframes profileNodePop {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 0.25; transform: scale(1.15); }
          100% { opacity: 0.18; transform: scale(1); }
        }
        @keyframes profileNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-12px); opacity: 0.25; }
        }
        @keyframes profileFadeIn {
          0% { opacity: 0; transform: translateY(24px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl border-slate-200/80 dark:border-slate-800/80 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>Report User</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              This will publish a kind 1984 report event to Nostr relays. Choose a reason below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            {[
              { value: "spam", label: "Spam", desc: "Unsolicited or repetitive content" },
              { value: "impersonation", label: "Impersonation", desc: "Pretending to be someone else" },
              { value: "nudity", label: "Inappropriate Content", desc: "Offensive or explicit material" },
              { value: "other", label: "Other", desc: "Another reason not listed above" },
            ].map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                  reportReason === opt.value
                    ? "border-brand-primary/25 dark:border-brand-primary/[0.3] bg-brand-primary/10 dark:bg-brand-primary/10 shadow-sm dark:shadow-none"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-900/50"
                }`}
                data-testid={`report-option-${opt.value}`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={opt.value}
                  checked={reportReason === opt.value}
                  onChange={() => setReportReason(opt.value)}
                  className="mt-0.5 accent-brand-link"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{opt.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setReportDialogOpen(false)}
              className="flex-1 sm:flex-none h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
              data-testid="button-report-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={social.isPending("report", hexPubkey) || social.isAnyPending}
              onClick={async () => {
                const result = await social.report(hexPubkey, reportReason);
                if (result.cancelled) return;
                if (result.success) {
                  // Show the "you reported this" state immediately — the dialog's
                  // own spinner already covered the publish; don't wait on a relay refetch.
                  setMyReport({ id: "", reportType: reportReason, reason: "", timestamp: Math.floor(Date.now() / 1000), eventIds: [] });
                  toast({ title: "Reported", description: "Report published to Nostr relays" });
                  setReportDialogOpen(false);
                } else {
                  toast({ title: "Error", description: result.error || "Failed to report", variant: "destructive" });
                }
              }}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none"
              data-testid="button-report-confirm"
            >
              {social.isPending("report", hexPubkey) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Flag className="h-3.5 w-3.5" />
              )}
              Submit Report
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAnon ? (
        <footer
          className="relative z-10 mt-auto flex items-center justify-between px-4 sm:px-8 py-4 text-xs"
          data-testid="footer-profile-anon"
        >
          <button
            type="button"
            onClick={() => navigate("/developers")}
            className="font-medium text-slate-500 dark:text-slate-400 hover:text-brand-primary transition-colors"
            data-testid="link-profile-developers"
          >
            Developers
          </button>
          <button
            type="button"
            onClick={() => navigate("/how-search-works")}
            className="font-medium text-slate-500 dark:text-slate-400 hover:text-brand-primary transition-colors"
            data-testid="link-profile-how-search-works"
          >
            How search works
          </button>
        </footer>
      ) : (
        <Footer />
      )}
    </div>
  );
}
