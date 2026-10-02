import { useState, useEffect, useCallback, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { GlossBackground } from "@/components/GlossBackground";
import { PageHeader } from "@/components/PageHeader";
import { Redirect, useLocation, useSearch } from "wouter";
import { ProfileEditForm } from "@/components/ProfileEditForm";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  presetDisplayLabel,
  presetDescription,
  presetDisplayLabelFromBackend,
  type TrustPreset,
} from "@/services/trustThreshold";
import { PresetBadge } from "@/components/PresetBadge";
import { useTrustPresetSync, useSetTrustPreset } from "@/hooks/useTrustPresetSync";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings as SettingsIcon,
  X,
  Check,
  Loader2,
  ArrowRight,
  Clock,
  RefreshCw,
  Info,
  CreditCard,
  Code2,
  Mail,
  ExternalLink,
  Copy,
  User,
  ShieldCheck,
  Sun,
  Download,
  ChevronDown,
  Key,
  AlertTriangle,
  IdCard,
  SlidersHorizontal,
  ShieldAlert,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { ignoredAlertMap, hasUnsyncedIgnores } from "@/lib/networkAlertsIgnored";
import { useIgnoreSyncState } from "@/hooks/useIgnoreSyncState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InfoHint } from "@/components/InfoHint";
import { copyToClipboard } from "@/lib/clipboard";
import { SiGithub } from "react-icons/si";
import type { NostrEvent } from "applesauce-core/helpers";
import {
  signNip85,
  signNip85Deactivation,
  publishToRelays,
  getNip85RelayUrl,
  fetchTrustProviderList,
} from "@/services/nostr";
import { checkUserLists } from "@/services/trustLists";
import { logout } from "@/accounts/login-flow";
import { isNip85Activated, markNip85Activated, clearNip85Activated } from "@/lib/nip85Activation";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { recordTrustProviderStatus } from "@/services/trustAnchor";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
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
import { CodeBlock } from "@/components/CodeBlock";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useSelfOverview, useSelfHistory } from "@/hooks/useSelf";
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
import { BrainLogo } from "@/components/BrainLogo";
import nosFabricaLogo from "@assets/a3d51408e84ca674b5892761fb366072479d962e245602bbc47568acba7c6b_1774042041592.jpg";
import nostrLogo from "@assets/download_1774042580188.png";
import { BillingCard } from "@/components/billing/BillingCard";
import { BrainstormAssistantCard } from "@/components/BrainstormAssistantCard";
import { TagRelaysCard } from "@/components/settings/TagRelaysCard";
import { RelayAuthCard } from "@/components/settings/RelayAuthCard";
import { TechnicalViewCard } from "@/components/settings/TechnicalViewCard";
import { DictionaryTab } from "@/components/settings/DictionaryTab";

type SettingsTab = "profile" | "trust" | "dictionary" | "billing" | "about";

// Placeholder agent prompts (the dev team will supply the final, working copy).
const AGENT_SELFHOST_PROMPT = `You're helping me run my own copy of Brainstorm, an open-source
web-of-trust search engine for Nostr.

1. Clone the repo: https://github.com/NosFabrica/Brainstorm-UI
2. Install dependencies and start the dev server (see the README).
3. Point it at the Brainstorm backend / relays as the docs describe.
4. Open the app, let me sign in, and confirm search works.

If anything fails, check the README's troubleshooting section, tell me
what to fix, and explain each step as you go. Keep it simple.`;

const AGENT_INTEGRATE_PROMPT = `You're helping me add Brainstorm's web-of-trust scores to my own
Nostr client so my users see personalized trust.

1. Read Brainstorm's developer guide (I'll give you the link).
2. Fetch personalized scores from the Brainstorm relay / API.
3. Read kind 30382 "Trusted Assertions" (NIP-85) for each user.
4. Honor the kind 10040 service-provider pointer so scores resolve per user.
5. Verify a sample user's Brainstorm Verification Score renders in my client.

Explain each step, note anything I need to configure, and keep it simple.`;

const inputCls =
  "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 transition disabled:opacity-60";

// "About" not "About & support": three labels share a 339px track at 375px
// wide and only fitted after a padding fix (see the tab-bar comment below).
// A fourth tab was briefly here for Tags; it moved to /tags/mine because
// nothing on it was a setting. Which relays to read IS one, and lives under
// Trust & search.
const TABS: { key: SettingsTab; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "trust", label: "Trust & search", icon: ShieldCheck },
  // The concepts the reader's Assistant keeps for them (2026-10-01: a Settings
  // tab by the team's choice). Past the 375px track, so phones scroll to it.
  { key: "dictionary", label: "Dictionary", icon: BookOpen },
  // Billing lives in Settings because Settings is where you CHANGE things —
  // cancelling is the most consequential account action in the product, and it
  // belongs next to the other irreversible ones rather than on a status page
  // someone lands on while checking a date. The read-only half is on /insights.
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "about", label: "About", icon: Info },
];

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const activeTab: SettingsTab =
    tabParam === "trust" || tabParam === "dictionary" || tabParam === "billing" || tabParam === "about"
      ? tabParam
      : "profile";
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
      focusParam === "backup" ? "account-backup-section" : focusParam === "tag-relays" ? "tag-relays-section" : null;
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
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const [agentPath, setAgentPath] = useState<"selfhost" | "integrate">("selfhost");
  const goTab = (t: SettingsTab) => {
    navigate(t === "profile" ? "/settings" : `/settings?tab=${t}`);
  };

  // Live identity: the header avatar updates the moment a profile save lands.
  const user = useActiveAccountDisplay();
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [nip85ConfirmOpen, setNip85ConfirmOpen] = useState(false);
  const [republishState, setRepublishState] = useState<"idle" | "signing" | "publishing" | "success" | "error">("idle");
  const [republishError, setRepublishError] = useState("");
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [deactivateState, setDeactivateState] = useState<"idle" | "signing" | "publishing" | "success" | "error">(
    "idle",
  );
  const [deactivateError, setDeactivateError] = useState("");
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

  const { data: grapeRankData, isPending: grapeRankLoading } = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const triggerGrapeRankMutation = useMutation({
    mutationFn: () => apiClient.triggerGrapeRank(),
    onSuccess: (data) => {
      if (data?.data && typeof data.data === "object") {
        queryClient.setQueryData(["/user/graperankResult"], data);
      }
      queryClient.invalidateQueries({ queryKey: ["/user/graperankResult"] });
      toast({
        title: "Recalculation started",
        description: "Recalculating now — redirecting to your dashboard.",
        duration: 4000,
      });
      setTimeout(() => navigate("/dashboard"), 600);
    },
    onError: () => {
      toast({
        title: "Recalculation failed",
        description: "Something went wrong triggering the recalculation. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const handleRepublishNip85 = async () => {
    setRepublishState("signing");
    setRepublishError("");

    if (!user?.pubkey) {
      setRepublishState("error");
      setRepublishError("Not logged in.");
      return;
    }

    if (!taPubkey) {
      setRepublishState("error");
      setRepublishError("Service key not available. Please wait for data to load and try again.");
      return;
    }

    let nip85Relay: string;
    try {
      nip85Relay = getNip85RelayUrl();
    } catch (err) {
      setRepublishState("error");
      const msg = err instanceof Error ? err.message : "NIP-85 relay URL is not configured.";
      setRepublishError(msg);
      toast({ title: "NIP-85 relay not configured", description: msg, variant: "destructive", duration: 5000 });
      return;
    }

    let signedEvent: NostrEvent;
    try {
      // Republish merged: keep every row already in their 10040, and name their
      // Trusted Lists when they have some it doesn't.
      let existing: string[][] = [];
      try {
        existing = (await fetchTrustProviderList(user.pubkey))?.tags ?? [];
      } catch {}
      let lists = null;
      try {
        const found = await checkUserLists(user.pubkey, taPubkey);
        if (found.status === "missing") lists = found.designation;
      } catch {}
      signedEvent = await signNip85(taPubkey, nip85Relay, { lists, existing });
    } catch (err) {
      setRepublishState("idle");
      // Declining is silent, as everywhere else — `keyAccessMessage` returns null
      // for it. What reaches here otherwise is a real failure, and calling that
      // "cancelled" told the user they had done something they hadn't.
      const message = keyAccessMessage(err);
      if (message) toast({ variant: "destructive", title: "Couldn't sign", description: message, duration: 3000 });
      return;
    }

    setRepublishState("publishing");
    const result = await publishToRelays(signedEvent);

    if (result.success) {
      markNip85Activated(user.pubkey);
      recordTrustProviderStatus(user.pubkey, "brainstorm");
      setRepublishState("success");
      toast({
        title: "NIP-85 event updated",
        description: "Your service provider declaration has been re-published.",
        duration: 4000,
      });
      setTimeout(() => setRepublishState("idle"), 3000);
    } else {
      setRepublishState("error");
      setRepublishError(result.error || "Failed to publish to relays. Please try again.");
    }
  };

  const handleDeactivateNip85 = async () => {
    setDeactivateState("signing");
    setDeactivateError("");

    if (!user?.pubkey) {
      setDeactivateState("error");
      setDeactivateError("Not logged in.");
      return;
    }

    let signedEvent: NostrEvent;
    try {
      signedEvent = await signNip85Deactivation();
    } catch (err) {
      setDeactivateState("idle");
      // Declining is silent, as everywhere else — `keyAccessMessage` returns null
      // for it. What reaches here otherwise is a real failure, and calling that
      // "cancelled" told the user they had done something they hadn't.
      const message = keyAccessMessage(err);
      if (message) toast({ variant: "destructive", title: "Couldn't sign", description: message, duration: 3000 });
      return;
    }

    setDeactivateState("publishing");
    const result = await publishToRelays(signedEvent);

    if (result.success) {
      clearNip85Activated(user.pubkey);
      recordTrustProviderStatus(user.pubkey, "none");
      setDeactivateState("success");
      toast({
        title: "Provider deactivated",
        description: "Brainstorm no longer publishes your scores for other apps to use.",
        duration: 4000,
      });
      setTimeout(() => {
        setDeactivateState("idle");
        window.location.reload();
      }, 2000);
    } else {
      setDeactivateState("error");
      setDeactivateError(result.error || "Failed to publish to relays. Please try again.");
    }
  };

  const calcDoneNow = grapeRankData?.data?.internal_publication_status === "success";
  useEffect(() => {
    if (calcDoneNow)
      try {
        localStorage.setItem("brainstorm_calc_completed", "true");
      } catch {}
  }, [calcDoneNow]);
  const isRecalcInProgress =
    grapeRankData?.data?.internal_publication_status === "waiting" || grapeRankData?.data?.status === "waiting";
  const isGrapeRankFailedState =
    (typeof grapeRankData?.data?.status === "string" && grapeRankData.data.status.toLowerCase() === "failure") ||
    (typeof grapeRankData?.data?.ta_status === "string" && grapeRankData.data.ta_status.toLowerCase() === "failure");
  const grapeRankStatus = grapeRankData?.data?.ta_status || grapeRankData?.data?.status || null;
  const lastCalculated = historyData?.data?.last_time_calculated_graperank || grapeRankData?.data?.updated_at || null;
  const lastTriggered = historyData?.data?.last_time_triggered_graperank || grapeRankData?.data?.created_at || null;
  const taPubkey = historyData?.data?.ta_pubkey || null;
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

  const appearanceCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-appearance"
    >
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <Sun className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-appearance-title"
            >
              Appearance
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Theme for this device</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 p-5">
        <p className="text-sm text-slate-600 dark:text-slate-300">Choose Light, Dark, or follow your system.</p>
        <ThemeToggle />
      </div>
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
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TRUST TAB
  // ─────────────────────────────────────────────────────────────────────────
  const serviceProviderCard = (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-service-provider"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <BrainLogo size={18} className="text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-sp-title"
            >
              Service Provider
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-sp-subtitle">
              NIP-85 declaration
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        {selfLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ) : nip85Activated ? (
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-center justify-between" data-testid="row-sp-status">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status
              </span>
              <div
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1"
                data-testid="badge-sp-active"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Active</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between" data-testid="row-sp-provider">
                <span className="text-xs text-slate-500 dark:text-slate-400">Provider</span>
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">Brainstorm</span>
              </div>
              <div className="flex items-center justify-between" data-testid="row-sp-event">
                <span className="text-xs text-slate-500 dark:text-slate-400">Event kind</span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">10040</span>
              </div>
              {lastCalculated && (
                <div className="flex items-center justify-between" data-testid="row-sp-since">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Active since</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {new Date(lastCalculated).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between" data-testid="row-sp-supported">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Supported by</span>
                  <div className="group/info relative">
                    <button
                      type="button"
                      className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                      onClick={(e) => e.currentTarget.focus()}
                      aria-label="What are Supported Clients?"
                      data-testid="button-supported-by-info"
                    >
                      <Info className="h-2.5 w-2.5" />
                    </button>
                    <div
                      className="pointer-events-none invisible fixed left-4 right-4 top-1/2 z-[100] -translate-y-1/2 rounded-xl border border-white/15 bg-slate-900/95 p-3 text-xs leading-relaxed text-slate-200 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-200 group-focus-within/info:pointer-events-auto group-focus-within/info:visible group-focus-within/info:opacity-100 group-hover/info:pointer-events-auto group-hover/info:visible group-hover/info:opacity-100 sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:top-auto sm:mb-2 sm:w-80 sm:translate-y-0"
                      data-testid="tooltip-supported-by"
                    >
                      These are Nostr clients that use the personalized scores Brainstorm publishes for you, via NIP-85
                      Trusted Assertions or other integrations.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href="https://amethyst.social/#"
                    target="_blank"
                    rel="noopener"
                    className="text-[11px] font-semibold text-brand-deep transition-colors hover:text-brand-accent"
                  >
                    Amethyst
                  </a>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">&middot;</span>
                  <a
                    href="https://www.nostria.app/"
                    target="_blank"
                    rel="noopener"
                    className="text-[11px] font-semibold text-orange-600 transition-colors hover:text-orange-700"
                  >
                    Nostria
                  </a>
                </div>
              </div>
            </div>

            {republishState === "error" && republishError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2"
                data-testid="alert-sp-republish-error"
              >
                <p className="text-xs font-medium text-red-700">{republishError}</p>
              </div>
            )}

            {republishState === "success" && (
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                data-testid="alert-sp-republish-success"
              >
                <p className="text-xs font-medium text-emerald-700">NIP-85 event updated successfully.</p>
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <AlertDialog open={nip85ConfirmOpen} onOpenChange={setNip85ConfirmOpen}>
                <button
                  type="button"
                  onClick={() => setNip85ConfirmOpen(true)}
                  disabled={
                    republishState === "signing" ||
                    republishState === "publishing" ||
                    republishState === "success" ||
                    !taPubkey
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:pointer-events-none disabled:opacity-50"
                  data-testid="button-sp-republish"
                >
                  {republishState === "signing" || republishState === "publishing" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {republishState === "signing" ? "Signing..." : "Publishing..."}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Update NIP-85 Event
                    </>
                  )}
                </button>
                <AlertDialogContent
                  className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                  data-testid="dialog-confirm-nip85-update"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-link">
                          Service Provider
                        </span>
                        <div className="h-px w-10 bg-brand-link/30" />
                      </div>
                      <AlertDialogTitle
                        className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                        style={{ fontFamily: "var(--font-display)" }}
                        data-testid="text-confirm-nip85-title"
                      >
                        Update NIP-85 Event?
                      </AlertDialogTitle>
                      <AlertDialogDescription
                        className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                        data-testid="text-confirm-nip85-desc"
                      >
                        This will re-sign and republish your Brainstorm service provider event to Nostr relays. This is
                        useful if your previous event wasn't picked up by all relays, or if you want to refresh your
                        service provider status.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-nip85-cancel">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-brand-primary text-white shadow-lg shadow-brand-primary/25 hover:bg-brand-primary-hover"
                        onClick={() => {
                          setNip85ConfirmOpen(false);
                          handleRepublishNip85();
                        }}
                        data-testid="button-confirm-nip85-continue"
                      >
                        Update
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </div>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={deactivateConfirmOpen} onOpenChange={setDeactivateConfirmOpen}>
                <button
                  type="button"
                  onClick={() => setDeactivateConfirmOpen(true)}
                  disabled={
                    deactivateState === "signing" || deactivateState === "publishing" || deactivateState === "success"
                  }
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50 dark:bg-slate-900"
                  data-testid="button-sp-deactivate"
                >
                  {deactivateState === "signing" || deactivateState === "publishing" ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {deactivateState === "signing" ? "Signing..." : "Publishing..."}
                    </>
                  ) : (
                    <>
                      <X className="h-3.5 w-3.5" />
                      Deactivate
                    </>
                  )}
                </button>
                <AlertDialogContent
                  className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                  data-testid="dialog-confirm-nip85-deactivate"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-red-500">
                          Deactivate
                        </span>
                        <div className="h-px w-10 bg-red-500/30" />
                      </div>
                      <AlertDialogTitle
                        className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                        style={{ fontFamily: "var(--font-display)" }}
                        data-testid="text-confirm-deactivate-title"
                      >
                        Deactivate Service Provider?
                      </AlertDialogTitle>
                      <AlertDialogDescription
                        className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                        data-testid="text-confirm-deactivate-desc"
                      >
                        This tells other Nostr apps to stop using Brainstorm as the source of your scores. Apps like
                        Amethyst and Nostria will no longer show them. Your data inside Brainstorm will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-deactivate-cancel">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-700"
                        onClick={() => {
                          setDeactivateConfirmOpen(false);
                          handleDeactivateNip85();
                        }}
                        data-testid="button-confirm-deactivate-continue"
                      >
                        Deactivate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {deactivateState === "error" && deactivateError && (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2"
                data-testid="alert-sp-deactivate-error"
              >
                <p className="text-xs font-medium text-red-700">{deactivateError}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-center justify-between" data-testid="row-sp-status-inactive">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status
              </span>
              <div
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-800"
                data-testid="badge-sp-inactive"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Not active
                </span>
              </div>
            </div>

            <p
              className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="text-sp-inactive-desc"
            >
              You haven't picked anywhere for your scores to come from. Turn Brainstorm on to share them with other
              Nostr apps.
            </p>

            {hasNoFollowing && (
              <div
                className="flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50 p-2.5"
                data-testid="banner-sp-no-follows"
              >
                <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-xs font-medium text-amber-700">
                  Follow some people on Nostr first to activate this feature.
                </p>
              </div>
            )}

            <div className="mt-auto border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                disabled={hasNoFollowing}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:pointer-events-none disabled:opacity-50"
                data-testid="button-sp-go-to-dashboard"
              >
                Go to Dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const trustCalcCard = (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="card-settings-graperank"
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
              className="text-brand-deep"
            >
              <path
                d="M14.4209 5.63965H21.7009"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                opacity="0.4"
                d="M2.2998 5.64062H9.5798"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                opacity="0.4"
                d="M14.4209 15.3301H21.7009"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                opacity="0.4"
                d="M14.4209 21.3896H21.7009"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M18.0894 9.27V2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2.2998 22.0005L9.5798 14.7305"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5798 22.0005L2.2998 14.7305"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-gr-title"
            >
              Trust Calculation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-gr-subtitle">
              GrapeRank network analysis
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        {grapeRankLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-6 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <div className="h-8 w-40 rounded-xl bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between" data-testid="row-gr-status">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status
              </span>
              {grapeRankStatus === "success" ? (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1"
                  data-testid="badge-gr-success"
                >
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Complete</span>
                </div>
              ) : grapeRankStatus ? (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1"
                  data-testid="badge-gr-pending"
                >
                  <Clock className="h-3 w-3 text-amber-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                    {grapeRankStatus}
                  </span>
                </div>
              ) : (
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-800"
                  data-testid="badge-gr-none"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    No data
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {lastCalculated && (
                <div className="flex flex-wrap items-center justify-between gap-2" data-testid="row-gr-last-calculated">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Last calculated</span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {new Date(
                        typeof lastCalculated === "string" && !lastCalculated.endsWith("Z")
                          ? lastCalculated + "Z"
                          : lastCalculated,
                      ).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <PresetBadge
                      preset={grapeRankData?.data?.graperank_preset_used}
                      size="xs"
                      testId="badge-gr-preset-used"
                    />
                  </div>
                </div>
              )}
              {lastTriggered && (
                <div className="flex items-center justify-between" data-testid="row-gr-last-triggered">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Last triggered</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {new Date(
                      typeof lastTriggered === "string" && !lastTriggered.endsWith("Z")
                        ? lastTriggered + "Z"
                        : lastTriggered,
                    ).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between" data-testid="row-gr-algorithm">
                <span className="text-xs text-slate-500 dark:text-slate-400">Algorithm</span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                  {grapeRankData?.data?.algorithm || "graperank"}
                </span>
              </div>
            </div>

            {isGrapeRankFailedState &&
              !triggerGrapeRankMutation.isSuccess &&
              !isRecalcInProgress &&
              !triggerGrapeRankMutation.isPending && (
                <div
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
                  data-testid="alert-gr-failed-state"
                >
                  <p className="text-xs font-medium text-amber-800">
                    Your last calculation didn't complete successfully. You can try again below.
                  </p>
                </div>
              )}

            {triggerGrapeRankMutation.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-gr-error">
                <p className="text-xs font-medium text-red-700">
                  {triggerGrapeRankMutation.error?.message || "Something went wrong."}
                </p>
              </div>
            )}

            {triggerGrapeRankMutation.isSuccess && (
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                data-testid="alert-gr-success"
              >
                <p className="text-xs font-medium text-emerald-700">
                  Recalculation triggered. This typically takes about 5 minutes.
                </p>
              </div>
            )}

            {hasNoFollowing && (
              <div
                className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50 p-2.5"
                data-testid="banner-gr-no-follows"
              >
                <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-xs font-medium text-amber-700">
                  Follow at least one account first so we can calculate your scores.{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/welcome")}
                    className="font-semibold underline hover:text-amber-900"
                    data-testid="link-gr-build-network"
                  >
                    Find people to follow →
                  </button>
                </p>
              </div>
            )}

            <div className="mt-auto border-t border-slate-100 pt-3 dark:border-slate-800/60">
              <AlertDialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
                <button
                  type="button"
                  disabled={triggerGrapeRankMutation.isPending || isRecalcInProgress || hasNoFollowing}
                  onClick={() => setRecalcConfirmOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:pointer-events-none disabled:opacity-50"
                  data-testid="button-gr-recalculate"
                >
                  {triggerGrapeRankMutation.isPending || isRecalcInProgress ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Recalculating...
                    </>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="shrink-0"
                      >
                        <path
                          d="M14.4209 5.63965H21.7009"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          opacity="0.4"
                          d="M2.2998 5.64062H9.5798"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M18.0894 9.27V2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2.2998 22.0005L9.5798 14.7305"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9.5798 22.0005L2.2998 14.7305"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Recalculate GrapeRank
                    </>
                  )}
                </button>
                <AlertDialogContent
                  className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                  data-testid="dialog-confirm-recalculate-settings"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-link">
                          Trust Signals
                        </span>
                        <div className="h-px w-10 bg-brand-link/30" />
                      </div>
                      <AlertDialogTitle
                        className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
                        style={{ fontFamily: "var(--font-display)" }}
                        data-testid="text-confirm-recalculate-settings-title"
                      >
                        Recalculate GrapeRank?
                      </AlertDialogTitle>
                      <AlertDialogDescription
                        className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                        data-testid="text-confirm-recalculate-settings-desc"
                      >
                        This re-runs your full network trust calculation. It typically takes about 5 minutes and your
                        current scores will be replaced with updated results.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel
                        className="rounded-xl"
                        data-testid="button-confirm-recalculate-settings-cancel"
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-brand-primary text-white shadow-lg shadow-brand-primary/25 hover:bg-brand-primary-hover"
                        onClick={() => {
                          setRecalcConfirmOpen(false);
                          triggerGrapeRankMutation.mutate();
                        }}
                        data-testid="button-confirm-recalculate-settings-continue"
                      >
                        Recalculate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </div>
    </div>
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
          How strict your network is. This sets which accounts count as "verified" followers, muters and reporters on
          Dashboard, Network, and Profile pages — the counts update as soon as you switch.
        </p>
        <p
          className="text-xs leading-relaxed text-slate-500 dark:text-slate-400"
          data-testid="text-presets-persistence"
        >
          Saved to your account, so it follows you across devices. Your published Trusted Assertions keep the old
          numbers until your next calculation.
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
            Simple answers the only question that matters — is this account verified, unknown, or flagged? Detailed
            shows the full ladder underneath. Saved on this device.
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
            Some people prefer not to see others as a number. This changes how it's shown to you, everywhere in
            Brainstorm — the same standing, drawn your way, or not at all. Flag warnings stay either way. Saved on this
            device.
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
                Personalization
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
          <RelayAuthCard />
          <TechnicalViewCard />
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ABOUT TAB
  // ─────────────────────────────────────────────────────────────────────────
  const agentSetupCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="section-agent-setup"
    >
      {" "}
      <button
        type="button"
        onClick={() => setAgentSetupOpen((v) => !v)}
        aria-expanded={agentSetupOpen}
        className={`flex w-full items-center justify-between gap-3 bg-slate-50 px-5 py-4 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:bg-slate-900 dark:hover:bg-slate-800 ${agentSetupOpen ? "border-b border-slate-200 dark:border-slate-800" : ""}`}
        data-testid="button-agent-setup-toggle"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-brand-deep" aria-hidden="true">
              <path
                d="M13.16 12.88V17.42"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10.3 17.42L8.09 12.88L5.88 17.42"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.43 16.38H9.76"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22.14 9.96999V15.04C22.14 20.11 20.11 22.14 15.04 22.14H8.96C3.89 22.14 1.86 20.11 1.86 15.04V8.95999C1.86 3.88999 3.89 1.85999 8.96 1.85999H14.03"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22.14 9.96999H18.08C15.04 9.96999 14.02 8.95999 14.02 5.90999V1.85999L22.13 9.96999H22.14Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-agent-setup-title"
              >
                Set up with your AI agent
              </h2>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-brand-accent/20 bg-brand-accent/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-deep"
                data-testid="badge-agent-preview"
              >
                <span className="h-1 w-1 rounded-full bg-brand-accent" /> Preview · coming soon
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-agent-setup-subtitle">
              Let an AI agent run Brainstorm for you — or wire it into your own client
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${agentSetupOpen ? "rotate-180" : ""}`}
        />
      </button>
      {agentSetupOpen && (
        <div className="space-y-4 p-5">
          {/* Path toggle */}
          <div
            className="border-brand-accent/12 inline-flex rounded-full border bg-white/70 p-1 shadow-sm backdrop-blur-sm dark:bg-slate-900/70"
            data-testid="agent-path-toggle"
          >
            {[
              { key: "selfhost" as const, label: "Self-host" },
              { key: "integrate" as const, label: "Integrate into your client" },
            ].map((opt) => {
              const active = agentPath === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setAgentPath(opt.key)}
                  aria-current={active ? "true" : undefined}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 sm:text-sm ${
                    active
                      ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/[0.3]"
                      : "text-slate-500 hover:text-brand-deep dark:text-slate-400"
                  }`}
                  data-testid={`agent-path-${opt.key}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300" data-testid="text-agent-setup-desc">
            {agentPath === "selfhost"
              ? "Brainstorm is open-source. Instead of following technical steps yourself, hand them to your AI agent — copy the prompt below, or point your agent at our guide."
              : "Already run a Nostr client? Have your AI agent connect Brainstorm's web-of-trust scores and Trusted Assertions (NIP-85) so your users see personalized trust."}
          </p>

          {/* The prompt to paste into the agent */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Copy this prompt into your agent
            </p>
            <CodeBlock
              code={agentPath === "selfhost" ? AGENT_SELFHOST_PROMPT : AGENT_INTEGRATE_PROMPT}
              testId={`agent-prompt-${agentPath}`}
            />
          </div>

          {/* Point the agent at the guide */}
          <div className="flex flex-col gap-2 rounded-xl border border-brand-accent/15 bg-white/70 px-3.5 py-3 dark:bg-slate-900/70 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Or point your agent here
              </p>
              <p className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">{`${typeof window !== "undefined" ? window.location.origin : ""}/developers`}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/developers`;
                  copyToClipboard(url);
                  toast({ title: "Copied!", description: "Guide link copied to clipboard" });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                data-testid="button-agent-copy-guide"
              >
                <Copy className="h-3.5 w-3.5" /> Copy link
              </button>
              <button
                type="button"
                onClick={() => navigate("/developers")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover"
                data-testid="button-agent-view-guide"
              >
                View the guide <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-agent-footer">
            Works with Claude, ChatGPT, or any capable agent. Want early access or to help shape this?{" "}
            <a
              href={`mailto:support@nosfabrica.com?subject=${agentPath === "integrate" ? "NIP-85%20Client%20Integration" : "Brainstorm%20Agent%20Setup"}`}
              className="font-semibold text-brand-deep transition-colors hover:text-brand-accent"
              data-testid="link-agent-contact"
            >
              Get in touch
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );

  const contactCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="section-contact-support"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <Mail className="h-4 w-4 text-brand-deep" />
          </div>
          <div>
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-contact-support-title"
            >
              Contact & Support
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-contact-support-subtitle">
              Developer outreach and general inquiries
            </p>
          </div>
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div
            className="rounded-xl border border-brand-accent/15 bg-white/80 p-5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="card-list-your-client"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                <Code2 className="h-4 w-4 text-brand-deep" />
              </div>
              <div>
                <h3
                  className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-list-client-title"
                >
                  List Your Client
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-list-client-subtitle">
                  Get featured on Brainstorm
                </p>
              </div>
            </div>
            <p
              className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="text-list-client-description"
            >
              Built a Nostr client that supports NIP-85? Get your app featured on our Supported Clients showcase — free
              promotion to our growing user base.
            </p>
            <a
              href="mailto:support@nosfabrica.com?subject=NIP-85%20Client%20Listing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-deep transition-colors hover:text-brand-accent"
              data-testid="link-list-client-email"
            >
              <Mail className="h-4 w-4" />
              support@nosfabrica.com
            </a>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" data-testid="text-list-client-helper">
              Include your client name, platform, and a brief description
            </p>
          </div>

          <div
            className="rounded-xl border border-brand-accent/15 bg-white/80 p-5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="card-get-in-touch"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
                <Mail className="h-4 w-4 text-brand-deep" />
              </div>
              <div>
                <h3
                  className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-get-in-touch-title"
                >
                  Get in Touch
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-get-in-touch-subtitle">
                  Questions, feedback, or support
                </p>
              </div>
            </div>
            <p
              className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              data-testid="text-get-in-touch-description"
            >
              Have questions, feedback, or need help with Brainstorm? We'd love to hear from you.
            </p>
            <a
              href="mailto:support@nosfabrica.com?subject=Brainstorm%20Support"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-deep transition-colors hover:text-brand-accent"
              data-testid="link-get-in-touch-email"
            >
              <Mail className="h-4 w-4" />
              support@nosfabrica.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  const aboutCard = (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="section-about"
    >
      {" "}
      <div className="border-b border-slate-200 px-5 py-4 transition-colors duration-500 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-900 shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:ring-slate-800/60">
            <img src={nosFabricaLogo} alt="NosFabrica" className="h-full w-full object-cover" />
          </div>
          <div>
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-about-title"
            >
              NosFabrica
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-about-subtitle">
              Weaving the fabric of Nostr
            </p>
          </div>
        </div>
      </div>
      <div className="p-5">
        <p
          className="mb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
          data-testid="text-about-description"
        >
          NosFabrica builds the open-source, scalable Web of Trust engines that power a safer, cleaner Nostr. We analyze
          raw network signals and turn them into clear, reliable scores.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <a
            href="https://github.com/NosFabrica"
            target="_blank"
            rel="noopener"
            className="group/link flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="link-github"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 transition-colors group-hover/link:bg-slate-800">
              <SiGithub className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="block text-sm font-bold text-slate-900 dark:text-slate-100"
                data-testid="text-github-label"
              >
                GitHub
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Open-source projects</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover/link:text-brand-accent dark:text-slate-600" />
          </a>

          <a
            href="https://njump.me/npub1healthsx3swcgtknff7zwpg8aj2q7h49zecul5rz490f6z2zp59qnfvp8p"
            target="_blank"
            rel="noopener"
            className="group/link flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="link-nostr"
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl">
              <img src={nostrLogo} alt="Nostr" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="block text-sm font-bold text-slate-900 dark:text-slate-100"
                data-testid="text-nostr-label"
              >
                Nostr
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Follow on Nostr</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover/link:text-brand-accent dark:text-slate-600" />
          </a>

          <a
            href="https://nosfabrica.com"
            target="_blank"
            rel="noopener"
            className="group/link flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-brand-accent/30 hover:shadow-sm dark:bg-slate-900/80"
            data-testid="link-website"
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-900 transition-colors group-hover/link:bg-slate-800">
              <img src={nosFabricaLogo} alt="NosFabrica" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span
                className="block text-sm font-bold text-slate-900 dark:text-slate-100"
                data-testid="text-website-label"
              >
                Website
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">nosfabrica.com</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover/link:text-brand-accent dark:text-slate-600" />
          </a>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/60">
          <p className="text-[11px] text-slate-500 dark:text-slate-400" data-testid="text-about-copyright">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Brainstorm</span> by NosFabrica —
            open-source under AGPL-3.0 license
          </p>
          <span
            className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-300 dark:border-slate-800/60 dark:bg-slate-900 dark:text-slate-600"
            data-testid="text-about-version"
          >
            v1.0
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="relative flex min-h-page flex-col overflow-hidden bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-settings"
    >
      <GlossBackground />
      <AppHeader user={user} onLogout={handleLogout} active="settings" />

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
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
              {TABS.map((tab) => {
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
              {appearanceCard}
              {accountCard}
            </div>
          )}

          {activeTab === "trust" && (
            <div className="space-y-6" data-testid="tab-content-trust">
              {presetsCard}
              <BrainstormAssistantCard variant="settings" lastCalculated={lastCalculated} />
              {networkAlertsCard}
              {advancedSection}
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

          {activeTab === "about" && (
            <div className="space-y-6" data-testid="tab-content-about">
              {agentSetupCard}
              {contactCard}
              {aboutCard}
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
