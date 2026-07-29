import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, VolumeX, UserMinus, ArrowRight, Loader2, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { VerificationCoin } from "@/components/score/VerificationCoin";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useNetworkAlerts, selectFlaggedAlerts } from "@/hooks/useNetworkAlerts";
import type { NetworkAlertEntry } from "@/services/api";
import { fetchProfileMap } from "@/services/nostr";
import { unfollowUser, muteUser } from "@/services/socialActions";
import { npubFromPubkey } from "@/lib/shareId";
import { computeNewAlerts, markAlertsSeen } from "@/lib/networkAlertsSeen";

type ProfileLite = { name?: string; display_name?: string; picture?: string; nip05?: string };
type PendingAction = { pubkey: string; name: string; action: "unfollow" | "mute" };

/** A direct follow's verified muters clearly outweigh its followers → "widely muted". */
function isWidelyMuted(e: NetworkAlertEntry): boolean {
  return e.verifiedMuterCount >= 50 && e.verifiedMuterCount >= e.verifiedFollowerCount;
}

/**
 * Live Network Alerts — the dashboard's trust-&-safety console. Surfaces accounts
 * IN the observer's network that verified people report past threshold (flagged),
 * direct follows first, extended reach second. Fully async (its own query) so the
 * ~10s call never blocks the rest of the dashboard. Client-side deltas mark what's
 * NEW since the last visit; per-row you can investigate (deep dive) or act
 * (unfollow / mute, each confirmed).
 */
export function NetworkAlertsModule({ observer, enabled }: { observer: string; enabled: boolean }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const q = useNetworkAlerts(observer, { enabled });
  const data = q.data?.data;

  const flagged = useMemo(() => selectFlaggedAlerts(data), [data]);
  const direct = useMemo(() => flagged.filter((e) => e.hops <= 1), [flagged]);
  const extended = useMemo(() => flagged.filter((e) => e.hops >= 2), [flagged]);

  // Resolve names/avatars for every flagged account (batched).
  const flaggedPubkeys = useMemo(() => flagged.map((e) => e.pubkey), [flagged]);
  const profilesQuery = useQuery({
    queryKey: ["network-alerts-profiles", flaggedPubkeys.join(",")],
    queryFn: () => fetchProfileMap(flaggedPubkeys),
    enabled: flaggedPubkeys.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const profiles: Map<string, ProfileLite> = profilesQuery.data ?? new Map();

  // Deltas: compute "new since last visit" once per snapshot; establish a silent
  // baseline on the first-ever visit (nothing is "new" then).
  const [newSet, setNewSet] = useState<Set<string>>(new Set());
  const flaggedSig = flaggedPubkeys.join(",");
  useEffect(() => {
    if (!observer || !data) return;
    const { newPubkeys } = computeNewAlerts(observer, flaggedPubkeys);
    setNewSet(new Set(newPubkeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer, flaggedSig, !!data]);

  // Optimistic removal after a confirmed unfollow/mute.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [showExtended, setShowExtended] = useState(false);

  // New-first within each section so a freshly-flagged account jumps to the top
  // (and carries the NEW tag) instead of hiding mid-list or in extended.
  const newFirst = (arr: NetworkAlertEntry[]) =>
    [...arr].sort((a, b) => (newSet.has(b.pubkey) ? 1 : 0) - (newSet.has(a.pubkey) ? 1 : 0));
  const visibleDirect = newFirst(direct.filter((e) => !dismissed.has(e.pubkey)));
  const visibleExtended = newFirst(extended.filter((e) => !dismissed.has(e.pubkey)));
  const newCount = [...visibleDirect, ...visibleExtended].filter((e) => newSet.has(e.pubkey)).length;
  // Extended reach can be large (up to 100). Pin the NEW ones (always visible) and
  // cap the rest behind the toggle so the tile never balloons to a 100-row list.
  const EXT_CAP = 6;
  const newExtended = visibleExtended.filter((e) => newSet.has(e.pubkey));
  const restExtended = visibleExtended.filter((e) => !newSet.has(e.pubkey));

  const nameFor = (pk: string) => profiles.get(pk)?.display_name || profiles.get(pk)?.name || `${npubFromPubkey(pk).slice(0, 12)}…`;

  function markAllSeen() {
    markAlertsSeen(observer, flaggedPubkeys);
    setNewSet(new Set());
  }

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    const { pubkey, name, action } = pending;
    const res = action === "unfollow" ? await unfollowUser(pubkey) : await muteUser(pubkey);
    setBusy(false);
    setPending(null);
    if (res.success) {
      setDismissed((s) => new Set(s).add(pubkey));
      toast({ title: action === "unfollow" ? `Unfollowed ${name}` : `Muted ${name}`, duration: 4000 });
    } else {
      toast({ title: `Couldn't ${action} ${name}`, description: res.error, variant: "destructive", duration: 6000 });
    }
  }

  // ---- states -------------------------------------------------------------
  const header = (
    <div className="flex items-center gap-2">
      <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60 shadow-sm text-brand-deep ring-1 ring-slate-100 dark:ring-slate-800">
        <ShieldAlert className="h-3.5 w-3.5" />
      </div>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        Network Alerts
      </span>
      {newCount > 0 && (
        <span className="ml-1 inline-flex items-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400 px-2 py-0.5 text-[11px] font-bold" data-testid="network-alerts-new-count">
          {newCount} new
        </span>
      )}
      {newCount > 0 && (
        <button type="button" onClick={markAllSeen} className="ml-auto text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded" data-testid="network-alerts-mark-seen">
          Mark all seen
        </button>
      )}
    </div>
  );

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-4 flex flex-col gap-3 h-full" data-testid="card-network-alerts">
      {header}

      {!enabled ? (
        <div className="flex flex-col items-start gap-2 py-2" data-testid="network-alerts-pending">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-accent/10 border border-brand-accent/20">
            <ShieldCheck className="h-4 w-4 text-brand-deep dark:text-brand-accent" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Your safety radar is warming up</p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            As soon as your trust scores finish calculating, we'll flag anyone in your network that people you trust have reported or muted — so you can act on it right here.
          </p>
        </div>
      ) : q.isLoading ? (
        <div className="space-y-2" data-testid="network-alerts-scanning">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning your network…
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      ) : q.isError ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Couldn't scan your network.{" "}
          <button type="button" onClick={() => q.refetch()} className="font-semibold text-brand-link hover:underline">Try again</button>
        </div>
      ) : visibleDirect.length === 0 && visibleExtended.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" data-testid="network-alerts-clear">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          Your network looks clean — no flagged accounts.
        </div>
      ) : (
        <>
          {visibleDirect.length > 0 && (
            <div className="space-y-1.5" data-testid="network-alerts-direct">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Flagged in your follows ({visibleDirect.length})</p>
              {visibleDirect.map((e) => (
                <AlertRow key={e.pubkey} entry={e} name={nameFor(e.pubkey)} picture={profiles.get(e.pubkey)?.picture} isNew={newSet.has(e.pubkey)}
                  onDeepDive={() => navigate(`/profile/${npubFromPubkey(e.pubkey)}`)}
                  onWhy={() => navigate(`/p/${npubFromPubkey(e.pubkey)}/reporters`)}
                  onUnfollow={() => setPending({ pubkey: e.pubkey, name: nameFor(e.pubkey), action: "unfollow" })}
                  onMute={() => setPending({ pubkey: e.pubkey, name: nameFor(e.pubkey), action: "mute" })}
                />
              ))}
            </div>
          )}

          {visibleExtended.length > 0 && (
            <div data-testid="network-alerts-extended">
              {/* Newly-flagged extended accounts are always shown — never buried. */}
              {newExtended.length > 0 && (
                <div className="space-y-1.5 mb-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">New in your extended reach</p>
                  {newExtended.map((e) => (
                    <AlertRow key={e.pubkey} entry={e} name={nameFor(e.pubkey)} picture={profiles.get(e.pubkey)?.picture} isNew
                      onDeepDive={() => navigate(`/profile/${npubFromPubkey(e.pubkey)}`)}
                      onWhy={() => navigate(`/p/${npubFromPubkey(e.pubkey)}/reporters`)}
                      onUnfollow={() => setPending({ pubkey: e.pubkey, name: nameFor(e.pubkey), action: "unfollow" })}
                      onMute={() => setPending({ pubkey: e.pubkey, name: nameFor(e.pubkey), action: "mute" })}
                    />
                  ))}
                </div>
              )}
              {restExtended.length > 0 && (
                <>
                  <button type="button" onClick={() => setShowExtended((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded">
                    <ChevronDown className={`h-3 w-3 transition-transform ${showExtended ? "rotate-180" : ""}`} />
                    Also in your extended reach ({restExtended.length})
                  </button>
                  {showExtended && (
                    <div className="mt-1.5 space-y-1.5">
                      {restExtended.slice(0, EXT_CAP).map((e) => (
                        <AlertRow key={e.pubkey} entry={e} name={nameFor(e.pubkey)} picture={profiles.get(e.pubkey)?.picture} isNew={false}
                          onDeepDive={() => navigate(`/profile/${npubFromPubkey(e.pubkey)}`)}
                          onWhy={() => navigate(`/p/${npubFromPubkey(e.pubkey)}/reporters`)}
                          onUnfollow={() => setPending({ pubkey: e.pubkey, name: nameFor(e.pubkey), action: "unfollow" })}
                          onMute={() => setPending({ pubkey: e.pubkey, name: nameFor(e.pubkey), action: "mute" })}
                        />
                      ))}
                      {restExtended.length > EXT_CAP && (
                        <p className="px-1 pt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                          +{restExtended.length - EXT_CAP} more flagged in your extended reach
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) setPending(null); }}>
        <AlertDialogContent data-testid="network-alerts-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === "unfollow" ? `Unfollow ${pending?.name}?` : `Mute ${pending?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "unfollow"
                ? "This updates your follow list on Nostr. You can re-follow anytime."
                : "This adds them to your mute list on Nostr. You can unmute anytime."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(ev) => { ev.preventDefault(); runAction(); }} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : pending?.action === "unfollow" ? "Unfollow" : "Mute"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AlertRow({ entry, name, picture, isNew, onDeepDive, onWhy, onUnfollow, onMute }: {
  entry: NetworkAlertEntry; name: string; picture?: string; isNew: boolean;
  onDeepDive: () => void; onWhy: () => void; onUnfollow: () => void; onMute: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/60 p-2" data-testid={`network-alert-row-${entry.pubkey.slice(0, 8)}`}>
      <div className="relative shrink-0">
        <Avatar className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-800">
          {picture ? <AvatarImage src={picture} alt={name} className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden rounded-full"><DefaultAvatarImg /></AvatarFallback>
        </Avatar>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>
          {isNew && <span className="shrink-0 rounded-full bg-red-500 text-white px-1.5 py-0.5 text-[9px] font-bold leading-none" data-testid="network-alert-new">NEW</span>}
          {isWidelyMuted(entry) && <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-bold"><VolumeX className="h-2.5 w-2.5" />muted</span>}
        </div>
        <button type="button" onClick={onWhy} className="block truncate text-left text-[11px] text-slate-500 dark:text-slate-400 hover:text-brand-link hover:underline" data-testid="network-alert-why">
          {entry.verifiedReporterCount} verified reports{entry.verifiedMuterCount > 0 ? ` · muted by ${entry.verifiedMuterCount}` : ""}
        </button>
      </div>
      <VerificationCoin score01={entry.influence} pov="global" size={22} className="shrink-0" />
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onDeepDive} title="View profile" aria-label={`View ${name}'s profile`} className="inline-flex items-center gap-1 rounded-md border border-brand-accent/30 bg-brand-accent/[0.06] px-2 py-1 text-[11px] font-semibold text-brand-deep dark:text-brand-accent hover:border-brand-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40" data-testid="network-alert-deepdive">
          View <ArrowRight className="h-3 w-3" />
        </button>
        <button type="button" onClick={onUnfollow} title="Unfollow" aria-label={`Unfollow ${name}`} className="rounded-md p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40" data-testid="network-alert-unfollow">
          <UserMinus className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onMute} title="Mute" aria-label={`Mute ${name}`} className="rounded-md p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40" data-testid="network-alert-mute">
          <VolumeX className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
