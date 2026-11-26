/**
 * What the Agent Suite page is made of: the assistant's status ladder and its
 * achievements, the tier a followed account's score falls in, and the pure
 * readings behind its cards (status from network size, lookups, the score
 * monitor's order, the attestation history). Storage is ../userPanelState.
 */
import { Eye, Globe, Loader2, Shield, Signal, Sparkles, Star, Zap } from "lucide-react";
import { nip19 } from "nostr-tools";
import { AgentIcon } from "@/components/AgentIcon";
import { TIER_LABELS } from "@/services/trustThreshold";
import type { AgentState, AgentStatus } from "../userPanelState";

export type SortField = "name" | "score" | "tier";
export type SortDir = "asc" | "desc";

export interface FollowedUser {
  pubkey: string;
  npub: string;
  influence: number;
  displayName?: string;
  picture?: string;
  tier: string;
  tierColor: string;
}

export interface LookedUpUser {
  pubkey: string;
  npub: string;
  displayName?: string;
  picture?: string;
}

export interface TaHistoryEntry {
  timestamp: number;
  eventKind: number;
  relays: string[];
  status: "success" | "failure" | "pending";
}

export const AGENT_STATUS_CONFIG: Record<
  AgentStatus,
  {
    label: string;
    color: string;
    bgClass: string;
    borderClass: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    level: number;
  }
> = {
  dormant: {
    label: "Dormant",
    color: "text-slate-400",
    bgClass: "bg-slate-500/20",
    borderClass: "border-slate-500/30",
    icon: AgentIcon,
    description: "Your agent awaits activation",
    level: 0,
  },
  activating: {
    label: "Activating",
    color: "text-amber-400",
    bgClass: "bg-amber-500/20",
    borderClass: "border-amber-500/30",
    icon: Loader2,
    description: "Powering up...",
    level: 0,
  },
  active: {
    label: "Active",
    color: "text-emerald-400",
    bgClass: "bg-emerald-500/20",
    borderClass: "border-emerald-500/30",
    icon: Zap,
    description: "Published to the Nostr network",
    level: 1,
  },
  established: {
    label: "Established",
    color: "text-brand-accent",
    bgClass: "bg-brand-accent/20",
    borderClass: "border-brand-accent/[0.3]",
    icon: Globe,
    description: "Discovered by multiple relays",
    level: 2,
  },
  networked: {
    label: "Networked",
    color: "text-brand-link",
    bgClass: "bg-brand-primary/20",
    borderClass: "border-brand-primary/[0.3]",
    icon: Signal,
    description: "Connected to the wider trust network",
    level: 3,
  },
  trusted: {
    label: TIER_LABELS.trusted,
    color: "text-amber-300",
    bgClass: "bg-amber-400/20",
    borderClass: "border-amber-400/30",
    icon: Star,
    description: "Recognized and trusted across the ecosystem",
    level: 4,
  },
};

export const ACHIEVEMENTS = [
  {
    id: "activated",
    label: "First Spark",
    description: "Activated your agent",
    icon: Zap,
    check: (a: AgentState) => a.status !== "dormant" && a.status !== "activating",
  },
  {
    id: "named",
    label: "Identity",
    description: "Named your agent",
    icon: AgentIcon,
    check: (a: AgentState) => !!a.name,
  },
  {
    id: "published",
    label: "On the Grid",
    description: "Published to Nostr relays",
    icon: Globe,
    check: (a: AgentState) => !!a.publishedAt,
  },
  {
    id: "described",
    label: "Story Told",
    description: "Added a description",
    icon: Sparkles,
    check: (a: AgentState) => !!a.description,
  },
  {
    id: "portrait",
    label: "Portrait",
    description: "Added a profile picture",
    icon: Eye,
    check: (a: AgentState) => !!a.picture,
  },
  {
    id: "lightning",
    label: "Lightning Rod",
    description: "Added a lightning address",
    icon: Zap,
    check: (a: AgentState) => !!a.lud16,
  },
  {
    id: "verified",
    label: "Verified",
    description: "Added NIP-05 identity",
    icon: Shield,
    check: (a: AgentState) => !!a.nip05,
  },
];

export function getTier(influence: number): { name: string; color: string; badgeClass: string } {
  if (influence >= 0.8)
    return {
      name: TIER_LABELS.high,
      color: "text-emerald-600",
      badgeClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  if (influence >= 0.5)
    return {
      name: TIER_LABELS.trusted,
      color: "text-brand-accent",
      badgeClass: "bg-brand-accent/10 border-brand-accent/20 text-brand-accent",
    };
  if (influence >= 0.2)
    return {
      name: "Neutral",
      color: "text-brand-primary",
      badgeClass: "bg-brand-primary/10 border-brand-primary/20 text-brand-primary",
    };
  if (influence >= 0.05)
    return {
      name: TIER_LABELS.low,
      color: "text-amber-600",
      badgeClass: "bg-amber-50 border-amber-200 text-amber-700",
    };
  return {
    name: "Unverified",
    color: "text-slate-500",
    badgeClass:
      "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400",
  };
}

const STATUS_LEVEL: Record<AgentStatus, number> = {
  dormant: 0,
  activating: 1,
  active: 2,
  established: 3,
  networked: 4,
  trusted: 5,
};

/**
 * The state after the one-click publish (BrainstormAssistantCard) landed at
 * `publishedAt`: at least Active, with that publish time. `prev` itself when
 * it already knows a publish this recent.
 */
export function promoteOnPublish(prev: AgentState, publishedAt: number): AgentState {
  if (prev.publishedAt && prev.publishedAt >= publishedAt) return prev;
  const promotedStatus: AgentStatus = STATUS_LEVEL[prev.status] >= STATUS_LEVEL.active ? prev.status : "active";
  return {
    ...prev,
    status: promotedStatus,
    publishedAt,
    activatedAt: prev.activatedAt || publishedAt,
  };
}

/**
 * A live assistant's rung: Established once published with 10 in its network,
 * Networked at 50 with NIP-85 on, Trusted at 100 with a calculation done.
 */
export function nextAgentStatus(
  publishedAt: number | null,
  totalSize: number,
  nip85Activated: boolean,
  hasCalc: boolean,
): AgentStatus {
  let newStatus: AgentStatus = "active";
  if (publishedAt) newStatus = "active";
  if (publishedAt && totalSize >= 10) newStatus = "established";
  if (newStatus === "established" && nip85Activated && totalSize >= 50) newStatus = "networked";
  if (newStatus === "networked" && hasCalc && totalSize >= 100) newStatus = "trusted";
  return newStatus;
}

/** The hex pubkey an "Add by npub" entry names (an npub or 64 hex), or null. */
export function resolveNpubInput(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  try {
    if (input.startsWith("npub1")) {
      const decoded = nip19.decode(input);
      if (decoded.type === "npub") return decoded.data;
      return null;
    }
    if (/^[0-9a-f]{64}$/i.test(input)) return input;
    return null;
  } catch {
    return null;
  }
}

/** The score monitor's rows: matching the search, by name or by score (tier sorts as score). */
export function filterAndSortFollowed(
  followedUsers: FollowedUser[],
  scoreSearch: string,
  scoreSortField: SortField,
  scoreSortDir: SortDir,
): FollowedUser[] {
  let list = [...followedUsers];
  if (scoreSearch.trim()) {
    const q = scoreSearch.toLowerCase();
    list = list.filter(
      (u) =>
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        u.npub.toLowerCase().includes(q) ||
        u.pubkey.toLowerCase().includes(q),
    );
  }
  list.sort((a, b) => {
    let va: string | number, vb: string | number;
    if (scoreSortField === "score" || scoreSortField === "tier") {
      va = a.influence;
      vb = b.influence;
    } else {
      va = (a.displayName || a.npub).toLowerCase();
      vb = (b.displayName || b.npub).toLowerCase();
    }
    if (va < vb) return scoreSortDir === "asc" ? -1 : 1;
    if (va > vb) return scoreSortDir === "asc" ? 1 : -1;
    return 0;
  });
  return list;
}

interface GrapeRankRun {
  created_at?: string;
  updated_at?: string;
  ta_status?: string;
}

/**
 * The Trust Attestation history: the last run's publish (and its creation,
 * when it differs) on the NIP-85 relay, then entries this device recorded
 * (`localHistory`, raw JSON) more than a minute from those; newest first.
 */
export function taHistoryFrom(
  grapeRank: GrapeRankRun | null | undefined,
  nip85Relay: string | null,
  localHistory: string | null,
): TaHistoryEntry[] {
  const entries: TaHistoryEntry[] = [];
  if (grapeRank) {
    const createdAt = grapeRank.created_at
      ? new Date(grapeRank.created_at.endsWith?.("Z") ? grapeRank.created_at : grapeRank.created_at + "Z")
      : null;
    const updatedAt = grapeRank.updated_at
      ? new Date(grapeRank.updated_at.endsWith?.("Z") ? grapeRank.updated_at : grapeRank.updated_at + "Z")
      : null;
    const taStatus = grapeRank.ta_status;
    const relays = nip85Relay ? [nip85Relay] : [];
    if (updatedAt && !isNaN(updatedAt.getTime())) {
      entries.push({
        timestamp: updatedAt.getTime(),
        eventKind: 30382,
        relays,
        status:
          taStatus?.toLowerCase() === "success"
            ? "success"
            : taStatus?.toLowerCase() === "failure"
              ? "failure"
              : "pending",
      });
    }
    if (createdAt && !isNaN(createdAt.getTime()) && createdAt.getTime() !== updatedAt?.getTime()) {
      entries.push({ timestamp: createdAt.getTime(), eventKind: 30382, relays, status: "success" });
    }
  }
  if (localHistory) {
    try {
      const parsed = JSON.parse(localHistory);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (!entries.some((e) => Math.abs(e.timestamp - entry.timestamp) < 60000)) entries.push(entry);
        }
      }
    } catch {}
  }
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries;
}

export const formatTimestamp = (ts: number): string => {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

/** "just now", "5m ago" … "6d ago", then the date; a zoneless server time is UTC. */
export const formatRelativeTime = (dateStr: string | null): string => {
  if (!dateStr) return "Never";
  const date = new Date(dateStr.endsWith?.("Z") ? dateStr : dateStr + "Z");
  if (isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
