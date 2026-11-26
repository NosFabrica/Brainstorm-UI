import { useState, useEffect, useCallback, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { GlossBackground } from "@/components/GlossBackground";
import { PageHeader } from "@/components/PageHeader";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { ProfileEditForm } from "@/components/ProfileEditForm";
import { useQuery } from "@tanstack/react-query";
import {
  presetDisplayLabel,
  presetDescription,
  presetDisplayLabelFromBackend,
  type TrustPreset,
} from "@/services/trustThreshold";
import { useTrustPresetSync, useSetTrustPreset } from "@/hooks/useTrustPresetSync";
import {
  Settings as SettingsIcon,
  Check,
  Loader2,
  ArrowRight,
  CreditCard,
  Copy,
  User,
  ShieldCheck,
  Download,
  ChevronDown,
  Key,
  AlertTriangle,
  IdCard,
  SlidersHorizontal,
  ShieldAlert,
  ChevronRight,
  BookOpen,
  MessageCircle,
  Bot,
} from "lucide-react";
import { ignoredAlertMap, hasUnsyncedIgnores } from "@/lib/networkAlertsIgnored";
import { useIgnoreSyncState } from "@/hooks/useIgnoreSyncState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InfoHint } from "@/components/InfoHint";
import { copyToClipboard } from "@/lib/clipboard";
import { logout } from "@/accounts/login-flow";
import { isNip85Activated } from "@/lib/nip85Activation";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { PasskeySettings } from "@/components/PasskeySettings";
import { useBackupNeed } from "@/hooks/useBackupNeed";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { deliverBackup } from "@/lib/accountBackup";
import {
  canBackUp,
  heldBackup,
  keyAccessMessage,
  MIN_RECOVERY_PASSWORD_LENGTH,
  revealSecretKey,
  setRecoveryPassword,
} from "@/accounts/backup";
import { isAuthRedirecting } from "@/services/api";
import { useSelfOverview, useSelfHistory } from "@/hooks/useSelf";
import { grapeRankResultOptions } from "@/services/queries/graperank";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useScoreDisplayMode, type ScoreDisplayMode } from "@/hooks/useScoreDisplayMode";
import { useTierGranularity } from "@/hooks/useTierGranularity";
import type { Granularity } from "@/lib/trustLadder";

// The three renderings of the one tier ladder (docs/score-display/DECISIONS.md).
const TIER_GRANULARITY_CHOICES: { key: Granularity; label: string; desc: string }[] = [
  { key: "simple", label: "Simple", desc: "Verified · Unknown · Flagged" },
  { key: "detailed", label: "Detailed", desc: "the full six-step ladder" },
];
const SCORE_DISPLAY_CHOICES: { key: ScoreDisplayMode; label: string; desc: string }[] = [
  { key: "number", label: "Number", desc: "0\u2013100 score" },
  { key: "level", label: "Level", desc: "5-step dots" },
  { key: "tier", label: "Tier", desc: "color ring, no words" },
  { key: "word", label: "Word", desc: "ring + tier label" },
  { key: "off", label: "Off", desc: "nothing shown" },
];
import { Footer } from "@/components/Footer";
import { BillingCard } from "@/components/billing/BillingCard";
import { BrainstormAssistantCard } from "@/components/BrainstormAssistantCard";
import { TagRelaysCard } from "@/components/settings/TagRelaysCard";
import { MessagesSettingsCard } from "@/components/settings/MessagesSettingsCard";
import {
  assistantViewsFor,
  settingsTabsFor,
  settingsTargetFor,
  type AssistantView,
  type SettingsTabKey,
} from "@/lib/settingsTab";
import { TechnicalViewCard } from "@/components/settings/TechnicalViewCard";
import { SignOutEverywhereRow } from "@/components/settings/SignOutEverywhereRow";
import { DictionaryTab } from "@/components/settings/DictionaryTab";
import { AssistantsTab } from "@/components/settings/AssistantsTab";
import { TreasureMapTab } from "@/components/settings/TreasureMapTab";
import { YourAssistants } from "@/components/settings/YourAssistants";
import { markOwnScores } from "@/lib/ownScores";
import { InternalChip } from "@/components/InternalChip";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";
import { useTrustAnchorActions } from "./settings/useTrustAnchorActions";
import { calcStatusOf } from "./settings/calcStatus";
import { useRecalculateGrapeRank } from "./settings/useRecalculateGrapeRank";
import { ServiceProviderCard } from "./settings/ServiceProviderCard";
import { TrustCalcCard } from "./settings/TrustCalcCard";

type SettingsTab = SettingsTabKey;

const inputCls =
  "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 transition disabled:opacity-60";

// "About" not "About & support": three labels share a 339px track at 375px
// wide and only fitted after a padding fix (see the tab-bar comment below).
// A fourth tab was briefly here for Tags; it moved to /tags/mine because
// nothing on it was a setting. Which relays to read IS one, and lives under
// Trust & search.
const TABS: { key: SettingsTab; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "trust", label: "Trust & Search", icon: ShieldCheck },
  // The reader's Assistants (2026-10-23, one tab since 2026-11-02): the one Brainstorm
  // hosts for them; every one they've tagged and what each does (Tapestry's My
  // Assistants); and the Treasure Map that hands out the duties — as views
  // (lib/settingsTab assistantViewsFor), the last three admins' only for now.
  { key: "assistants", label: "Assistants", icon: Bot },
  // Its own tab (2026-10-05), out of Trust & search: a reader looks for message settings
  // under "Messages". Where the inbox's "Manage" (and its settings icon) lands.
  { key: "messages", label: "Messages", icon: MessageCircle },
  // The concepts the reader's Assistant keeps for them (2026-10-01: a Settings
  // tab by the team's choice). Past the 375px track, so phones scroll to it.
  // Admins only while it's an internal demo (2026-10-05): see ADMIN_ONLY_TABS.
  { key: "dictionary", label: "Dictionary", icon: BookOpen },
  // Billing lives in Settings because Settings is where you CHANGE things —
  // cancelling is the most consequential account action in the product, and it
  // belongs next to the other irreversible ones rather than on a status page
  // someone lands on while checking a date. The read-only half is on /insights.
  { key: "billing", label: "Billing", icon: CreditCard },
];

// Which tabs an admin has and everyone else has — and which are internal, said
// so on the tab — is lib/settingsTab (settingsTabsFor). The Dictionary
// (2026-10-05): still an internal demo. Its renderers, on list items' pages,
// cards and search rows, are for everyone; only the page about them is hidden.

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  // Live identity: the header avatar updates the moment a profile save lands.
  const user = useActiveAccountDisplay();
  const isAdmin = user?.isAdmin === true;
  const entries = settingsTabsFor({ admin: isAdmin });
  const tabs = entries.map((e) => ({ ...TABS.find((t) => t.key === e.key)!, internal: e.internal }));
  const params = new URLSearchParams(search);
  // Old links — `?tab=trust&focus=messages`, the three old Assistant tabs — land
  // where they pointed (lib/settingsTab); a view the reader doesn't have is "yours".
  const target = settingsTargetFor(
    { tab: params.get("tab"), view: params.get("view"), focus: params.get("focus") },
    tabs.map((t) => t.key),
    { admin: isAdmin },
  );
  const activeTab: SettingsTab = target.tab;
  const assistantView: AssistantView = target.view ?? "yours";
  const assistantViews = assistantViewsFor({ admin: isAdmin });
  // Deep links into a specific control, so a "you can change this in Settings"
  // sentence elsewhere lands ON the thing rather than at the top of a tab:
  //   ?focus=backup      → Account > Back up
  //   ?tab=trust&focus=tag-relays → Trust > Advanced > Where tags come from
  const focusParam = new URLSearchParams(search).get("focus");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightBackup = highlighted === "backup";
  // Tag relays live inside the collapsed "Advanced" block, so a link that only
  // scrolled would land on a closed section. Open it before we scroll.
  const [advancedOpen, setAdvancedOpen] = useState(focusParam === "tag-relays");
  useEffect(() => {
    const target =
      focusParam === "backup"
        ? "account-backup-section"
        : focusParam === "tag-relays"
          ? "tag-relays-section"
          : focusParam === "messages"
            ? "messages-section"
            : null;
    if (!target) return;
    const t = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(focusParam);
    }, 150);
    // Drop the cue once it has pulsed (2 × 1.5s) so it's a one-time nudge.
    const off = setTimeout(() => setHighlighted(null), 3400);
    return () => {
      clearTimeout(t);
      clearTimeout(off);
    };
  }, [focusParam]);
  const goTab = (t: SettingsTab) => {
    navigate(t === "profile" ? "/settings" : `/settings?tab=${t}`);
  };

  const { toast } = useToast();

  const { preset: serverPreset, isLoading: presetLoading } = useTrustPresetSync(!!user);
  const [optimisticPreset, setOptimisticPreset] = useState<TrustPreset | null>(null);
  const activePreset: TrustPreset = optimisticPreset ?? serverPreset ?? "default";

  // Rendered from one list so labels can't drift from the store's values.
  const [scoreDisplayMode, setScoreDisplayModeChoice] = useScoreDisplayMode();
  const [tierGranularity, setTierGranularityChoice] = useTierGranularity();

  const setPresetMutation = useSetTrustPreset({
    pubkey: user?.pubkey,
    onMutate: (preset) => {
      const previous = optimisticPreset;
      setOptimisticPreset(preset);
      return { previous };
    },
    onSettledOk: (preset) => {
      setOptimisticPreset(null);
      const lastResult = queryClient.getQueryData<{ data?: { graperank_preset_used?: string } }>([
        "/user/graperankResult",
      ]);
      const previousUsedLabel = presetDisplayLabelFromBackend(lastResult?.data?.graperank_preset_used);
      const newLabel = presetDisplayLabel(preset);
      const description = previousUsedLabel
        ? `Your pages use ${newLabel} now. Published numbers still reflect ${previousUsedLabel} until your next calculation.`
        : `Your pages use ${newLabel} now.`;
      // Offer — never demand — a recalculation. The switch already worked
      // in-app (every preset-driven read was just invalidated), so a blocking
      // "are you sure?" would imply it hadn't, and would punish the
      // flip-and-compare loop these three buttons invite. But the published
      // Trusted Assertions — the numbers OTHER apps show — keep the old preset
      // until the next run, which on the free schedule can be 60 days out.
      // One click in the toast closes that gap at the moment of highest
      // intent, and manual recalculation is unlimited so it costs nothing.
      toast({
        title: "Trust perspective updated",
        description,
        duration: 8000,
        action: (
          <ToastAction
            altText="Recalculate now"
            onClick={() => triggerGrapeRankMutation.mutate()}
            data-testid="toast-recalc-now"
          >
            Recalculate now
          </ToastAction>
        ),
      });
    },
    onError: (error, _preset, context) => {
      setOptimisticPreset((context as { previous?: TrustPreset } | undefined)?.previous ?? null);
      toast({
        variant: "destructive",
        title: "Couldn't save preset",
        description: error instanceof Error ? error.message : "Please try again.",
        duration: 5000,
      });
    },
  });

  const handlePresetChange = useCallback(
    (preset: TrustPreset) => {
      if (preset === activePreset || setPresetMutation.isPending) return;
      setPresetMutation.mutate(preset);
    },
    [activePreset, setPresetMutation],
  );

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const pubkey = user?.pubkey ?? "";

  const [backupMode, setBackupMode] = useState(false);
  const [backupPass, setBackupPass] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  /** The same answer the nag chain reads, so Settings can't say "backed up" while it asks. */
  const backedUp = useBackupNeed() === null;

  const backupMismatch = backupConfirm.length > 0 && backupPass !== backupConfirm;
  /**
   * A password is asked for only where the Account has no Backup yet — a migrated
   * one, whose key opens from the Unlock cache and nowhere else. Then it *is* the
   * Account's Recovery password, set here, exactly as `BackupPrompt` does it.
   *
   * Where a Backup already exists there is nothing to ask: it was minted at signup
   * under a password the user chose, and that is what the file's own instructions
   * tell them to use. This used to mint a second one under whatever was typed
   * here, so those files opened with a password the instructions never mentioned —
   * and "wrong password" on a backup reads as a corrupt file, not a wrong key.
   */
  const needsRecoveryPassword = !heldBackup();
  const canBackup =
    !needsRecoveryPassword || (backupPass.length >= MIN_RECOVERY_PASSWORD_LENGTH && backupPass === backupConfirm);
  /** Reaching the key waits for the account to unlock — the button says so. */
  const [backupBusy, setBackupBusy] = useState(false);
  const handleBackupDownload = async () => {
    if (!canBackup || backupBusy) return;
    setBackupBusy(true);
    try {
      // The same hand-over every other backup surface performs — file, password
      // manager and the mark, in one place, so this one cannot drift from them
      // again.
      if (needsRecoveryPassword) await setRecoveryPassword(backupPass);
      if (!deliverBackup()) throw new Error("No backup to deliver");
      setBackupMode(false);
      setBackupPass("");
      setBackupConfirm("");
      toast({
        title: "Backup saved",
        description: "Saved to your password manager where supported — keep the file too.",
      });
    } catch (err) {
      const message = keyAccessMessage(err);
      if (message) toast({ variant: "destructive", title: "Couldn't create your backup", description: message });
    } finally {
      setBackupBusy(false);
    }
  };

  const [showSecret, setShowSecret] = useState(false);
  const [secretNsec, setSecretNsec] = useState("");
  const [revealBusy, setRevealBusy] = useState(false);
  const handleRevealSecret = async () => {
    if (revealBusy) return;
    setRevealBusy(true);
    try {
      setSecretNsec(await revealSecretKey());
      setShowSecret(true);
    } catch (err) {
      const message = keyAccessMessage(err);
      if (message) toast({ variant: "destructive", title: "Couldn't reach your key", description: message });
    } finally {
      setRevealBusy(false);
    }
  };

  const { data: overviewData, isPending: overviewLoading } = useSelfOverview(user?.pubkey);
  const { data: historyData, isPending: historyLoading } = useSelfHistory(user?.pubkey);
  const selfLoading = overviewLoading || historyLoading;

  // Polled app-wide while a run is in flight (hooks/useScoringStatus), not here.
  const { data: grapeRankData, isPending: grapeRankLoading } = useQuery({
    ...grapeRankResultOptions(),
    enabled: !!user,
  });

  const triggerGrapeRankMutation = useRecalculateGrapeRank();

  const calcDoneNow = grapeRankData?.data?.internal_publication_status === "success";
  useEffect(() => {
    if (calcDoneNow) markOwnScores(user?.pubkey);
  }, [calcDoneNow, user?.pubkey]);
  const { isRecalcInProgress, isGrapeRankFailedState, grapeRankStatus, lastCalculated, lastTriggered, taPubkey } =
    calcStatusOf(grapeRankData?.data, historyData?.data);
  const followingCount = overviewData?.data?.counts?.following ?? null;
  const hasNoFollowing = !selfLoading && followingCount === 0;

  // "Status: Active / Provider: Brainstorm" must answer for the on-relay
  // 10040, not the local flag alone — the flag never downgrades on a relay
  // miss, so after the user activates a different provider elsewhere it would
  // keep this card lying. A definitive foreign declaration ("other") reads as
  // not activated; absence/silence keeps the flag's answer.
  const trustProviderStatus = useTrustProviderStatus(user?.pubkey, taPubkey);
  const nip85Activated =
    trustProviderStatus.data === "brainstorm" ||
    (trustProviderStatus.data !== "other" && isNip85Activated(user?.pubkey));
  const trustAnchor = useTrustAnchorActions(user?.pubkey, taPubkey);

  // Network Alerts card inputs (see the card below). Hooks, so they live above
  // the guard: `user` can drop to null while this page is mounted, and a hook
  // below the guard would change the hook count between renders.
  const ignoredListCount = useMemo(() => (pubkey ? ignoredAlertMap(pubkey).size : 0), [pubkey]);
  const ignoreSync = useIgnoreSyncState();

  if (!user || isAuthRedirecting()) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // PROFILE TAB
  // ─────────────────────────────────────────────────────────────────────────
  const profileCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-profile"
    >
      <ProfileEditForm
        onSaved={() =>
          toast({ title: "Profile saved", description: "Your profile has been published.", duration: 3000 })
        }
      />
    </div>
  );

  const accountCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-account"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <ShieldCheck className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-account-title"
            >
              Account
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-account-subtitle">
              Your identity and backup
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {canBackUp() && (!backedUp || !user?.picture) && (
          <div
            className="bg-brand-accent/8 flex items-start rounded-xl border border-brand-accent/20 px-3.5 py-3"
            data-testid="hint-finish-setup"
          >
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">Finish setting up.</span>{" "}
              {!backedUp && !user?.picture
                ? "Back up your account and add a profile photo below."
                : !backedUp
                  ? "Back up your account below so you can sign in on another device."
                  : "Add a profile photo so people recognize you."}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3" data-testid="row-account-npub">
          <div className="min-w-0">
            <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Your public ID
              <InfoHint label="About your public ID">
                Your public address on the network (your "npub") — safe to share with anyone.
              </InfoHint>
            </p>
            <p className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">{user.npub}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await copyToClipboard(user.npub);
              toast({ title: "Copied!", description: "npub copied to clipboard" });
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            data-testid="button-account-copy-npub"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>

        <PasskeySettings />

        {canBackUp() && (
          <div
            id="account-backup-section"
            className="scroll-mt-20 border-t border-slate-100 pt-4 dark:border-slate-800/60"
            data-testid="row-account-backup"
          >
            {backedUp ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Backed up</div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">Encrypted backup file downloaded</div>
                </div>
              </div>
            ) : backupMode ? (
              <div>
                <label
                  htmlFor="account-backup-pass"
                  className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  Back up your account
                </label>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  {needsRecoveryPassword
                    ? "Choose a recovery password. It encrypts your backup file and unlocks your account — keep it safe, no one can reset it."
                    : "Your encrypted backup file, ready to download. It opens with the recovery password you already chose — this file plus that password is how you sign in on another device."}
                </p>
                {needsRecoveryPassword && (
                  <>
                    <input
                      id="account-backup-pass"
                      type="password"
                      value={backupPass}
                      onChange={(e) => setBackupPass(e.target.value)}
                      placeholder="Password — at least 8 characters"
                      autoComplete="new-password"
                      className={inputCls}
                      data-testid="input-account-backup-password"
                    />
                    <input
                      id="account-backup-confirm"
                      type="password"
                      value={backupConfirm}
                      onChange={(e) => setBackupConfirm(e.target.value)}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                      className={inputCls + " mt-2"}
                      data-testid="input-account-backup-confirm"
                    />
                    {backupMismatch && (
                      <p className="mt-1.5 text-xs font-medium text-red-600" data-testid="text-account-backup-mismatch">
                        Passwords don't match.
                      </p>
                    )}
                  </>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleBackupDownload}
                    disabled={!canBackup || backupBusy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="button-account-download-backup"
                  >
                    {backupBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Preparing backup…
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" /> Download backup
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBackupMode(false);
                      setBackupPass("");
                      setBackupConfirm("");
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBackupMode(true)}
                className={`flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition-all hover:border-brand-accent/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:bg-slate-900 ${highlightBackup ? "animate-attention-ring border-brand-accent/70" : "border-slate-200 dark:border-slate-800"}`}
                data-testid="button-account-backup"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/10 text-brand-deep">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Back up your account</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Download an encrypted backup file</div>
                </div>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
              </button>
            )}
          </div>
        )}

        {canBackUp() && (
          <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60" data-testid="row-account-secret">
            {showSecret ? (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Your recovery key
                </p>
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-xs font-medium">
                    Anyone with this key has full control of your account. Never share it or paste it into a site you
                    don't trust.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code
                    className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    data-testid="text-account-nsec"
                  >
                    {secretNsec}
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      await copyToClipboard(secretNsec);
                      toast({ title: "Copied!", description: "Secret key copied to clipboard" });
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    data-testid="button-account-copy-nsec"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSecret(false);
                      setSecretNsec("");
                    }}
                    className="inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    data-testid="button-account-hide-nsec"
                  >
                    Hide
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRevealSecret}
                  disabled={revealBusy}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-brand-deep disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300"
                  data-testid="button-account-reveal-secret"
                >
                  {revealBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Unlocking…
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4" /> Show recovery key
                    </>
                  )}
                </button>
                <InfoHint label="About your recovery key">
                  This is the password-equivalent for your account (your "nsec"). Anyone with it has full control —
                  never share it.
                </InfoHint>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
          <button
            type="button"
            onClick={() => navigate(`/p/${user.npub}`)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            data-testid="button-account-view-profile"
          >
            <User className="h-4 w-4" /> View profile
          </button>
        </div>

        <SignOutEverywhereRow onSignedOut={handleLogout} />
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TRUST TAB
  // ─────────────────────────────────────────────────────────────────────────
  const serviceProviderCard = (
    <ServiceProviderCard
      selfLoading={selfLoading}
      nip85Activated={nip85Activated}
      lastCalculated={lastCalculated}
      taPubkey={taPubkey}
      hasNoFollowing={hasNoFollowing}
      actions={trustAnchor}
    />
  );

  const trustCalcCard = (
    <TrustCalcCard
      grapeRankLoading={grapeRankLoading}
      grapeRankStatus={grapeRankStatus}
      lastCalculated={lastCalculated}
      lastTriggered={lastTriggered}
      presetUsed={grapeRankData?.data?.graperank_preset_used}
      algorithm={grapeRankData?.data?.algorithm}
      isGrapeRankFailedState={isGrapeRankFailedState}
      isRecalcInProgress={isRecalcInProgress}
      hasNoFollowing={hasNoFollowing}
      triggerGrapeRankMutation={triggerGrapeRankMutation}
    />
  );

  const presetsCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-presets"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-brand-deep"
            >
              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-presets-title"
            >
              Trust Perspective
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-presets-subtitle">
              Tune how Brainstorm weights trust signals
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300" data-testid="text-presets-desc">
          How strict your network is — who counts as verified. Counts update when you switch; saved to your account.{" "}
          <Link href="/faq" className="font-medium text-brand-link hover:underline" data-testid="link-presets-faq">
            What changes?
          </Link>
        </p>

        {presetLoading && !serverPreset ? (
          <div className="grid grid-cols-3 gap-2" data-testid="row-presets-chips-loading">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[64px] animate-pulse rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2" data-testid="row-presets-chips">
            {/* Label + description come from trustThreshold, the shared preset
                vocabulary — the topic-page filter reads the same helpers, so the
                two surfaces can't drift into calling one setting by two names. */}
            {(["relax", "default", "strict"] as const)
              .map((key) => ({ key, label: presetDisplayLabel(key), desc: presetDescription(key) }))
              .map((preset) => {
                const isActive = activePreset === preset.key;
                const isPendingThis = setPresetMutation.isPending && setPresetMutation.variables === preset.key;
                return (
                  <button
                    key={preset.key}
                    onClick={() => handlePresetChange(preset.key)}
                    disabled={setPresetMutation.isPending}
                    className={
                      "cursor-pointer rounded-xl border px-3 py-2.5 text-center transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 " +
                      (isActive
                        ? "border-brand-accent/30 bg-brand-deep/5 ring-1 ring-brand-accent/20"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800")
                    }
                    data-testid={`chip-preset-${preset.key}`}
                  >
                    <span
                      className={
                        "block text-xs font-bold " +
                        (isActive ? "text-brand-deep" : "text-slate-500 dark:text-slate-400")
                      }
                    >
                      {preset.label}
                      {isPendingThis && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">{preset.desc}</span>
                  </button>
                );
              })}
          </div>
        )}

        {/* How people's verification is SHOWN — sibling of the preset above:
            both are "how trust renders for me", which is why it lives in this
            card rather than under Appearance (that's app chrome; this is
            meaning). Viewer-side only, this device only — the coin, search
            rows, profiles and Insights all follow it instantly. Decisions in
            docs/score-display/DECISIONS.md. */}
        {/* Decision 6/8 (docs/trust-tiers/DECISIONS.md): how many rungs the
            ladder has is a data choice, separate from how a rung is drawn. */}
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
          <p
            className="text-sm font-semibold text-slate-800 dark:text-slate-200"
            data-testid="text-tier-granularity-title"
          >
            How many levels of verification you see
          </p>
          <p
            className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
            data-testid="text-tier-granularity-desc"
          >
            Simple: verified, unknown or flagged. Detailed: the full ladder. This device only.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="row-tier-granularity">
            {TIER_GRANULARITY_CHOICES.map((choice) => {
              const isActive = tierGranularity === choice.key;
              return (
                <button
                  key={choice.key}
                  onClick={() => setTierGranularityChoice(choice.key)}
                  className={
                    "flex cursor-pointer items-baseline justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 sm:block sm:text-center " +
                    (isActive
                      ? "border-brand-accent/30 bg-brand-deep/5 ring-1 ring-brand-accent/20"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800")
                  }
                  data-testid={`chip-tier-granularity-${choice.key}`}
                >
                  <span
                    className={
                      "text-xs font-bold " + (isActive ? "text-brand-deep" : "text-slate-500 dark:text-slate-400")
                    }
                  >
                    {choice.label}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 sm:mt-0.5 sm:block">
                    {choice.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
          <p
            className="text-sm font-semibold text-slate-800 dark:text-slate-200"
            data-testid="text-score-display-title"
          >
            How people's verification is shown
          </p>
          <p
            className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
            data-testid="text-score-display-desc"
          >
            How a person's standing is drawn for you, everywhere — or not at all. Flag warnings stay. This device only.
          </p>
          {/* Five options, one row on desktop; stacked full-width rows on
              mobile (label left, description right) — five centered columns
              don't fit a phone, and 3-over-2 wrapping looked broken. */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5" data-testid="row-score-display-modes">
            {SCORE_DISPLAY_CHOICES.map((choice) => {
              const isActive = scoreDisplayMode === choice.key;
              return (
                <button
                  key={choice.key}
                  onClick={() => setScoreDisplayModeChoice(choice.key)}
                  className={
                    "flex cursor-pointer items-baseline justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 sm:block sm:text-center " +
                    (isActive
                      ? "border-brand-accent/30 bg-brand-deep/5 ring-1 ring-brand-accent/20"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800")
                  }
                  data-testid={`chip-score-display-${choice.key}`}
                >
                  <span
                    className={
                      "text-xs font-bold " + (isActive ? "text-brand-deep" : "text-slate-500 dark:text-slate-400")
                    }
                  >
                    {choice.label}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 sm:mt-0.5 sm:block">
                    {choice.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const personalizationCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-personalization"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <IdCard className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-personalization-title"
              >
                Preferences
              </h2>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-700"
                data-testid="badge-personalization-preview"
              >
                <span className="h-1 w-1 rounded-full bg-emerald-500" /> Live
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-personalization-subtitle">
              Choose what your profile shows
            </p>
          </div>
        </div>
        {user?.npub && (
          <button
            type="button"
            onClick={() => navigate(`/p/${user.npub}`)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
            data-testid="link-customize-profile"
          >
            <SlidersHorizontal className="h-4 w-4" /> Customize your public profile
          </button>
        )}
      </div>
      <div className="p-5">
        <p
          className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
          data-testid="text-personalization-desc"
        >
          Choose exactly what appears on your public profile — which sections show, the order they're in, and who's
          featured. Open the customizer to edit it live; your choices are published to Nostr, so you own them across
          every client. Tags are separate: add those from your profile, and anyone can add one to you.
        </p>
        <div
          className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4 dark:border-slate-800/60"
          data-testid="row-appearance"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Theme</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Light, Dark, or your system's. This device only.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );

  // Settings' door to the whole Network Alerts surface, not just one slice of it.
  // It opens /alerts, which has three tabs, so labelling it "Ignored accounts"
  // described a third of where it goes. The subtitle names all three so this
  // reads as a map — which also gives extended reach a findable trail now that
  // it's off the dashboard entirely.
  //
  // Only the ignored count is shown, because it's the only free one: it's a
  // localStorage read, whereas follows/extended need the ~10s /networkAlerts
  // call, and firing that from Settings to fill in a subtitle would make the
  // page slow for numbers nobody came here for. It's also the one people
  // actually arrive hunting for. Counting the raw persisted list (the Ignored
  // TAB counts what's currently hidden, which differs once something escalates)
  // — hence "on your ignore list" rather than repeating the tab's wording.
  // The "saved to your account" half of this subtitle was an unconditional
  // claim. When the NIP-78 write can't happen it's simply untrue, and this card
  // is exactly where someone checks what they've ignored — so it has to say
  // which of the two is actually the case.
  // Also consult the persisted flag: this page can be loaded cold, where the
  // in-memory state has reset to "ok" but the list still never left the device.
  const ignoresUnsynced = ignoreSync === "local-only" || (pubkey ? hasUnsyncedIgnores(pubkey) : false);
  const savedWhere = ignoresUnsynced ? "saved on this device only" : "saved to your account";
  const networkAlertsCard = (
    <button
      type="button"
      onClick={() => navigate("/alerts")}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-accent/15 bg-white/70 px-5 py-4 text-left transition-all hover:border-brand-accent/30 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:bg-slate-900/70"
      data-testid="button-network-alerts"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          <ShieldAlert className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0">
          <h2
            className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Network Alerts
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-network-alerts-summary">
            {ignoredListCount === 0
              ? "Accounts people you trust have reported — the people you follow, your wider network, and anything you've ignored."
              : `Accounts people you trust have reported — the people you follow, your wider network, and ${ignoredListCount} you've ignored, ${savedWhere}.`}
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
    </button>
  );

  const advancedSection = (
    <div className="space-y-4" data-testid="section-advanced">
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-accent/15 bg-white/70 px-5 py-4 text-left transition-all hover:border-brand-accent/30 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:bg-slate-900/70"
        data-testid="button-advanced-toggle"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <SettingsIcon className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-advanced-title"
            >
              Advanced
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-advanced-subtitle">
              Service provider &amp; trust recalculation — most people never need these.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${advancedOpen ? "rotate-180" : ""}`}
        />
      </button>
      {advancedOpen && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="grid-advanced">
          {serviceProviderCard}
          {trustCalcCard}
          <div
            id="tag-relays-section"
            className={`scroll-mt-20 rounded-2xl transition-shadow ${highlighted === "tag-relays" ? "animate-attention-ring ring-2 ring-brand-accent/70" : ""}`}
          >
            <TagRelaysCard />
          </div>
          <TechnicalViewCard />
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ABOUT TAB
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative flex min-h-page flex-col overflow-hidden bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-settings"
    >
      <GlossBackground />
      <AppHeader user={user} onLogout={handleLogout} active="settings" />

      <main className={cn(pageWidth("wide"), "relative z-10 flex-1 py-6 sm:py-8")}>
        <DeferredSessionNotice className="mb-6" />
        <div className="space-y-6" data-testid="container-settings">
          <PageHeader
            kicker="Brainstorm Settings"
            title="Settings"
            subtitle="Manage your profile, trust, and account — all in one place."
            testId="section-settings-header"
          />

          {/* Tab navigation — segmented pill, matching the FAQ page.
              The three labels measure 367px against a 339px track at 375px wide,
              so "About & support" was being sliced mid-word at the container's
              padding edge — which reads as broken layout, not as a scroller.
              Two fixes: tighter horizontal padding below `sm` buys back ~48px so
              all three fit on a normal phone, and the scroll track bleeds to the
              true screen edge (-mx-4 cancelling the page's px-4, re-padded
              inside) so on a narrow device like an SE the cut lands at the edge
              of the display, which is the universal "this scrolls" cue. */}
          <div
            className="scrollbar-hide -mx-4 max-w-[100vw] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0"
            data-testid="settings-tab-bar"
          >
            <div className="border-brand-accent/12 inline-flex rounded-full border bg-white/70 p-1 shadow-sm backdrop-blur-sm dark:bg-slate-900/70">
              {tabs.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => goTab(tab.key)}
                    aria-current={active ? "page" : undefined}
                    className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 sm:px-5 ${
                      active
                        ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/[0.3]"
                        : "text-slate-500 hover:text-brand-deep dark:text-slate-400"
                    }`}
                    data-testid={`tab-${tab.key}`}
                  >
                    {tab.label}
                    {tab.internal && <InternalChip />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          {activeTab === "profile" && (
            <div className="space-y-6" data-testid="tab-content-profile">
              {profileCard}
              {personalizationCard}
              {accountCard}
            </div>
          )}

          {activeTab === "trust" && (
            <div className="space-y-6" data-testid="tab-content-trust">
              {presetsCard}
              {networkAlertsCard}
              {advancedSection}
            </div>
          )}

          {activeTab === "assistants" && (
            <div className="space-y-6" data-testid="tab-content-assistants">
              {/* The views, for a reader who has more than one: Yours for everyone; the list,
                  the duties and the map for admins while they're internal. */}
              {assistantViews.length > 1 && (
                <div
                  className="inline-flex gap-0.5 rounded-lg border-2 border-brand-accent/40 bg-white p-1 shadow-sm dark:bg-slate-900"
                  role="tablist"
                  aria-label="Assistants view"
                  data-testid="assistants-views"
                >
                  {assistantViews.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      role="tab"
                      aria-selected={assistantView === v.key}
                      onClick={() =>
                        navigate(
                          v.key === "yours" ? "/settings?tab=assistants" : `/settings?tab=assistants&view=${v.key}`,
                        )
                      }
                      className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-bold transition-all active:scale-95 ${assistantView === v.key ? "bg-brand-primary text-white shadow-md ring-1 ring-brand-primary/[0.4]" : "bg-slate-50 text-slate-600 hover:bg-brand-accent/10 hover:text-brand-deep hover:shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}
                      data-testid={`assistants-view-${v.key}`}
                    >
                      {v.label}
                      {v.internal && <InternalChip />}
                    </button>
                  ))}
                </div>
              )}
              {/* One card while everything happens on this site; the others join it once there are some. */}
              {assistantView === "yours" && (
                <YourAssistants viewer={user?.pubkey}>
                  <BrainstormAssistantCard variant="settings" lastCalculated={lastCalculated} />
                </YourAssistants>
              )}
              {(assistantView === "all" || assistantView === "duties") && (
                <AssistantsTab viewer={user?.pubkey} view={assistantView === "duties" ? "duties" : "assistants"} />
              )}
              {assistantView === "map" && <TreasureMapTab viewer={user?.pubkey} />}
            </div>
          )}

          {activeTab === "messages" && (
            <div className="space-y-6" data-testid="tab-content-messages">
              <MessagesSettingsCard />
            </div>
          )}

          {activeTab === "dictionary" && (
            <div className="space-y-6" data-testid="tab-content-dictionary">
              <DictionaryTab />
            </div>
          )}

          {activeTab === "billing" && (
            <div className="space-y-6" data-testid="tab-content-billing">
              <BillingCard />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

/**
 * Route wrapper that catches `/settings?tab=tags`.
 *
 * Tags was a Settings tab for a day before moving to `/tags/mine` (nothing on
 * it was a setting). Those links land here; sending them on beats silently
 * dropping them on Profile, which reads as "the feature was removed".
 *
 * Done BEFORE `SettingsPage` mounts rather than in an effect inside it: this
 * page fires authenticated requests on mount, so an in-page redirect races
 * them. Never rendering it is the version with no race to lose.
 */
export function SettingsRoute() {
  const tabParam = new URLSearchParams(useSearch()).get("tab");
  if (tabParam === "tags") return <Redirect to="/tags/mine" replace />;
  return <SettingsPage />;
}
