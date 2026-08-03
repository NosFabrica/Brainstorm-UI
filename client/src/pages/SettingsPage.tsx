import { useState, useEffect, useCallback, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { GlossBackground } from "@/components/GlossBackground";
import { PageHeader } from "@/components/PageHeader";
import { useLocation, useSearch } from "wouter";
import { ProfileEditForm } from "@/components/ProfileEditForm";
import { useQuery, useMutation } from "@tanstack/react-query";
import { setActivePreset, presetToBackend, presetDisplayLabel, presetDescription, presetDisplayLabelFromBackend, PRESET_THRESHOLDS, type TrustPreset } from "@/services/trustThreshold";
import { PresetBadge } from "@/components/PresetBadge";
import { useTrustPresetSync, trustPresetQueryKey } from "@/hooks/useTrustPresetSync";
import { AdminBadge } from "@/components/AdminBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home,
  Search,
  LogOut,
  Settings as SettingsIcon,
  X,
  BookOpen,
  Users,
  Check,
  Loader2,
  ArrowRight,
  Clock,
  RefreshCw,
  Info,
  Code2,
  Mail,
  HelpCircle,
  ExternalLink,
  Globe,
  Shield,
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
} from "lucide-react";
import { ignoredAlertMap } from "@/lib/networkAlertsIgnored";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AgentIcon } from "@/components/AgentIcon";
import { InfoHint } from "@/components/InfoHint";
import { copyToClipboard } from "@/lib/clipboard";
import { FEATURES } from "@/config/featureFlags";
import { SiGithub } from "react-icons/si";
import { getCurrentUser, logout, signNip85, signNip85Deactivation, publishToRelays, getNip85RelayUrl, hasStoredSecretKey, exportNsec, type NostrUser } from "@/services/nostr";
import { isNip85Activated, markNip85Activated, clearNip85Activated } from "@/lib/nip85Activation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { downloadAccountBackup, getEncryptedBackupCredential } from "@/lib/accountBackup";
import { storePasswordCredential } from "@/lib/credentialManager";
import { CodeBlock } from "@/components/CodeBlock";
import { isAdminPubkey } from "@/config/adminAccess";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useSelfOverview, useSelfHistory } from "@/hooks/useSelf";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { BrainLogo } from "@/components/BrainLogo";
import nosFabricaLogo from "@assets/a3d51408e84ca674b5892761fb366072479d962e245602bbc47568acba7c6b_1774042041592.jpg";
import nostrLogo from "@assets/download_1774042580188.png";
import { BrainstormAssistantCard } from "@/components/BrainstormAssistantCard";

type SettingsTab = "profile" | "trust" | "about";

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
2. Fetch personalized trust scores from the Brainstorm relay / API.
3. Read kind 30382 "Trusted Assertions" (NIP-85) for each user.
4. Honor the kind 10040 service-provider pointer so scores resolve per user.
5. Verify a sample user's Brainstorm trust score renders in my client.

Explain each step, note anything I need to configure, and keep it simple.`;

const inputCls =
  "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-sm focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30 transition disabled:opacity-60";

const TABS: { key: SettingsTab; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User },
  { key: "trust", label: "Trust & search", icon: ShieldCheck },
  { key: "about", label: "About & support", icon: Info },
];

export default function SettingsPage() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const activeTab: SettingsTab = tabParam === "trust" || tabParam === "about" ? tabParam : "profile";
  // Deep-link to the backup action (e.g. from the logout prompt / backup nudge):
  // /settings?focus=backup scrolls straight to the Account > Back up section.
  const focusParam = new URLSearchParams(search).get("focus");
  const [highlightBackup, setHighlightBackup] = useState(false);
  useEffect(() => {
    if (focusParam !== "backup") return;
    const t = setTimeout(() => {
      document.getElementById("account-backup-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightBackup(true);
    }, 150);
    // Drop the cue once it has pulsed (2 × 1.5s) so it's a one-time nudge.
    const off = setTimeout(() => setHighlightBackup(false), 3400);
    return () => { clearTimeout(t); clearTimeout(off); };
  }, [focusParam]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const [agentPath, setAgentPath] = useState<"selfhost" | "integrate">("selfhost");
  const goTab = (t: SettingsTab) => {
    navigate(t === "profile" ? "/settings" : `/settings?tab=${t}`);
  };

  // Live current user: re-reads on `brainstorm-user-changed` so the header avatar
  // updates instantly after saving the profile (no refresh needed).
  const [user] = useCurrentUser();
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [nip85ConfirmOpen, setNip85ConfirmOpen] = useState(false);
  const [republishState, setRepublishState] = useState<"idle" | "signing" | "publishing" | "success" | "error">("idle");
  const [republishError, setRepublishError] = useState("");
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [deactivateState, setDeactivateState] = useState<"idle" | "signing" | "publishing" | "success" | "error">("idle");
  const [deactivateError, setDeactivateError] = useState("");
  const { toast } = useToast();

  const { preset: serverPreset, isLoading: presetLoading } = useTrustPresetSync(!!user);
  const [optimisticPreset, setOptimisticPreset] = useState<TrustPreset | null>(null);
  const activePreset: TrustPreset = optimisticPreset ?? serverPreset ?? "default";

  const setPresetMutation = useMutation({
    mutationFn: (preset: TrustPreset) => apiClient.setGrapeRankPreset(presetToBackend(preset)),
    onMutate: (preset) => {
      const previous = optimisticPreset;
      setOptimisticPreset(preset);
      return { previous };
    },
    onSuccess: (_data, preset) => {
      setActivePreset(preset);
      const key = trustPresetQueryKey(user?.pubkey);
      queryClient.setQueryData(key, {
        data: { preset: presetToBackend(preset) },
      });
      queryClient.invalidateQueries({ queryKey: key });
      setOptimisticPreset(null);
      const lastResult = queryClient.getQueryData<any>(["/user/graperankResult"]);
      const previousUsedLabel = presetDisplayLabelFromBackend(lastResult?.data?.graperank_preset_used);
      const newLabel = presetDisplayLabel(preset);
      const description = previousUsedLabel
        ? `Next calculation will use ${newLabel}. Current scores were calculated with ${previousUsedLabel}.`
        : `Next calculation will use ${newLabel}.`;
      toast({
        title: "Trust perspective updated",
        description,
        duration: 4000,
      });
    },
    onError: (error, _preset, context) => {
      setOptimisticPreset(context?.previous ?? null);
      toast({
        variant: "destructive",
        title: "Couldn't save preset",
        description: error instanceof Error ? error.message : "Please try again.",
        duration: 5000,
      });
    },
  });

  const handlePresetChange = useCallback((preset: TrustPreset) => {
    if (preset === activePreset || setPresetMutation.isPending) return;
    setPresetMutation.mutate(preset);
  }, [activePreset, setPresetMutation]);

  const nip85Activated = isNip85Activated(user?.pubkey);

  useEffect(() => {
    if (!getCurrentUser()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const pubkey = user?.pubkey ?? "";
  const backupFlag = pubkey ? `brainstorm_backup_done:${pubkey}` : "";

  const [backupMode, setBackupMode] = useState(false);
  const [backupPass, setBackupPass] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  useEffect(() => {
    try {
      setBackedUp(!!backupFlag && localStorage.getItem(backupFlag) === "true");
    } catch {
      setBackedUp(false);
    }
  }, [backupFlag]);

  const backupMismatch = backupConfirm.length > 0 && backupPass !== backupConfirm;
  const canBackup = backupPass.length >= 8 && backupPass === backupConfirm;
  const handleBackupDownload = () => {
    if (!canBackup) return;
    try {
      downloadAccountBackup(backupPass);
      try {
        if (backupFlag) localStorage.setItem(backupFlag, "true");
      } catch {}
      // Stash the encrypted key in the browser password manager (Chromium
      // best-effort): username = npub, password = ncryptsec. Don't block on it.
      try {
        const { npub, ncryptsec } = getEncryptedBackupCredential(backupPass);
        if (npub && ncryptsec) void storePasswordCredential(npub, ncryptsec, npub);
      } catch {}
      setBackedUp(true);
      setBackupMode(false);
      setBackupPass("");
      setBackupConfirm("");
      toast({ title: "Backup saved", description: "Saved to your password manager where supported — keep the file too." });
    } catch {
      // no-op; user can retry
    }
  };

  const [showSecret, setShowSecret] = useState(false);
  const [secretNsec, setSecretNsec] = useState("");
  const handleRevealSecret = () => {
    try {
      setSecretNsec(exportNsec());
      setShowSecret(true);
    } catch {
      // no key available; ignore
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
        description: "Your trust scores are being recalculated. Redirecting to dashboard...",
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

    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
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

    let signedEvent: Record<string, unknown>;
    try {
      signedEvent = await signNip85(taPubkey, nip85Relay);
    } catch {
      setRepublishState("idle");
      toast({ title: "Signing cancelled", description: "The event was not signed.", duration: 3000 });
      return;
    }

    setRepublishState("publishing");
    const result = await publishToRelays(signedEvent);

    if (result.success) {
      markNip85Activated(currentUser.pubkey);
      setRepublishState("success");
      toast({ title: "NIP-85 event updated", description: "Your service provider declaration has been re-published.", duration: 4000 });
      setTimeout(() => setRepublishState("idle"), 3000);
    } else {
      setRepublishState("error");
      setRepublishError(result.error || "Failed to publish to relays. Please try again.");
    }
  };

  const handleDeactivateNip85 = async () => {
    setDeactivateState("signing");
    setDeactivateError("");

    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setDeactivateState("error");
      setDeactivateError("Not logged in.");
      return;
    }

    let signedEvent: Record<string, unknown>;
    try {
      signedEvent = await signNip85Deactivation();
    } catch {
      setDeactivateState("idle");
      toast({ title: "Signing cancelled", description: "The event was not signed.", duration: 3000 });
      return;
    }

    setDeactivateState("publishing");
    const result = await publishToRelays(signedEvent);

    if (result.success) {
      clearNip85Activated(currentUser.pubkey);
      setDeactivateState("success");
      toast({ title: "Provider deactivated", description: "Brainstorm has been removed as your WoT service provider.", duration: 4000 });
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
  const calcDone = useMemo(() => {
    if (calcDoneNow) {
      try { localStorage.setItem("brainstorm_calc_completed", "true"); } catch {}
      return true;
    }
    try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; }
  }, [calcDoneNow]);
  const isRecalcInProgress = grapeRankData?.data?.internal_publication_status === "waiting" || grapeRankData?.data?.status === "waiting";
  const isGrapeRankFailedState = (typeof grapeRankData?.data?.status === "string" && grapeRankData.data.status.toLowerCase() === "failure") || (typeof grapeRankData?.data?.ta_status === "string" && grapeRankData.data.ta_status.toLowerCase() === "failure");
  const grapeRankStatus = grapeRankData?.data?.ta_status || grapeRankData?.data?.status || null;
  const lastCalculated = historyData?.data?.last_time_calculated_graperank || grapeRankData?.data?.updated_at || null;
  const lastTriggered = historyData?.data?.last_time_triggered_graperank || grapeRankData?.data?.created_at || null;
  const taPubkey = historyData?.data?.ta_pubkey || null;
  const followingCount = overviewData?.data?.counts?.following ?? null;
  const hasNoFollowing = !selfLoading && followingCount === 0;

  if (!user || isAuthRedirecting()) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // PROFILE TAB
  // ─────────────────────────────────────────────────────────────────────────
  const profileCard = (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative" data-testid="card-settings-profile">
      <ProfileEditForm
        onSaved={() => toast({ title: "Profile saved", description: "Your profile has been published.", duration: 3000 })}
      />
    </div>
  );

  const appearanceCard = (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative" data-testid="card-settings-appearance">
      <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
            <Sun className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-appearance-title">Appearance</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Theme for this device</p>
          </div>
        </div>
      </div>
      <div className="p-5 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">Choose Light, Dark, or follow your system.</p>
        <ThemeToggle />
      </div>
    </div>
  );

  const accountCard = (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative" data-testid="card-settings-account">      <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-account-title">Account</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-account-subtitle">Your identity and backup</p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {hasStoredSecretKey() && (!backedUp || !user?.picture) && (
          <div className="flex items-start rounded-xl bg-brand-accent/8 border border-brand-accent/20 px-3.5 py-3" data-testid="hint-finish-setup">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
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
            <p className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
              Your public ID
              <InfoHint label="About your public ID">Your public address on the network (your "npub") — safe to share with anyone.</InfoHint>
            </p>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">{user.npub}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await copyToClipboard(user.npub);
              toast({ title: "Copied!", description: "npub copied to clipboard" });
            }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            data-testid="button-account-copy-npub"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>

        {hasStoredSecretKey() && (
          <div id="account-backup-section" className="pt-4 border-t border-slate-100 dark:border-slate-800/60 scroll-mt-20" data-testid="row-account-backup">
            {backedUp ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 p-3">
                <div className="h-9 w-9 rounded-xl bg-white dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Backed up</div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">Encrypted backup file downloaded</div>
                </div>
              </div>
            ) : backupMode ? (
              <div>
                <label htmlFor="account-backup-pass" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Back up your account</label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Choose a password to encrypt your backup file. This file is how you sign in on another device or get back in if you clear your browser — keep it safe, no one can reset this password.</p>
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
                  <p className="mt-1.5 text-xs font-medium text-red-600" data-testid="text-account-backup-mismatch">Passwords don't match.</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleBackupDownload}
                    disabled={!canBackup}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid="button-account-download-backup"
                  >
                    <Download className="h-4 w-4" /> Download backup
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBackupMode(false); setBackupPass(""); setBackupConfirm(""); }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBackupMode(true)}
                className={`w-full text-left flex items-center gap-3 rounded-xl border bg-white dark:bg-slate-900 p-3 hover:border-brand-accent/50 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${highlightBackup ? "border-brand-accent/70 animate-attention-ring" : "border-slate-200 dark:border-slate-800"}`}
                data-testid="button-account-backup"
              >
                <div className="h-9 w-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-deep shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Back up your account</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Download an encrypted backup file</div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 ml-auto shrink-0" />
              </button>
            )}
          </div>
        )}

        {hasStoredSecretKey() && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60" data-testid="row-account-secret">
            {showSecret ? (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Your recovery key</p>
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 mb-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="text-xs font-medium">Anyone with this key has full control of your account. Never share it or paste it into a site you don't trust.</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate text-xs font-mono text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2" data-testid="text-account-nsec">{secretNsec}</code>
                  <button
                    type="button"
                    onClick={async () => { await copyToClipboard(secretNsec); toast({ title: "Copied!", description: "Secret key copied to clipboard" }); }}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                    data-testid="button-account-copy-nsec"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSecret(false); setSecretNsec(""); }}
                    className="shrink-0 inline-flex items-center px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors"
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
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-brand-deep transition-colors"
                  data-testid="button-account-reveal-secret"
                >
                  <Key className="h-4 w-4" /> Show recovery key
                </button>
                <InfoHint label="About your recovery key">This is the password-equivalent for your account (your "nsec"). Anyone with it has full control — never share it.</InfoHint>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60">
          <button
            type="button"
            onClick={() => navigate(`/p/${user.npub}`)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors"
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
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative h-full flex flex-col" data-testid="card-settings-service-provider">      <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4 transition-colors duration-500">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
            <BrainLogo size={18} className="text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-sp-title">Service Provider</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-sp-subtitle">NIP-85 Web of Trust declaration</p>
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {selfLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-3 w-3/4 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          </div>
        ) : nip85Activated ? (
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between" data-testid="row-sp-status">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200" data-testid="badge-sp-active">
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
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">10040</span>
              </div>
              {lastCalculated && (
                <div className="flex items-center justify-between" data-testid="row-sp-since">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Active since</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {new Date(lastCalculated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between" data-testid="row-sp-supported">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Supported by</span>
                  <div className="relative group/info">
                    <button
                      type="button"
                      className="h-4 w-4 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent/40"
                      onClick={(e) => e.currentTarget.focus()}
                      aria-label="What are Supported Clients?"
                      data-testid="button-supported-by-info"
                    >
                      <Info className="h-2.5 w-2.5" />
                    </button>
                    <div className="fixed left-4 right-4 top-1/2 -translate-y-1/2 sm:absolute sm:top-auto sm:left-0 sm:right-auto sm:translate-y-0 sm:bottom-full sm:mb-2 sm:w-80 p-3 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-2xl text-xs text-slate-200 leading-relaxed opacity-0 invisible group-focus-within/info:opacity-100 group-focus-within/info:visible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 z-[100] pointer-events-none group-focus-within/info:pointer-events-auto group-hover/info:pointer-events-auto" data-testid="tooltip-supported-by">
                      These are Nostr clients that use personalized trust scores calculated by Brainstorm and other Web of Trust Service Providers via NIP-85: Trusted Assertions or other integration methods.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <a href="https://amethyst.social/#" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-brand-deep hover:text-brand-accent transition-colors">Amethyst</a>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">&middot;</span>
                  <a href="https://www.nostria.app/" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition-colors">Nostria</a>
                </div>
              </div>
            </div>

            {republishState === "error" && republishError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-sp-republish-error">
                <p className="text-xs text-red-700 font-medium">{republishError}</p>
              </div>
            )}

            {republishState === "success" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="alert-sp-republish-success">
                <p className="text-xs text-emerald-700 font-medium">NIP-85 event updated successfully.</p>
              </div>
            )}

            <div className="pt-3 mt-auto border-t border-slate-100 dark:border-slate-800/60 flex flex-wrap items-center gap-2">
              <AlertDialog open={nip85ConfirmOpen} onOpenChange={setNip85ConfirmOpen}>
                <button
                  type="button"
                  onClick={() => setNip85ConfirmOpen(true)}
                  disabled={republishState === "signing" || republishState === "publishing" || republishState === "success" || !taPubkey}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none"
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
                  className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-0 overflow-hidden"
                  data-testid="dialog-confirm-nip85-update"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="flex items-center gap-2.5 mb-3">
                        <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link uppercase">Service Provider</span>
                        <div className="h-px w-10 bg-brand-link/30" />
                      </div>
                      <AlertDialogTitle className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-nip85-title">
                        Update NIP-85 Event?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-2.5" data-testid="text-confirm-nip85-desc">
                        This will re-sign and republish your Brainstorm service provider event to Nostr relays. This is useful if your previous event wasn't picked up by all relays, or if you want to refresh your service provider status.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-nip85-cancel">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white shadow-lg shadow-brand-primary/25"
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
                  disabled={deactivateState === "signing" || deactivateState === "publishing" || deactivateState === "success"}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 bg-white dark:bg-slate-900 hover:bg-red-50 text-red-600 text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
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
                  className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-0 overflow-hidden"
                  data-testid="dialog-confirm-nip85-deactivate"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="flex items-center gap-2.5 mb-3">
                        <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-red-500 uppercase">Deactivate</span>
                        <div className="h-px w-10 bg-red-500/30" />
                      </div>
                      <AlertDialogTitle className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-deactivate-title">
                        Deactivate Service Provider?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-2.5" data-testid="text-confirm-deactivate-desc">
                        This will publish an event to Nostr relays removing Brainstorm as your WoT service provider. Compatible clients like Amethyst and Nostria will no longer use Brainstorm for your trust scores. Your data inside Brainstorm will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-deactivate-cancel">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25"
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
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-sp-deactivate-error">
                <p className="text-xs text-red-700 font-medium">{deactivateError}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between" data-testid="row-sp-status-inactive">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800" data-testid="badge-sp-inactive">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Not active</span>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" data-testid="text-sp-inactive-desc">
              No WoT service provider has been selected. Activate Brainstorm as your provider to publish trust scores across the Nostr ecosystem.
            </p>

            {hasNoFollowing && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200/60" data-testid="banner-sp-no-follows">
                <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">Follow some people on Nostr first to activate this feature.</p>
              </div>
            )}

            <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                disabled={hasNoFollowing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none"
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
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative h-full flex flex-col" data-testid="card-settings-graperank">      <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4 transition-colors duration-500">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-brand-deep">
              <path d="M14.4209 5.63965H21.7009" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path opacity="0.4" d="M2.2998 5.64062H9.5798" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path opacity="0.4" d="M14.4209 15.3301H21.7009" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path opacity="0.4" d="M14.4209 21.3896H21.7009" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18.0894 9.27V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.2998 22.0005L9.5798 14.7305" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9.5798 22.0005L2.2998 14.7305" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-gr-title">Trust Calculation</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-gr-subtitle">GrapeRank network analysis</p>
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4">
        {grapeRankLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded" />
              <div className="h-3 w-2/3 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60">
              <div className="h-8 w-40 bg-slate-200 dark:bg-slate-700 rounded-xl" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between" data-testid="row-gr-status">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</span>
              {grapeRankStatus === "success" ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200" data-testid="badge-gr-success">
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Complete</span>
                </div>
              ) : grapeRankStatus ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200" data-testid="badge-gr-pending">
                  <Clock className="h-3 w-3 text-amber-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">{grapeRankStatus}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800" data-testid="badge-gr-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">No data</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {lastCalculated && (
                <div className="flex items-center justify-between gap-2 flex-wrap" data-testid="row-gr-last-calculated">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Last calculated</span>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {new Date(typeof lastCalculated === "string" && !lastCalculated.endsWith("Z") ? lastCalculated + "Z" : lastCalculated).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
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
                    {new Date(typeof lastTriggered === "string" && !lastTriggered.endsWith("Z") ? lastTriggered + "Z" : lastTriggered).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between" data-testid="row-gr-algorithm">
                <span className="text-xs text-slate-500 dark:text-slate-400">Algorithm</span>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{grapeRankData?.data?.algorithm || "graperank"}</span>
              </div>
            </div>

            {isGrapeRankFailedState && !triggerGrapeRankMutation.isSuccess && !isRecalcInProgress && !triggerGrapeRankMutation.isPending && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5" data-testid="alert-gr-failed-state">
                <p className="text-xs text-amber-800 font-medium">Your last calculation didn't complete successfully. You can try again below.</p>
              </div>
            )}

            {triggerGrapeRankMutation.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2" data-testid="alert-gr-error">
                <p className="text-xs text-red-700 font-medium">{triggerGrapeRankMutation.error?.message || "Something went wrong."}</p>
              </div>
            )}

            {triggerGrapeRankMutation.isSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="alert-gr-success">
                <p className="text-xs text-emerald-700 font-medium">Recalculation triggered. This typically takes about 5 minutes.</p>
              </div>
            )}

            {hasNoFollowing && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200/60 mb-3" data-testid="banner-gr-no-follows">
                <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  Follow at least one account first so we can calculate your trust scores.{" "}
                  <button type="button" onClick={() => navigate("/welcome")} className="font-semibold underline hover:text-amber-900" data-testid="link-gr-build-network">
                    Find people to follow →
                  </button>
                </p>
              </div>
            )}

            <div className="pt-3 mt-auto border-t border-slate-100 dark:border-slate-800/60">
              <AlertDialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
                <button
                  type="button"
                  disabled={triggerGrapeRankMutation.isPending || isRecalcInProgress || hasNoFollowing}
                  onClick={() => setRecalcConfirmOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  data-testid="button-gr-recalculate"
                >
                  {triggerGrapeRankMutation.isPending || isRecalcInProgress ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Recalculating...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
                        <path d="M14.4209 5.63965H21.7009" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path opacity="0.4" d="M2.2998 5.64062H9.5798" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M18.0894 9.27V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2.2998 22.0005L9.5798 14.7305" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9.5798 22.0005L2.2998 14.7305" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Recalculate GrapeRank
                    </>
                  )}
                </button>
                <AlertDialogContent
                  className="w-[calc(100vw-2rem)] max-w-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-0 overflow-hidden"
                  data-testid="dialog-confirm-recalculate-settings"
                >
                  <div className="p-5 sm:p-6">
                    <AlertDialogHeader className="space-y-0 text-left">
                      <div className="flex items-center gap-2.5 mb-3">
                        <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link uppercase">Trust Signals</span>
                        <div className="h-px w-10 bg-brand-link/30" />
                      </div>
                      <AlertDialogTitle className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-confirm-recalculate-settings-title">
                        Recalculate GrapeRank?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-2.5" data-testid="text-confirm-recalculate-settings-desc">
                        This re-runs your full network trust calculation. It typically takes about 5 minutes and your current scores will be replaced with updated results.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                      <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-recalculate-settings-cancel">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white shadow-lg shadow-brand-primary/25"
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
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative" data-testid="card-settings-presets">      <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4 transition-colors duration-500">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-deep">
              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-presets-title">Trust Perspective</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-presets-subtitle">Tune how Brainstorm weights trust signals</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" data-testid="text-presets-desc">
          Adjust how strict the verified threshold is across Brainstorm. This controls which accounts appear as "verified" on Dashboard, Network, and Profile pages.
        </p>

        {presetLoading && !serverPreset ? (
          <div className="grid grid-cols-3 gap-2" data-testid="row-presets-chips-loading">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 animate-pulse h-[64px]"
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
                    "rounded-xl border px-3 py-2.5 text-center transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 " +
                    (isActive
                      ? "border-brand-accent/30 bg-brand-deep/5 ring-1 ring-brand-accent/20"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800")
                  }
                  data-testid={`chip-preset-${preset.key}`}
                >
                  <span className={
                    "text-xs font-bold block " +
                    (isActive ? "text-brand-deep" : "text-slate-500 dark:text-slate-400")
                  }>
                    {preset.label}
                    {isPendingThis && <Loader2 className="inline ml-1 h-3 w-3 animate-spin" />}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">{preset.desc}</span>
                </button>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );

  const personalizationCard = (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative" data-testid="card-settings-personalization">      <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4 transition-colors duration-500">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
            <IdCard className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-personalization-title">Personalization</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-bold uppercase tracking-widest text-emerald-700" data-testid="badge-personalization-preview">
                <span className="h-1 w-1 rounded-full bg-emerald-500" /> Live
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-personalization-subtitle">Highlight what you share and what you do</p>
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
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" data-testid="text-personalization-desc">
          Choose exactly what appears on your public profile — which sections show, the order they're in, who's featured, and the roles you play. Open the customizer to edit it live; your choices are published to Nostr, so you own them across every client.
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
  const ignoredListCount = useMemo(() => (pubkey ? ignoredAlertMap(pubkey).size : 0), [pubkey]);
  const networkAlertsCard = (
    <button
      type="button"
      onClick={() => navigate("/alerts")}
      className="w-full flex items-center justify-between gap-3 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-brand-accent/15 px-5 py-4 text-left hover:border-brand-accent/30 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid="button-network-alerts"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
          <ShieldAlert className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Network Alerts</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-network-alerts-summary">
            {ignoredListCount === 0
              ? "Accounts people you trust have reported — the people you follow, your wider network, and anything you've ignored."
              : `Accounts people you trust have reported — the people you follow, your wider network, and ${ignoredListCount} you've ignored, saved to your account.`}
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
        className="w-full flex items-center justify-between gap-3 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-brand-accent/15 px-5 py-4 text-left hover:border-brand-accent/30 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        data-testid="button-advanced-toggle"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
            <SettingsIcon className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-advanced-title">Advanced</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-advanced-subtitle">Service provider &amp; trust recalculation — most people never need these.</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-500 dark:text-slate-400 transition-transform shrink-0 ${advancedOpen ? "rotate-180" : ""}`} />
      </button>
      {advancedOpen && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="grid-advanced">
          {serviceProviderCard}
          {trustCalcCard}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ABOUT TAB
  // ─────────────────────────────────────────────────────────────────────────
  const agentSetupCard = (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative" data-testid="section-agent-setup">      <button
        type="button"
        onClick={() => setAgentSetupOpen((v) => !v)}
        aria-expanded={agentSetupOpen}
        className={`w-full text-left bg-slate-50 dark:bg-slate-900 px-5 py-4 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${agentSetupOpen ? "border-b border-slate-200 dark:border-slate-800" : ""}`}
        data-testid="button-agent-setup-toggle"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-brand-deep" aria-hidden="true">
              <path d="M13.16 12.88V17.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.3 17.42L8.09 12.88L5.88 17.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.43 16.38H9.76" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22.14 9.96999V15.04C22.14 20.11 20.11 22.14 15.04 22.14H8.96C3.89 22.14 1.86 20.11 1.86 15.04V8.95999C1.86 3.88999 3.89 1.85999 8.96 1.85999H14.03" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22.14 9.96999H18.08C15.04 9.96999 14.02 8.95999 14.02 5.90999V1.85999L22.13 9.96999H22.14Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-agent-setup-title">Set up with your AI agent</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-[9px] font-bold uppercase tracking-widest text-brand-deep" data-testid="badge-agent-preview">
                <span className="h-1 w-1 rounded-full bg-brand-accent" /> Preview · coming soon
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-agent-setup-subtitle">Let an AI agent run Brainstorm for you — or wire it into your own client</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-500 dark:text-slate-400 transition-transform shrink-0 ${agentSetupOpen ? "rotate-180" : ""}`} />
      </button>

      {agentSetupOpen && (
      <div className="p-5 space-y-4">
        {/* Path toggle */}
        <div className="inline-flex rounded-full p-1 bg-white/70 dark:bg-slate-900/70 border border-brand-accent/12 shadow-sm backdrop-blur-sm" data-testid="agent-path-toggle">
          {([
            { key: "selfhost" as const, label: "Self-host" },
            { key: "integrate" as const, label: "Integrate into your client" },
          ]).map((opt) => {
            const active = agentPath === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setAgentPath(opt.key)}
                aria-current={active ? "true" : undefined}
                className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${
                  active ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/[0.3]" : "text-slate-500 dark:text-slate-400 hover:text-brand-deep"
                }`}
                data-testid={`agent-path-${opt.key}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" data-testid="text-agent-setup-desc">
          {agentPath === "selfhost"
            ? "Brainstorm is open-source. Instead of following technical steps yourself, hand them to your AI agent — copy the prompt below, or point your agent at our guide."
            : "Already run a Nostr client? Have your AI agent connect Brainstorm's web-of-trust scores and Trusted Assertions (NIP-85) so your users see personalized trust."}
        </p>

        {/* The prompt to paste into the agent */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Copy this prompt into your agent</p>
          <CodeBlock
            code={agentPath === "selfhost" ? AGENT_SELFHOST_PROMPT : AGENT_INTEGRATE_PROMPT}
            testId={`agent-prompt-${agentPath}`}
          />
        </div>

        {/* Point the agent at the guide */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-brand-accent/15 bg-white/70 dark:bg-slate-900/70 px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Or point your agent here</p>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">{`${typeof window !== "undefined" ? window.location.origin : ""}/developers`}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}/developers`;
                copyToClipboard(url);
                toast({ title: "Copied!", description: "Guide link copied to clipboard" });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
              data-testid="button-agent-copy-guide"
            >
              <Copy className="h-3.5 w-3.5" /> Copy link
            </button>
            <button
              type="button"
              onClick={() => navigate("/developers")}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold transition-colors"
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
            className="font-semibold text-brand-deep hover:text-brand-accent transition-colors"
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
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative" data-testid="section-contact-support">      <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4 transition-colors duration-500">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center">
            <Mail className="h-4 w-4 text-brand-deep" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-contact-support-title">Contact & Support</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-contact-support-subtitle">Developer outreach and general inquiries</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-brand-accent/15 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-5 hover:border-brand-accent/30 hover:shadow-sm transition-all duration-300" data-testid="card-list-your-client">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
                <Code2 className="h-4 w-4 text-brand-deep" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-list-client-title">List Your Client</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-list-client-subtitle">Get featured on Brainstorm</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4" data-testid="text-list-client-description">
              Built a Nostr client that supports NIP-85? Get your app featured on our Supported Clients showcase — free promotion to our growing user base.
            </p>
            <a
              href="mailto:support@nosfabrica.com?subject=NIP-85%20Client%20Listing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-deep hover:text-brand-accent transition-colors"
              data-testid="link-list-client-email"
            >
              <Mail className="h-4 w-4" />
              support@nosfabrica.com
            </a>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2" data-testid="text-list-client-helper">Include your client name, platform, and a brief description</p>
          </div>

          <div className="rounded-xl border border-brand-accent/15 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-5 hover:border-brand-accent/30 hover:shadow-sm transition-all duration-300" data-testid="card-get-in-touch">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4 text-brand-deep" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-get-in-touch-title">Get in Touch</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-get-in-touch-subtitle">Questions, feedback, or support</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4" data-testid="text-get-in-touch-description">
              Have questions, feedback, or need help with Brainstorm? We'd love to hear from you.
            </p>
            <a
              href="mailto:support@nosfabrica.com?subject=Brainstorm%20Support"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-deep hover:text-brand-accent transition-colors"
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
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative" data-testid="section-about">      <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4 transition-colors duration-500">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800/60 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800/60 shrink-0 bg-slate-900">
            <img src={nosFabricaLogo} alt="NosFabrica" className="h-full w-full object-cover" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-about-title">NosFabrica</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-about-subtitle">Weaving the fabric of Nostr</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4" data-testid="text-about-description">
          NosFabrica builds the open-source, scalable Web of Trust engines that power a safer, cleaner Nostr. We analyze raw network signals and turn them into clear, reliable trust scores.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            href="https://github.com/NosFabrica"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-3.5 hover:border-brand-accent/30 hover:shadow-sm transition-all duration-300 group/link"
            data-testid="link-github"
          >
            <div className="h-9 w-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 group-hover/link:bg-slate-800 transition-colors">
              <SiGithub className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block" data-testid="text-github-label">GitHub</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Open-source projects</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover/link:text-brand-accent transition-colors shrink-0" />
          </a>

          <a
            href="https://njump.me/npub1healthsx3swcgtknff7zwpg8aj2q7h49zecul5rz490f6z2zp59qnfvp8p"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-3.5 hover:border-brand-accent/30 hover:shadow-sm transition-all duration-300 group/link"
            data-testid="link-nostr"
          >
            <div className="h-9 w-9 rounded-xl overflow-hidden shrink-0">
              <img src={nostrLogo} alt="Nostr" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block" data-testid="text-nostr-label">Nostr</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Follow on Nostr</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover/link:text-brand-accent transition-colors shrink-0" />
          </a>

          <a
            href="https://nosfabrica.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-brand-accent/15 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-4 py-3.5 hover:border-brand-accent/30 hover:shadow-sm transition-all duration-300 group/link"
            data-testid="link-website"
          >
            <div className="h-9 w-9 rounded-xl overflow-hidden shrink-0 bg-slate-900 group-hover/link:bg-slate-800 transition-colors">
              <img src={nosFabricaLogo} alt="NosFabrica" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 block" data-testid="text-website-label">Website</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">nosfabrica.com</span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover/link:text-brand-accent transition-colors shrink-0" />
          </a>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          <p className="text-[11px] text-slate-500 dark:text-slate-400" data-testid="text-about-copyright">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Brainstorm</span> by NosFabrica — open-source under AGPL-3.0 license
          </p>
          <span className="text-[10px] font-mono text-slate-300 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-full border border-slate-100 dark:border-slate-800/60" data-testid="text-about-version">v1.0</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-brand-primary/[0.3] flex flex-col relative overflow-hidden" data-testid="page-settings">
      <GlossBackground />
      <AppHeader user={user} onLogout={handleLogout} calcDone={calcDone} active="settings" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10 w-full flex-1">
        <div className="space-y-6" data-testid="container-settings">
          <PageHeader
            kicker="Brainstorm Settings"
            title="Settings"
            subtitle="Manage your profile, trust, and account — all in one place."
            testId="section-settings-header"
          />

          {/* Tab navigation — segmented pill, matching the FAQ page */}
          <div className="max-w-full overflow-x-auto scrollbar-hide" data-testid="settings-tab-bar">
            <div className="inline-flex rounded-full p-1 bg-white/70 dark:bg-slate-900/70 border border-brand-accent/12 shadow-sm backdrop-blur-sm">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => goTab(tab.key)}
                    aria-current={active ? "page" : undefined}
                    className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${
                      active
                        ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/[0.3]"
                        : "text-slate-500 dark:text-slate-400 hover:text-brand-deep"
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
