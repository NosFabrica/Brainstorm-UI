import { dashboardShortcutFor } from "@/lib/dashboardShortcuts";
import { scoreAge } from "@/lib/scoreAge";
import { useEffect, useState, useRef, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SearchBox } from "@/components/search/SearchBox";
import { SEARCH_PLACEHOLDER_CLASS } from "@/components/search/searchBoxChrome";
import { PageHeader } from "@/components/PageHeader";
import { useTrustPresetSync } from "@/hooks/useTrustPresetSync";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { FollowToCalculateCard } from "@/components/FollowToCalculateCard";
import { AlertsBanner } from "@/components/dashboard/AlertsBanner";
import { SetupProgressCard } from "@/components/dashboard/SetupProgressCard";
import { TaggedYouModule } from "@/components/dashboard/TaggedYouModule";
import { NetworkArticlesModule } from "@/components/dashboard/NetworkArticlesModule";
import { ClientShelf } from "@/components/dashboard/ClientShelf";
import { NetworkThreadModule } from "@/components/dashboard/NetworkThreadModule";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { profileShortLink, useShortLink } from "@/hooks/useShortLink";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldAlert, RefreshCw, Keyboard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ASSISTANT_UPDATED_EVENT,
  getCurrentAssistantPubkey,
  readAssistantDismissed,
  setAssistantDismissed as setAssistantDismissedStorage,
  setFirstPublishDone,
} from "@/lib/assistantStorage";
import { ensureAssistantPublished } from "@/lib/assistantPublish";
import { ToastAction } from "@/components/ui/toast";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { DeferredSessionNotice } from "@/components/DeferredSession";
import { isNip85Activated, markNip85Activated } from "@/lib/nip85Activation";
import { hasDeclinedNip85 } from "@/lib/nip85Consent";
import { useVerifiedNoFollows } from "@/hooks/useVerifiedNoFollows";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useSelfOverview, useSelfHistory } from "@/hooks/useSelf";
import { ActivateBrainstormModal } from "@/components/ActivateBrainstormModal";
import { needsActivationPrompt } from "@/components/ActivateBrainstormPanel";
import { dashboardPrompt } from "@/lib/dashboardPrompt";

import { identityHas } from "@/accounts/display";
import { accountKey } from "@/lib/accountStorage";

interface GrapeRankResult {
  status?: unknown;
  ta_status?: unknown;
  internal_publication_status?: unknown;
  average?: unknown;
  score?: unknown;
  graperank?: unknown;
  confidence?: unknown;
  value?: unknown;
  how_many_others_with_priority?: unknown;
  created_at?: string;
  updated_at?: string;
  count_values?: unknown;
  graperank_preset_used?: string | null;
}

const isStatusDone = (s: unknown): boolean => typeof s === "string" && s.toLowerCase() === "success";

// "Maybe later" on the Select-Brainstorm card is remembered per-account so it
// doesn't re-nag on every reload, but re-surfaces once after a cooldown.
const NIP85_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
function nip85DismissedRecently(pubkey?: string): boolean {
  if (!pubkey) return false;
  try {
    const at = Number(localStorage.getItem(accountKey("brainstorm_nip85_dismissed_at", pubkey)) || 0);
    return at > 0 && Date.now() - at < NIP85_DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/** Whether this account has already been shown the invite card. */
function readInviteCardSeen(pubkey?: string): boolean {
  try {
    return !!pubkey && localStorage.getItem(accountKey("brainstorm_invite_card_seen", pubkey)) === "true";
  } catch {
    return false;
  }
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // The page's own search box — the header's is off here so there is one. Once
  // the hero box has scrolled away, the header's comes in where it lives on every
  // other page, so search is always in reach deep in the feed; it steps aside
  // again when the hero is back. One box on screen at a time.
  const [query, setQuery] = useState("");
  const heroRef = useRef<HTMLDivElement | null>(null);
  const [heroAway, setHeroAway] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setHeroAway(!e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // "/" puts the cursor in whichever box is on screen — unless the reader is
  // already typing somewhere, where a slash is just a slash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const boxes = Array.from(document.querySelectorAll<HTMLElement>('[role="combobox"]'));
      if (!boxes.length) return;
      const onScreen = boxes.find((b) => {
        const r = b.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      });
      e.preventDefault();
      // preventScroll: Chrome scrolls a focused element inside a sticky header to
      // its *unstuck* position — the top of the page — which would hide the very
      // box the reader just asked for.
      (onScreen ?? boxes[0]).focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const [nip85ModalOpen, setNip85ModalOpen] = useState(false);
  const [nip85Activated, setNip85Activated] = useState(() => isNip85Activated(user?.pubkey));
  const [nip85Dismissed, setNip85Dismissed] = useState(() => nip85DismissedRecently(user?.pubkey));
  // In-app-created accounts consent at the calculate step (or implicitly, for
  // accounts that predate the consent card) and publish from there — the CTA
  // card would only nag them. The exception is an explicit decline on that
  // card: then this CTA is the one re-surface path, after the dismiss cooldown.
  const nip85CreatedInApp = (() => {
    return identityHas(user?.pubkey, "createdInApp");
  })();
  const [assistantDismissed, setAssistantDismissed] = useState<boolean>(() => readAssistantDismissed());
  const [assistantPubkey, setAssistantPubkey] = useState<string | null>(() => getCurrentAssistantPubkey());
  // "Your network is live — invite friends" card: shown once, the first time the
  // user's scores go ready (publishDone). Persisted per-account so it never nags.
  const [inviteShareOpen, setInviteShareOpen] = useState(false);
  const inviteShareUrl = useShortLink({ ...profileShortLink(user?.npub ?? ""), enabled: inviteShareOpen });
  const [inviteCardSeen, setInviteCardSeen] = useState<boolean>(() => readInviteCardSeen(user?.pubkey));

  // Lazy initialisers run once, and switching accounts in-app does not remount
  // this page — so without re-reading them, B renders with A's per-account flags:
  // B's consent card suppressed by A's dismissal, B's invite card already "seen".
  useEffect(() => {
    setNip85Activated(isNip85Activated(user?.pubkey));
    setNip85Dismissed(nip85DismissedRecently(user?.pubkey));
    setInviteCardSeen(readInviteCardSeen(user?.pubkey));
  }, [user?.pubkey]);
  const markInviteCardSeen = () => {
    try {
      const pk = user?.pubkey;
      if (pk) localStorage.setItem(accountKey("brainstorm_invite_card_seen", pk), "true");
    } catch {
      /* ignore */
    }
    setInviteCardSeen(true);
  };
  useEffect(() => {
    const sync = () => {
      setAssistantPubkey(getCurrentAssistantPubkey());
      setAssistantDismissed(readAssistantDismissed());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("brainstorm_assistant:")) sync();
    };
    // The assistant's storage is namespaced per owner, so a switch re-reads it.
    sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(ASSISTANT_UPDATED_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ASSISTANT_UPDATED_EVENT, sync as EventListener);
    };
  }, [user?.pubkey]);

  // Inline "Publish your assistant" prompt (existing users): publish in place
  // rather than navigating to the wrong settings page. Explicit click = consent,
  // so we DO follow the bot. Reuses the shared publish helper.
  const publishAssistantMutation = useMutation({
    mutationFn: () => ensureAssistantPublished({ follow: true, skipIfPublished: false }),
    onSuccess: ({ name }) => {
      setFirstPublishDone();
      setAssistantPubkey(getCurrentAssistantPubkey()); // collapse the prompt immediately
      toast({
        title: `${name} is live on Nostr!`,
        description: "Speaking your scores to compatible Nostr apps.",
        action: (
          <ToastAction
            altText="Customize your assistant"
            onClick={() => navigate("/settings?tab=brainstorm-assistant")}
          >
            Customize
          </ToastAction>
        ),
        duration: 6000,
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "Couldn't publish your assistant",
        description: err?.message || "Please try again in a moment.",
      });
    },
  });

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  useTrustPresetSync(!!user);

  const recalcTriggeredAtRef = useRef<number | null>(null);

  // SELF overview's `flagged_by_observer` is always false (self ≠ flags self),
  // so threshold doesn't affect any consumed field — omit to keep the queryKey
  // stable across `trustPreset` lifecycle transitions.
  const overviewQuery = useSelfOverview(user?.pubkey);
  const historyQuery = useSelfHistory(user?.pubkey);
  // Preset-driven server-side; a preset change invalidates this query.

  const grapeRankQuery = useQuery({
    queryKey: ["/user/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user,
    retry: false,
    refetchInterval: (query) => {
      const d = query.state.data?.data;
      if (!d || typeof d !== "object") return 60_000;
      const done = isStatusDone((d as GrapeRankResult).ta_status);
      if (done && recalcTriggeredAtRef.current) {
        const elapsed = Date.now() - recalcTriggeredAtRef.current;
        if (elapsed < 25 * 60 * 1000) return 60_000;
        recalcTriggeredAtRef.current = null;
      }
      return done ? false : 60_000;
    },
  });

  const prevStatusDoneRef = useRef<boolean | null>(null);
  useEffect(() => {
    const d = grapeRankQuery.data?.data as GrapeRankResult | undefined;
    if (!d || typeof d !== "object") return;
    const done = isStatusDone(d.ta_status) || isStatusDone(d.internal_publication_status);
    if (prevStatusDoneRef.current === false && done) {
      queryClient.invalidateQueries({ queryKey: ["/user/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/user/history"] });
      queryClient.invalidateQueries({ queryKey: ["/user/stats"] });
    }
    prevStatusDoneRef.current = done;
  }, [grapeRankQuery.data]);

  const wasAutoTriggeredRef = useRef(false);

  const triggerGrapeRankMutation = useMutation({
    mutationFn: () => apiClient.triggerGrapeRank(),
    onSuccess: (data) => {
      recalcTriggeredAtRef.current = Date.now();
      if (data?.data && typeof data.data === "object") {
        queryClient.setQueryData(["/user/graperankResult"], data);
      }
      queryClient.invalidateQueries({ queryKey: ["/user/graperankResult"] });
      wasAutoTriggeredRef.current = false;
      // First-time calc vs a true recalculation reads very differently — don't
      // tell a never-scored user we're "refreshing" / "recalculating".
      let hadPrev = false;
      try {
        hadPrev = localStorage.getItem("brainstorm_calc_completed") === "true";
      } catch {}
      toast({
        title: hadPrev ? "Refreshing your scores" : "Calculating your network",
        description: hadPrev
          ? "Your scores are being recalculated — results will update shortly."
          : "We're scoring your network for the first time. You can keep exploring while it runs.",
        duration: 5000,
      });
      setTimeout(() => triggerGrapeRankMutation.reset(), 5000);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Calculation failed",
        description:
          error instanceof Error ? error.message : "Something went wrong. Please wait a moment and try again.",
        duration: 8000,
      });
      setTimeout(() => triggerGrapeRankMutation.reset(), 8000);
    },
  });

  const overview = overviewQuery.data?.data ?? null;
  const history = historyQuery.data?.data ?? null;

  const taPubkey = history?.ta_pubkey;
  const trustServiceProvider = useTrustProviderStatus(user?.pubkey, taPubkey);

  useEffect(() => {
    // The on-relay 10040 is the authority. "brainstorm" marks this account
    // activated and shows the badge; "other" (a declaration naming a DIFFERENT
    // assistant — definitive presence, not a miss) downgrades it, because a
    // green "Active" badge over a foreign declaration is a lie. "none"/
    // "unknown" are absence/silence and never downgrade — relays are
    // eventually-consistent, and that flicker right after an auto-publish is
    // what upgrade-only-on-miss protects against.
    if (trustServiceProvider.data === "brainstorm") {
      markNip85Activated(user?.pubkey);
      if (!nip85Activated) setNip85Activated(true);
    } else if (trustServiceProvider.data === "other") {
      // The flag itself is cleared by useTrustProviderStatus once the relays answer.
      if (nip85Activated) setNip85Activated(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- provider data is already keyed on pubkey
  }, [trustServiceProvider.data, nip85Activated]);

  const activatePending = needsActivationPrompt({
    status: trustServiceProvider.data,
    locallyActivated: nip85Activated,
    createdInApp: nip85CreatedInApp,
  });

  // Note: ta_pubkey needs no waiting — the backend creates it during login
  // itself (authChallenge verify), so for any session-holder the first
  // /user/history response already carries it. Signing is always performable.

  const grapeRankRaw = grapeRankQuery.data?.data;
  const grapeRank: GrapeRankResult | null = grapeRankRaw && typeof grapeRankRaw === "object" ? grapeRankRaw : null;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const followersCount = overview?.counts?.followed_by ?? 0;
  const followingCount = overview?.counts?.following ?? 0;
  const mutedByCount = overview?.counts?.muted_by ?? 0;
  const mutingCount = overview?.counts?.muting ?? 0;
  const reportedByCount = overview?.counts?.reported_by ?? 0;
  const reportingCount = overview?.counts?.reporting ?? 0;
  const influence = overview?.influence ?? 0;

  const queuePosition = grapeRank
    ? typeof grapeRank.how_many_others_with_priority === "number"
      ? grapeRank.how_many_others_with_priority
      : null
    : null;

  const grapeRankCreatedAt =
    grapeRank && grapeRank.created_at
      ? new Date(grapeRank.created_at.endsWith("Z") ? grapeRank.created_at : grapeRank.created_at + "Z")
      : null;
  const grapeRankUpdatedAt =
    grapeRank && grapeRank.updated_at
      ? new Date(grapeRank.updated_at.endsWith("Z") ? grapeRank.updated_at : grapeRank.updated_at + "Z")
      : null;

  const calcDone = grapeRank ? isStatusDone(grapeRank.internal_publication_status) : false;
  const publishDone = calcDone && grapeRank ? isStatusDone(grapeRank.ta_status) : false;

  const isGrapeRankFailed = grapeRank
    ? typeof grapeRank.status === "string" && grapeRank.status.toLowerCase() === "failure"
    : false;

  const isPublishFailed =
    calcDone && grapeRank
      ? typeof grapeRank.ta_status === "string" && grapeRank.ta_status.toLowerCase() === "failure"
      : false;

  // The backend count alone lied here: it reads 0 until GrapeRank first ingests
  // the contact list, so an existing user on a fresh device was handed the
  // new-user follow picker. Only believe "no follows" once the relay-side
  // verification agrees (it also repairs the local floor when a list is found,
  // which lets AutoScoreReturning take over).
  const followVerification = useVerifiedNoFollows(user?.pubkey);
  const hasNoFollowing = overviewQuery.isSuccess && followingCount === 0 && followVerification === "none";
  const followsChecking = overviewQuery.isSuccess && followingCount === 0 && followVerification === "checking";

  // The backend `following` count lags for brand-new accounts — it only fills in
  // after the first GrapeRank pass ingests the contact list. So a user who has
  // already followed + triggered scoring still reads followingCount === 0 for a
  // while. This flag (set the moment scoring is triggered, which requires having
  // followed) lets us stop re-nagging them to "follow to begin" and instead show
  // a calm "calculating" state until the count catches up.
  const calcTriggered = (() => {
    try {
      return !!user?.pubkey && !!localStorage.getItem(accountKey("brainstorm_calc_triggered_at", user.pubkey));
    } catch {
      return false;
    }
  })();

  // The no-follows user just used the inline follow-picker → bridge to the
  // "calculating" state and suppress any stale "failed" status until the fresh
  // GrapeRank result replaces it.
  const [justFollowed, setJustFollowed] = useState(false);
  const handleFollowDone = () => {
    setJustFollowed(true);
    queryClient.invalidateQueries({ queryKey: ["/user/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/user/history"] });
    queryClient.invalidateQueries({ queryKey: ["/user/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/user/graperankResult"] });
  };

  const prevCalcDoneRef = useRef(false);
  useEffect(() => {
    if (calcDone && !prevCalcDoneRef.current) {
      queryClient.invalidateQueries({ queryKey: ["/user/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/user/history"] });
      queryClient.invalidateQueries({ queryKey: ["/user/stats"] });
    }
    prevCalcDoneRef.current = calcDone;
  }, [calcDone]);

  const [, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isGrapeRankFailed && !isPublishFailed) {
      setRetryCount(0);
    }
  }, [isGrapeRankFailed, isPublishFailed]);

  const autoTriggeredRef = useRef(false);
  useEffect(() => {
    if (
      grapeRankQuery.isSuccess &&
      grapeRank === null &&
      !isGrapeRankFailed &&
      !triggerGrapeRankMutation.isPending &&
      !autoTriggeredRef.current &&
      overviewQuery.isSuccess &&
      !hasNoFollowing &&
      followingCount > 0
    ) {
      autoTriggeredRef.current = true;
      wasAutoTriggeredRef.current = true;
      triggerGrapeRankMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation object is new each render
  }, [
    grapeRankQuery.isSuccess,
    grapeRank,
    isGrapeRankFailed,
    triggerGrapeRankMutation.isPending,
    overviewQuery.isSuccess,
    hasNoFollowing,
    followingCount,
  ]);

  // How old the scores are, in words; past two weeks the strip says so and
  // Recalculate becomes the action rather than the reference.
  const age = scoreAge(grapeRankUpdatedAt || grapeRankCreatedAt);
  const stale = publishDone && !!age?.stale;

  const handleExport = () => {
    const data = {
      format: "brainstorm-v1",
      observer: user?.npub,
      calculatedAt: new Date().toISOString(),
      stats: {
        followersCount,
        followingCount,
        mutedByCount,
        mutingCount,
        reportedByCount,
        reportingCount,
        influence,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brainstorm-scores-${Date.now()}.json`;
    a.click();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Not while typing anywhere (the search box is a contenteditable), not with a modifier.
      switch (dashboardShortcutFor(e)) {
        case "export":
          handleExport();
          break;
        case "home":
          navigate("/dashboard");
          break;
        case "help":
          setShowShortcuts((prev) => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleExport is per-render; user dep re-binds it
  }, [navigate, user]);

  // Per-pubkey — a global flag would leak one account's "has scores" state onto
  // the next account on the same browser (making a brand-new user look like a
  // recalculation). Keep the legacy global key in sync for back-compat readers.
  const hadPreviousScores = useMemo(() => {
    const k = user?.pubkey ? accountKey("brainstorm_calc_completed", user.pubkey) : "";
    if (calcDone) {
      try {
        if (k) localStorage.setItem(k, "true");
        localStorage.setItem("brainstorm_calc_completed", "true");
      } catch {}
      return true;
    }
    try {
      return !!k && localStorage.getItem(k) === "true";
    } catch {
      return false;
    }
  }, [calcDone, user?.pubkey]);

  // Also above the early return, for the same reason. Holds whether this is the
  // user's first-ever visit; the value is captured further down, once
  // overviewQuery has actually answered.
  const firstSessionRef = useRef<boolean | null>(null);

  if (!user || isAuthRedirecting()) return null;

  const isRecalculating = !calcDone && hadPreviousScores && !grapeRankQuery.isLoading;
  const isCalculationComplete = calcDone || isRecalculating;

  // "Welcome back" is a lie to someone who signed up 30 seconds ago, and the
  // displayName fallback invented "Traveler" for exactly the people least likely
  // to have set a name — new users. hadPreviousScores is a persisted per-account
  // flag, so it identifies a genuine first visit with no new storage.
  //
  // FROZEN for the session: hadPreviousScores flips true the instant the first
  // calculation lands, which would otherwise swap the heading out from under a
  // user mid-visit. Captured on the first render where we actually know. The ref
  // itself is declared ABOVE the early return — declaring it here made it a hook
  // called after a conditional return, which changed hook order between renders
  // and blanked the whole page.
  if (firstSessionRef.current === null && overviewQuery.isSuccess) {
    firstSessionRef.current = !hadPreviousScores;
  }
  const isFirstSession = firstSessionRef.current === true;
  // `overviewQuery.isSuccess` is load-bearing, not belt-and-braces: hasNoFollowing
  // is `overviewQuery.isSuccess && followingCount === 0`, so while overview is
  // still in flight it reads FALSE — indistinguishable from "this user has
  // follows". For a brand-new account grapeRank resolves first, every other term
  // passes, and the onboarding panel flashed on screen for that window before
  // overview landed and yanked it away. Waiting for overview to settle closes it.
  // `followsChecking` closes the same flash for the relay verification window:
  // while it's running, hasNoFollowing reads FALSE too, and without the guard
  // the onboarding panel would show for a user about to get the follow picker.
  const showOnboarding =
    overviewQuery.isSuccess &&
    !grapeRankQuery.isLoading &&
    !publishDone &&
    !hasNoFollowing &&
    !followsChecking &&
    !isRecalculating &&
    !hadPreviousScores;
  // No-follows is NOT an error — it's the "start here" state (handled by the
  // inline follow-picker). Only real GrapeRank/publish failures are errors, and
  // we suppress those right after a fresh follow+calculate.
  const isErrorState = (isGrapeRankFailed || isPublishFailed) && !hasNoFollowing && !followsChecking && !justFollowed;
  // A "recalculation" requires PRIOR completed scores — not merely an in-progress
  // result object (which exists during a first-time calc too). Using `grapeRank`
  // here made a never-scored user's first calc read as "Refreshing / previous
  // scores will be replaced".
  // A recalculation requires PRIOR completed scores for THIS account. `grapeRankScore`
  // can be present on a failed/in-progress result, and `nip85Activated` is a global
  // flag — both caused brand-new accounts to read as "Recalculating".
  const isRecalculation = !publishDone && hadPreviousScores;

  // The one prompt line under the title (see lib/dashboardPrompt). `consentDue`
  // is the legacy Select-Brainstorm card's cohort: in-app accounts that
  // explicitly DECLINED the consent card (needsActivationPrompt skips
  // createdInApp entirely; the post-cooldown re-ask lives here) and accounts
  // whose relay check couldn't settle. `showOnboarding` keeps the signature
  // available DURING the first calculation (~7 min): signing needs only
  // ta_pubkey, which exists from login — black-box testing showed users lost
  // in exactly that gap when the card waited for publishDone. `inviteDue` is
  // the once-per-account invite beat when scores first go live, never on recalcs.
  // Neither activation ask goes to someone whose Treasure Map gives the rank
  // duty to another Assistant: that was their choice (needsActivationPrompt).
  const prompt = dashboardPrompt({
    activatePending,
    consentDue:
      (publishDone || showOnboarding) &&
      !isRecalculating &&
      !nip85Activated &&
      !nip85Dismissed &&
      trustServiceProvider.data !== "other" &&
      (!nip85CreatedInApp || hasDeclinedNip85(user?.pubkey)),
    inviteDue: publishDone && !inviteCardSeen && !isRecalculating,
    assistantDue: publishDone && nip85Activated && !assistantDismissed && !assistantPubkey && !nip85CreatedInApp,
  });

  // One modal instance, reachable from both the takeover and the dashboard.
  const activateModal = (
    <ActivateBrainstormModal
      open={nip85ModalOpen}
      onOpenChange={setNip85ModalOpen}
      serviceKey={history?.ta_pubkey || ""}
      onActivated={() => {
        setNip85Activated(true);
        // The provider-status cache was seeded to "brainstorm" by the publish
        // itself (publishBrainstormTrustAnchor) — the 10040 we just published
        // IS the new relay state, so nothing refetches into propagation lag
        // and re-raises the prompt we're dismissing.
        setNip85ModalOpen(false);
        toast({
          title: "Brainstorm activated!",
          description: "Your scores are now available across the nostr ecosystem.",
        });
      }}
    />
  );

  // The full-page activation takeover (ActivateBrainstormInterstitial) and its
  // first-paint hold used to live here — a signer user with follows but no
  // kind-10040 met a spinner, then a wall. The finish-setup flow replaced
  // them: the header banner + setup card carry the nudge, and the dashboard
  // always renders.

  return (
    <TooltipProvider>
      <div
        className="relative flex min-h-page flex-col overflow-x-clip bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
        data-testid="page-dashboard"
      >
        <PageBackground />

        <AppHeader user={user} onLogout={handleLogout} active="dashboard" search={heroAway} />

        {/* One column, one rhythm: every block is a direct child and the column's gap
            is the only spacing between them — a block that renders nothing leaves no
            hole, and nothing carries a margin of its own. */}
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:gap-6 sm:px-6 sm:py-8">
          <DeferredSessionNotice />

          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              {/* Compact: a page someone opens every day. The subtitle only speaks when
                  it has news (first run, no follows) — "active and growing" was a
                  slogan taking a line from the product on every visit. */}
              <PageHeader
                size="compact"
                kicker="Brainstorm Dashboard"
                title={
                  isFirstSession ? (
                    <>
                      Welcome to <span className="text-brand-link">Brainstorm</span>
                    </>
                  ) : user.displayName ? (
                    <>
                      Welcome back, <span className="text-brand-link">{user.displayName}</span>
                    </>
                  ) : (
                    <>Welcome back</>
                  )
                }
                subtitle={
                  isFirstSession
                    ? "Setting up your trust network."
                    : hasNoFollowing
                      ? "Set up your trust network"
                      : undefined
                }
                testId="section-dashboard-header-copy"
              />

              {/* Hidden for a brand-new account with no scores yet. Both of its
                  actions are useless-or-worse at that moment: "Recalculate" while the
                  first calculation is already running either no-ops or re-queues them
                  behind other users, and "View insights" opens a page with nothing in
                  it. All it adds is a fourth "Awaiting calculation" — and on mobile it
                  stacks directly above the CalculatingNotice, so the duplication is
                  unmissable. It returns the moment scores land. */}
              {isFirstSession && !calcDone ? null : (
                // One slim line: the label, the state, when, and two text actions.
                // It used to be a two-storey card with a boxed Recalculate button;
                // the state is the news, the rest is reference. Activation pending
                // is no longer said here — the prompt line below the title says it,
                // once, with the action beside it.
                <Card
                  // On a phone: two deliberate rows — the label and the state across the
                  // top, the two actions across the bottom — instead of a wrapped line
                  // with a ragged edge. From `md` the groups dissolve into the one line.
                  className="flex w-full flex-col gap-1.5 self-start rounded-xl px-3 py-2 text-xs leading-tight transition-all duration-200 md:w-auto md:flex-row md:flex-wrap md:items-center md:gap-x-2.5 md:gap-y-1 md:self-end"
                  data-testid="card-overall-trust-score"
                >
                  <div className="flex items-center justify-between gap-2 md:contents">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                      Trust signals
                    </span>
                    {triggerGrapeRankMutation.isPending ? (
                      <span
                        className="flex items-center gap-1 font-medium text-brand-primary dark:text-brand-link"
                        data-testid="text-overall-trust-score-sub"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Recalculating…
                      </span>
                    ) : isErrorState ? (
                      <span className="font-medium text-red-500" data-testid="text-overall-trust-score-sub">
                        {isGrapeRankFailed
                          ? "Calculation failed"
                          : isPublishFailed
                            ? "Publishing failed"
                            : "Action needed"}
                      </span>
                    ) : isRecalculation || justFollowed ? (
                      <span
                        className="flex items-center gap-1 font-medium text-brand-primary"
                        data-testid="text-overall-trust-score-sub"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {calcDone ? "Publishing…" : "Calculating…"}
                      </span>
                    ) : publishDone && nip85Activated ? (
                      // Published AND other apps can find them: the one green pill.
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                        data-testid="text-overall-trust-score-sub"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                        Active
                      </span>
                    ) : stale && age ? (
                      // Weeks old: the strip's one job is to say whether the scores are current.
                      <span
                        className="font-semibold text-amber-600 dark:text-amber-400"
                        data-testid="text-overall-trust-score-sub"
                      >
                        Scores are {age.old}
                      </span>
                    ) : publishDone ? (
                      // Not "Score: 0.4321" or "Complete": what the reader has, in a word.
                      <span
                        className="font-semibold text-emerald-600 dark:text-emerald-400"
                        data-testid="text-overall-trust-score-sub"
                      >
                        Scores ready
                      </span>
                    ) : (
                      <span
                        className="font-medium text-slate-500 dark:text-slate-400"
                        data-testid="text-overall-trust-score-sub"
                      >
                        Awaiting calculation
                      </span>
                    )}
                    {publishDone && age && !stale && (
                      <span className="text-slate-400 dark:text-slate-500" data-testid="text-trust-signals-updated">
                        · Updated {age.label}
                      </span>
                    )}
                  </div>
                  <span
                    className="hidden h-3 w-px shrink-0 bg-slate-200 dark:bg-slate-700 md:block"
                    aria-hidden="true"
                  />
                  <div className="flex items-center justify-between gap-2 md:contents">
                    <button
                      type="button"
                      onClick={() => setRecalcConfirmOpen(true)}
                      disabled={triggerGrapeRankMutation.isPending || hasNoFollowing}
                      className={
                        stale
                          ? "inline-flex items-center gap-1 rounded-full bg-brand-primary px-2.5 py-0.5 font-semibold text-white hover:bg-brand-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:pointer-events-none disabled:opacity-40"
                          : "inline-flex items-center gap-1 rounded font-semibold text-brand-deep hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 disabled:pointer-events-none disabled:opacity-40 dark:text-brand-link"
                      }
                      data-testid="button-trigger-graperank"
                    >
                      {triggerGrapeRankMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {triggerGrapeRankMutation.isPending ? "Calculating" : stale ? "Recalculate now" : "Recalculate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/insights")}
                      className="rounded font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                      data-testid="link-view-insights"
                    >
                      View insights →
                    </button>
                  </div>
                </Card>
              )}
            </div>

            {/* THE prompt — one line, one action. The header's Finish-setup pill
                already lists every step still owed, so the body doesn't repeat
                them as panels: this replaces the Activate panel, the legacy
                Select-Brainstorm card and the invite card, which could stack
                three high on a phone. dashboardPrompt picks the most important. */}
            {/* A search app's signed-in home starts with the search. The box is the one
                every surface shares; a search here is the usual trip to /?q=. The header's
                own box is off on this page so there is exactly one. */}
            <div ref={heroRef} data-testid="dashboard-search">
              <SearchBox
                className="w-full"
                value={query}
                onChange={setQuery}
                onClear={() => setQuery("")}
                placeholder={<span className={SEARCH_PLACEHOLDER_CLASS}>Search people, topics, or handles</span>}
                ariaLabel="Search Brainstorm"
                // A returning reader on a desktop can just type. Not on a phone,
                // where autofocus pops the keyboard over the page they came to read.
                autoFocus={typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches}
              />
            </div>

            {prompt && (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-3.5 py-2.5 text-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60"
                data-testid="dashboard-prompt"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${prompt.key === "activate" ? "bg-amber-500" : "bg-brand-accent"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 font-medium text-slate-700 dark:text-slate-200">{prompt.label}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (prompt.key === "activate") navigate("/setup/activate");
                    else if (prompt.key === "consent") setNip85ModalOpen(true);
                    else if (prompt.key === "assistant") publishAssistantMutation.mutate();
                    else {
                      setInviteShareOpen(true);
                      markInviteCardSeen();
                    }
                  }}
                  disabled={prompt.key === "assistant" && publishAssistantMutation.isPending}
                  className="inline-flex items-center gap-1 rounded font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
                  data-testid={`dashboard-prompt-${prompt.key}`}
                >
                  {prompt.key === "assistant" && publishAssistantMutation.isPending
                    ? "Publishing…"
                    : `${prompt.action} →`}
                </button>
                {/* Activation has no "not now" by design: it self-hides once signed. */}
                {prompt.key !== "activate" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (prompt.key === "invite") markInviteCardSeen();
                      else if (prompt.key === "assistant") {
                        setAssistantDismissedStorage(true);
                        setAssistantDismissed(true);
                      } else {
                        try {
                          const pk = user?.pubkey;
                          if (pk)
                            localStorage.setItem(accountKey("brainstorm_nip85_dismissed_at", pk), String(Date.now()));
                        } catch {
                          /* ignore */
                        }
                        setNip85Dismissed(true);
                      }
                    }}
                    className="ml-auto text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                    data-testid="dashboard-prompt-dismiss"
                  >
                    Not now
                  </button>
                )}
              </div>
            )}

            <AlertDialog open={recalcConfirmOpen} onOpenChange={setRecalcConfirmOpen}>
              <AlertDialogContent
                className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
                data-testid="dialog-confirm-recalculate-dashboard"
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
                      data-testid="text-confirm-recalculate-dashboard-title"
                    >
                      Recalculate GrapeRank?
                    </AlertDialogTitle>
                    <AlertDialogDescription
                      className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                      data-testid="text-confirm-recalculate-dashboard-desc"
                    >
                      This re-runs your full network trust calculation. It typically takes about 5 minutes and your
                      current scores will be replaced with updated results.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="mt-5 gap-2 sm:gap-2">
                    <AlertDialogCancel className="rounded-xl" data-testid="button-confirm-recalculate-dashboard-cancel">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-xl bg-brand-primary text-white shadow-lg shadow-brand-primary/25 hover:bg-brand-primary-hover"
                      onClick={() => {
                        setRecalcConfirmOpen(false);
                        triggerGrapeRankMutation.mutate();
                      }}
                      data-testid="button-confirm-recalculate-dashboard-continue"
                    >
                      Recalculate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </div>
              </AlertDialogContent>
            </AlertDialog>

            <AnimatePresence>
              {(isGrapeRankFailed || isPublishFailed) &&
                !hasNoFollowing &&
                !followsChecking &&
                !justFollowed &&
                !triggerGrapeRankMutation.isError &&
                !triggerGrapeRankMutation.isPending &&
                !triggerGrapeRankMutation.isSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="flex w-fit items-center gap-3 rounded-2xl border border-red-200/60 bg-white/60 p-3 shadow-[0_8px_30px_-12px_rgba(239,68,68,0.15)] backdrop-blur-xl dark:border-red-500/25 dark:bg-slate-900/60 md:ml-auto"
                    data-testid="graperank-failed"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10">
                      <ShieldAlert className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300">Calculation incomplete</p>
                      <p className="mt-0.5 text-xs text-red-600/80 dark:text-red-400/80">
                        Please wait a few minutes, then try again.
                      </p>
                    </div>
                  </motion.div>
                )}
            </AnimatePresence>
            {/* Genuinely new, zero-follows, not-yet-started users → inline
                follow-picker (same suggestions as /welcome) so they can start
                their Web of Trust without leaving. */}
            {hasNoFollowing && !calcTriggered && !justFollowed && !triggerGrapeRankMutation.isPending && (
              <FollowToCalculateCard onDone={handleFollowDone} />
            )}

            {/* Already followed + triggered scoring, but the backend
                following-count hasn't caught up yet. Don't re-nag them to
                follow — reassure that their scores are calculating. */}
            {hasNoFollowing && calcTriggered && !justFollowed && !triggerGrapeRankMutation.isPending && (
              <div
                className="flex items-center gap-4 rounded-2xl border border-brand-accent/20 bg-white/60 p-5 shadow-sm backdrop-blur-xl dark:bg-slate-900/60 dark:shadow-none"
                data-testid="card-building-wot"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary dark:text-brand-link">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Building your network</div>
                  <div className="text-[13px] text-slate-500 dark:text-slate-400">
                    You're all set — your scores are calculating. This can take a few minutes.
                  </div>
                </div>
              </div>
            )}

            {/* The invite share sheet, reachable from the prompt line above. Rendered
                outside the prompt's gate so it stays mounted after the prompt
                collapses (clicking Invite marks the card seen). */}
            {user && (
              <ShareProfileModal
                open={inviteShareOpen}
                onOpenChange={setInviteShareOpen}
                invite
                npub={user.npub}
                displayName={user.displayName || "You"}
                picture={user.picture}
                nip05={user.nip05}
                shareUrl={inviteShareUrl}
                // No trust pill on an invite: the score is self-referential (your own POV
                // ≈ 100) and meaningless for a brand-new account — the invite is about
                // "join & start connected to you", not a score flex.
                score01={null}
              />
            )}

            {/* First run: what's still to set up, plus one line of calc status.
                Replaces a ~375-line dark marketing hero (a rotating
                ONBOARDING_SLIDES carousel over a CALCULATING/PUBLISHING stepper)
                that filled the fold while saying nothing actionable — a new user's
                first few minutes are spent waiting, so spend them on the setup
                they still owe. Recalculating users were already excluded here;
                their status lives in the top-right Trust signals card and the
                app-wide pill. Failures are carried by the alert above, so the
                status line stands down rather than promising a time estimate. */}
            {showOnboarding && <SetupProgressCard queueAhead={queuePosition} showStatus={!isErrorState} />}
          </div>

          {activateModal}

          {/* No lookup bar here: the header's search box is the same box, one
              line up — two of them on one screen was one too many. */}

          {/* Stacked, full width, at every size: alerts, then "Your Network", then
              what the network is reading. A two-column desktop (network left,
              reading right) was tried and turned down — the stats row reads better
              across the page. Expanding Alerts is a vertical accordion, never a
              shove sideways. */}
          {/* Nothing here can hold real data before the first calculation, so before
              then we render NOTHING rather than shells. Previously a brand-new user
              got Network Alerts' "your safety radar is warming up" AND a full-height
              greyed-out Your Network with a "Scores calculating…" overlay — so the
              page said "wait" four or five times over and looked broken. The single
              CalculatingNotice above is the one statement; these appear when they
              have something to show. */}
          {isCalculationComplete && <AlertsBanner observer={user?.pubkey ?? ""} enabled={isCalculationComplete} />}

          {/* Someone put a public label on you. Nothing else in the app would
              ever tell you — self-hides when there's nothing new. Under "Your
              Network", not above it: it arrives a moment after the page, and up
              top it shoved the network card ~270px down under a reader's thumb. */}
          <TaggedYouModule />

          {/* Discovery, not a following feed: long-form from accounts two-plus
              hops out that the graph vouches for. Renders nothing until there's
              something worth showing. */}
          <NetworkArticlesModule observer={user?.pubkey ?? ""} enabled={isCalculationComplete} />

          {/* The circle you already chose (1 hop), under the discovery module.
              Read-only: notes open the full conversation at /e/:id rather than
              faking a composer the product doesn't have yet. */}
          <NetworkThreadModule observer={user?.pubkey ?? ""} enabled={isCalculationComplete} />

          {/* Expands to fill the gap while the modules above are still gated off,
              and tightens to one row once scores land. See ClientShelf. */}
          <ClientShelf expanded={!isCalculationComplete} onNavigate={navigate} />
        </div>

        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                <Keyboard className="h-5 w-5 text-brand-primary dark:text-brand-link" />
                Keyboard Shortcuts
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Export data</span>
                  <kbd className="rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    E
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Go home</span>
                  <kbd className="rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    H
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Toggle shortcuts</span>
                  <kbd className="rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    ?
                  </kbd>
                </div>
              </div>
              <Button
                className="mt-6 w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                onClick={() => setShowShortcuts(false)}
              >
                Got it
              </Button>
            </motion.div>
          </motion.div>
        )}

        <Footer minimal />
      </div>
    </TooltipProvider>
  );
}
