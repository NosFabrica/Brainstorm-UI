/**
 * The Agent Suite's account cards: the overview strip, inviting and adding
 * people, the Trust Attestation history, the score monitor over the accounts
 * followed, and the Lists placeholder.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import {
  ArrowUpDown,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  List,
  Loader2,
  Search,
  Settings as SettingsIcon,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useTierRing } from "@/components/score/VerificationCoin";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { useSocialActions } from "@/hooks/useSocialActions";
import { copyToClipboard } from "@/lib/clipboard";
import { publicOrigin } from "@/lib/publicOrigin";
import { fetchProfiles } from "@/services/nostr";
import {
  filterAndSortFollowed,
  formatRelativeTime,
  formatTimestamp,
  getTier,
  resolveNpubInput,
  type FollowedUser,
  type LookedUpUser,
  type SortDir,
  type SortField,
  type TaHistoryEntry,
} from "./agentPanelModel";
import { TrendIndicator } from "./AgentBits";
import { nameIn } from "@/lib/displayName";

/** Pubkey, NIP-85 status, network size and the last calculation, in one strip. */
export function AccountOverviewStrip({
  selfLoading,
  npub,
  truncatedNpub,
  nip85Activated,
  totalNetworkSize,
  lastCalculated,
}: {
  selfLoading: boolean;
  npub: string;
  truncatedNpub: string;
  nip85Activated: boolean;
  totalNetworkSize: number;
  lastCalculated: string | null;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  return (
    <div
      className="rounded-2xl border border-brand-accent/[0.3] bg-gradient-to-r from-slate-950 via-brand-primary to-slate-950 p-4 shadow-lg sm:p-5"
      data-testid="section-account-overview"
    >
      {selfLoading ? (
        <div className="flex animate-pulse gap-4">
          <div className="h-4 w-24 rounded bg-white/10" />
          <div className="h-4 w-32 rounded bg-white/10" />
          <div className="h-4 w-20 rounded bg-white/10" />
        </div>
      ) : (
        <>
          <div className="hidden flex-wrap items-center gap-x-6 gap-y-3 sm:flex">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-link">Pubkey</span>
              <button
                className="flex items-center gap-1 font-mono text-xs text-white/80 transition-colors hover:text-white"
                onClick={() => {
                  copyToClipboard(npub);
                  toast({ title: "Copied!", description: "npub copied to clipboard" });
                }}
                data-testid="button-overview-copy-npub"
              >
                {truncatedNpub}
                <Copy className="h-3 w-3 text-brand-link" />
              </button>
            </div>
            <div className="flex items-center gap-2" data-testid="nip85-inline-status">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-link">NIP-85</span>
              {nip85Activated ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5"
                  data-testid="badge-nip85-active"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Active</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/20 px-2 py-0.5"
                  data-testid="badge-nip85-inactive"
                >
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inactive</span>
                </span>
              )}
              {nip85Activated && (
                <span className="text-[10px] text-slate-500">
                  Brainstorm · <span className="font-mono text-white/50">10040</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-link">Network</span>
              <span className="text-xs font-bold text-white" data-testid="text-overview-network-size">
                {totalNetworkSize.toLocaleString()} users
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-link">Last Calc</span>
              <span className="text-xs text-white/70" data-testid="text-overview-last-calc">
                {formatRelativeTime(lastCalculated)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-brand-accent/[0.3] bg-brand-accent/10 px-2.5 py-1 text-[10px] font-semibold text-brand-accent transition-all hover:bg-brand-accent/20 hover:text-brand-accent"
              data-testid="link-nip85-settings"
            >
              <SettingsIcon className="h-3 w-3" /> Manage
            </button>
          </div>
          <div className="space-y-3 sm:hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                  Pubkey
                </span>
                <button
                  className="flex items-center gap-1 truncate font-mono text-xs text-white/80 transition-colors hover:text-white"
                  onClick={() => {
                    copyToClipboard(npub);
                    toast({ title: "Copied!", description: "npub copied to clipboard" });
                  }}
                  data-testid="button-overview-copy-npub-mobile"
                >
                  {truncatedNpub}
                  <Copy className="h-3 w-3 shrink-0 text-brand-link" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-accent/[0.3] bg-brand-accent/10 px-2.5 py-1 text-[10px] font-semibold text-brand-accent transition-all hover:bg-brand-accent/20 hover:text-brand-accent"
                data-testid="link-nip85-settings-mobile"
              >
                <SettingsIcon className="h-3 w-3" /> Manage
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2" data-testid="nip85-inline-status-mobile">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                  NIP-85
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {nip85Activated ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Active</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/20 px-2 py-0.5">
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inactive</span>
                    </span>
                  )}
                  {nip85Activated && (
                    <span className="text-[10px] text-slate-500">
                      Brainstorm · <span className="font-mono text-white/50">10040</span>
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                  Network
                </span>
                <span className="text-xs font-bold text-white">{totalNetworkSize.toLocaleString()} users</span>
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-link">
                  Last Calc
                </span>
                <span className="text-xs text-white/70">{formatRelativeTime(lastCalculated)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The invite link, and looking someone up by npub to follow them. */
export function InviteCard({ socialActions }: { socialActions: ReturnType<typeof useSocialActions> }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [npubInput, setNpubInput] = useState("");
  const [lookedUpUser, setLookedUpUser] = useState<LookedUpUser | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const handleLookupNpub = async () => {
    const pubkey = resolveNpubInput(npubInput);
    if (!pubkey) {
      toast({
        variant: "destructive",
        title: "Invalid input",
        description: "Please enter a valid npub or hex pubkey.",
      });
      return;
    }
    setLookupLoading(true);
    setLookedUpUser(null);
    let npub: string;
    try {
      npub = nip19.npubEncode(pubkey);
    } catch {
      npub = pubkey;
    }
    const resolved: LookedUpUser = { pubkey, npub };
    try {
      await fetchProfiles([pubkey], (pk, profile) => {
        resolved.displayName = nameIn(profile);
        resolved.picture = profile.picture || profile.image;
      });
    } catch {
      toast({ variant: "destructive", title: "Lookup failed", description: "Could not fetch profile." });
    }
    setLookedUpUser(resolved);
    setLookupLoading(false);
  };

  const handleFollowLookedUp = async () => {
    if (!lookedUpUser) return;
    const result = await socialActions.follow(lookedUpUser.pubkey);
    if (result.cancelled) return;
    if (result.success) {
      toast({
        title: "Followed!",
        description: `You are now following ${lookedUpUser.displayName || lookedUpUser.npub.slice(0, 16) + "..."}`,
      });
    } else {
      toast({ variant: "destructive", title: "Follow failed", description: result.error || "Something went wrong." });
    }
  };

  const handleCopyInviteLink = () => {
    copyToClipboard(publicOrigin());
    toast({ title: "Invite link copied!", description: "Share this link to grow the network." });
  };

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgba(52,211,153,0.05)] backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-[0_20px_40px_-12px_rgba(52,211,153,0.15)] dark:from-slate-900 dark:via-slate-900"
      data-testid="card-invite-users"
    >
      <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400" />
      <div className="border-b border-emerald-500/10 bg-gradient-to-b from-emerald-500/10 to-white/60 px-5 py-4 dark:to-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <UserPlus className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-invite-title"
            >
              Invite & Add Users
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Grow your network</p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Invite Link
          </label>
          <div className="flex gap-2">
            <div
              className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              data-testid="text-invite-link"
            >
              {publicOrigin()}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyInviteLink}
              className="shrink-0 gap-1.5"
              data-testid="button-copy-invite-link"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Add by npub
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="npub1... or hex pubkey"
              value={npubInput}
              onChange={(e) => setNpubInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookupNpub()}
              className="text-sm"
              data-testid="input-add-npub"
            />
            <Button
              size="sm"
              onClick={handleLookupNpub}
              disabled={lookupLoading}
              className="shrink-0 gap-1.5 bg-brand-deep text-white hover:bg-[#292873]"
              data-testid="button-add-npub"
            >
              {lookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}{" "}
              Look Up
            </Button>
          </div>
          {lookedUpUser && (
            <div
              className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center"
              data-testid="card-looked-up-user"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0 border border-slate-100 dark:border-slate-800/60">
                  {lookedUpUser.picture ? (
                    <AvatarImage
                      src={lookedUpUser.picture}
                      alt={lookedUpUser.displayName || "User"}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="bg-brand-primary/10 text-xs font-bold text-brand-primary">
                    {(lookedUpUser.displayName?.charAt(0) || "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
                    data-testid="text-looked-up-name"
                  >
                    {lookedUpUser.displayName || lookedUpUser.npub.slice(0, 16) + "..."}
                  </p>
                  <p className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
                    {lookedUpUser.npub.slice(0, 20)}...
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5 sm:ml-auto">
                {!socialActions.isSelf(lookedUpUser.pubkey) && !socialActions.isFollowing(lookedUpUser.pubkey) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleFollowLookedUp}
                    disabled={socialActions.isPending("follow", lookedUpUser.pubkey)}
                    className="gap-1 text-xs"
                    data-testid="button-follow-looked-up"
                  >
                    <UserPlus className="h-3 w-3" /> Follow
                  </Button>
                )}
                {socialActions.isFollowing(lookedUpUser.pubkey) && (
                  <Badge
                    className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                    data-testid="badge-already-following"
                  >
                    Following
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/p/${lookedUpUser.npub}`)}
                  className="gap-1 text-xs"
                  data-testid="button-view-profile-looked-up"
                >
                  <ExternalLink className="h-3 w-3" /> Profile
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TaHistoryCard({
  grapeRankLoading,
  taHistory,
}: {
  grapeRankLoading: boolean;
  taHistory: TaHistoryEntry[];
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-brand-primary/15 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgba(168,85,247,0.05)] backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-brand-primary/[0.3] hover:shadow-[0_20px_40px_-12px_rgba(168,85,247,0.15)] dark:from-slate-900 dark:via-slate-900"
      data-testid="card-ta-history"
    >
      <div className="h-1 w-full bg-gradient-to-r from-brand-primary via-fuchsia-500 to-brand-primary" />
      <div className="border-b border-brand-primary/10 bg-gradient-to-b from-brand-primary/10 to-white/60 px-5 py-4 dark:to-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <Clock className="h-4 w-4 text-brand-primary" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-ta-title"
            >
              Trust Attestation History
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your published Trust Attestations</p>
          </div>
        </div>
      </div>
      <div className="p-5">
        {grapeRankLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : taHistory.length === 0 ? (
          <div className="py-8 text-center" data-testid="empty-ta-history">
            <Clock className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No attestations yet</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Your Trust Attestation history will appear here after your first calculation.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {taHistory.map((entry, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800/60 dark:bg-slate-900/80 sm:flex-row sm:items-center sm:gap-4"
                data-testid={`row-ta-${idx}`}
              >
                <div className="flex min-w-0 items-center gap-2 sm:w-48">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    kind {entry.eventKind}
                  </Badge>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {entry.relays.map((relay, ri) => (
                    <span
                      key={ri}
                      className="max-w-[200px] truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    >
                      {relay}
                    </span>
                  ))}
                </div>
                <div className="shrink-0">
                  {entry.status === "success" ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                      data-testid={`badge-ta-success-${idx}`}
                    >
                      <Check className="h-3 w-3" /> Success
                    </span>
                  ) : entry.status === "failure" ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"
                      data-testid={`badge-ta-failure-${idx}`}
                    >
                      <X className="h-3 w-3" /> Failed
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700"
                      data-testid={`badge-ta-pending-${idx}`}
                    >
                      <Loader2 className="h-3 w-3 animate-spin" /> Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Scores for the accounts followed, searchable and sortable, with how each moved since this device last looked. */
export function ScoreMonitorCard({
  followedUsers,
  followingCount,
  selfLoading,
  grapeRankLoading,
  previousScores,
}: {
  followedUsers: FollowedUser[];
  followingCount: number;
  selfLoading: boolean;
  grapeRankLoading: boolean;
  previousScores: Map<string, number>;
}) {
  const tierRing = useTierRing();
  const [, navigate] = useLocation();
  const [scoreSearch, setScoreSearch] = useState("");
  const [scoreSortField, setScoreSortField] = useState<SortField>("score");
  const [scoreSortDir, setScoreSortDir] = useState<SortDir>("desc");
  const filteredAndSortedUsers = useMemo(
    () => filterAndSortFollowed(followedUsers, scoreSearch, scoreSortField, scoreSortDir),
    [followedUsers, scoreSearch, scoreSortField, scoreSortDir],
  );

  const toggleSort = (field: SortField) => {
    if (scoreSortField === field) setScoreSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setScoreSortField(field);
      setScoreSortDir("desc");
    }
  };

  return (
    <div
      className="overflow-hidden rounded-2xl border border-brand-accent/15 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgba(14,165,233,0.05)] backdrop-blur-xl dark:from-slate-900 dark:via-slate-900"
      data-testid="card-network-score-monitor"
    >
      <div className="h-1 w-full bg-gradient-to-r from-brand-accent via-brand-primary to-brand-accent" />
      <div className="border-b border-brand-accent/10 bg-gradient-to-b from-brand-accent/10 to-white/60 px-5 py-4 dark:to-slate-900/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
              <Eye className="h-4 w-4 text-brand-accent" />
            </div>
            <div className="min-w-0">
              <h2
                className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-nsm-title"
              >
                Network Score Monitor
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scores for accounts you follow ({followingCount})
              </p>
            </div>
          </div>
          <Input
            placeholder="Search by name or npub..."
            value={scoreSearch}
            onChange={(e) => setScoreSearch(e.target.value)}
            className="h-8 w-full text-xs sm:w-56"
            data-testid="input-score-search"
          />
        </div>
      </div>
      <div className="p-5">
        {selfLoading || grapeRankLoading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-2 w-20 rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        ) : followingCount === 0 ? (
          <div className="py-8 text-center" data-testid="empty-score-monitor">
            <Users className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No followed accounts yet</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Follow users to see their scores here.</p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[auto_1fr_100px_100px_40px] gap-3 border-b border-slate-100 px-3 pb-2 dark:border-slate-800/60 sm:grid">
              <div className="w-8" />
              <button
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                onClick={() => toggleSort("name")}
                data-testid="sort-name"
              >
                Name <ArrowUpDown className="h-3 w-3" />
              </button>
              <button
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                onClick={() => toggleSort("score")}
                data-testid="sort-score"
              >
                Score <ArrowUpDown className="h-3 w-3" />
              </button>
              <button
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                onClick={() => toggleSort("tier")}
                data-testid="sort-tier"
              >
                Tier <ArrowUpDown className="h-3 w-3" />
              </button>
              <span className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Trend
              </span>
            </div>
            <div className="max-h-[400px] divide-y divide-slate-50 overflow-y-auto dark:divide-slate-800">
              {filteredAndSortedUsers.length === 0 ? (
                <div className="py-6 text-center" data-testid="empty-score-search">
                  <p className="text-sm text-slate-400 dark:text-slate-500">No results match your search.</p>
                </div>
              ) : (
                filteredAndSortedUsers.slice(0, 100).map((u) => {
                  const tierInfo = getTier(u.influence);
                  return (
                    <div
                      key={u.pubkey}
                      className="grid cursor-pointer grid-cols-1 gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-900/80 sm:grid-cols-[auto_1fr_100px_100px_40px] sm:gap-3"
                      onClick={() => navigate(`/p/${u.npub}`)}
                      data-testid={`row-score-${u.pubkey.slice(0, 8)}`}
                    >
                      <Avatar
                        className={`h-8 w-8 border border-slate-100 dark:border-slate-800/60 ${tierRing(u.influence) ?? ""}`}
                      >
                        {u.picture ? (
                          <AvatarImage src={u.picture} alt={u.displayName || "User"} className="object-cover" />
                        ) : null}
                        <AvatarFallback className="bg-brand-primary/10 text-xs font-bold text-brand-primary">
                          {(u.displayName?.charAt(0) || "?").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {u.displayName || u.npub.slice(0, 12) + "..."}
                        </p>
                        <p className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500 sm:hidden">
                          {u.npub.slice(0, 16)}...
                        </p>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">
                          {u.influence.toFixed(4)}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${tierInfo.badgeClass}`}
                        >
                          {tierInfo.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-center">
                        <TrendIndicator current={u.influence} previous={previousScores.get(u.pubkey) ?? null} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {filteredAndSortedUsers.length > 100 && (
              <p className="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
                Showing 100 of {filteredAndSortedUsers.length} results
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ListsScaffoldCard() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-white/95 via-white/80 to-brand-primary/10 shadow-[0_0_15px_rgba(0,0,0,0.03)] backdrop-blur-xl dark:border-slate-800 dark:from-slate-900 dark:via-slate-900"
      data-testid="card-lists-scaffold"
    >
      <div className="h-1 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700" />
      <div className="border-b border-slate-200/50 bg-gradient-to-b from-slate-200/30 to-white/60 px-5 py-4 dark:border-slate-800 dark:from-slate-800/30 dark:to-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <List className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-lists-title"
            >
              DCoSL Lists
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Curated lists for decentralized content moderation
            </p>
          </div>
        </div>
      </div>
      <div className="p-5">
        <div className="py-8 text-center" data-testid="scaffold-lists-coming-soon">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
            <List className="h-7 w-7 text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">DCoSL Lists — Coming Soon</p>
          <p className="mx-auto mt-2 max-w-md text-xs text-slate-500 dark:text-slate-400">
            Curated lists will let you create and manage decentralized content moderation lists, enabling collaborative
            trust decisions across the Nostr network.
          </p>
          <Badge
            variant="outline"
            className="mt-4 border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
          >
            Coming Soon
          </Badge>
        </div>
      </div>
    </div>
  );
}
