import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { nip19 } from "nostr-tools";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import PageBackground from "@/components/PageBackground";
import { Footer } from "@/components/Footer";
import { useBrainstormAssistant } from "@/hooks/useBrainstormAssistant";
import { isNip85Activated } from "@/lib/nip85Activation";
import { fetchProfiles, getNip85RelayUrl } from "@/services/nostr";
import { useTrustProviderStatus } from "@/hooks/useTrustProviderStatus";
import { logout } from "@/accounts/login-flow";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { accountManager } from "@/accounts";
import {
  publishFailure,
  readAgentState,
  readPreviousScores,
  saveAgentState,
  savePreviousScores,
  type AgentState,
} from "./userPanelState";
import { apiClient, isAuthRedirecting } from "@/services/api";
import { useSelfOverview, useSelfHistory, useSelfConnections, flattenConnections } from "@/hooks/useSelf";
import { grapeRankResultOptions } from "@/services/queries/graperank";
import { useSocialActions } from "@/hooks/useSocialActions";
import { hasOwnScores } from "@/lib/ownScores";
import { pageWidth } from "@/lib/pageWidth";
import { cn } from "@/lib/utils";
import {
  AGENT_STATUS_CONFIG,
  getTier,
  nextAgentStatus,
  promoteOnPublish,
  taHistoryFrom,
  type FollowedUser,
  type TaHistoryEntry,
} from "./agentsuite/agentPanelModel";
import { useAgentForm } from "./agentsuite/useAgentForm";
import { AgentSuiteNav } from "./agentsuite/AgentSuiteNav";
import { ActivateDialog, AgentEditCard, AgentHeroCard } from "./agentsuite/AgentCards";
import {
  AccountOverviewStrip,
  InviteCard,
  ListsScaffoldCard,
  ScoreMonitorCard,
  TaHistoryCard,
} from "./agentsuite/PanelCards";

/** One identity's panel: remounted on an Account switch, so nothing typed or stored carries over. */
export default function UserPanelPage() {
  const user = useActiveAccountDisplay();
  return <UserPanel key={user?.pubkey ?? "signed-out"} />;
}

/** Whether this device holds only one identity, so an unkeyed row from before can only be theirs. */
function soleIdentityOnDevice(): boolean {
  return new Set(accountManager.accounts.map((a) => a.pubkey)).size <= 1;
}

function UserPanel() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const pubkey = user?.pubkey;
  // Read once per mount; the wrapper remounts this on a switch.
  const [stored] = useState(() => readAgentState(pubkey, { soleIdentity: soleIdentityOnDevice() }));
  const [agentState, setAgentState] = useState<AgentState>(stored);
  const form = useAgentForm(stored);
  const [activateConfirmOpen, setActivateConfirmOpen] = useState(false);
  const [followedProfiles, setFollowedProfiles] = useState<Map<string, { name?: string; picture?: string }>>(new Map());
  const [previousScores] = useState<Map<string, number>>(() => readPreviousScores(pubkey));

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  const updateAgentState = useCallback(
    (updates: Partial<AgentState>) => {
      setAgentState((prev) => {
        const next = { ...prev, ...updates };
        saveAgentState(pubkey, next);
        return next;
      });
    },
    [pubkey],
  );

  // Hydrate agent state from lightweight one-click publish (BrainstormAssistantCard)
  // so users who published via Dashboard/Settings see "active" status here without re-publishing.
  // The hook re-syncs when the lightweight card publishes in another tab/component, and
  // counts only the server's `ta_pubkey`, never another deployment's publish (#269).
  const { published: lightweightPublish } = useBrainstormAssistant();
  const lwTs = lightweightPublish?.publishedAt;
  useEffect(() => {
    if (!lwTs || isNaN(lwTs)) return;
    setAgentState((prev) => {
      const next = promoteOnPublish(prev, lwTs);
      if (next === prev) return prev;
      saveAgentState(pubkey, next);
      return next;
    });
  }, [lwTs, pubkey]);

  const { data: overviewData, isLoading: overviewLoading } = useSelfOverview(user?.pubkey);
  const { data: historyData, isLoading: historyLoading } = useSelfHistory(user?.pubkey);
  const followingConnections = useSelfConnections(user?.pubkey, "following", { enabled: !!user });
  const selfLoading = overviewLoading || historyLoading;

  // Polled app-wide while a run is in flight (hooks/useScoringStatus), not here.
  const { data: grapeRankData, isLoading: grapeRankLoading } = useQuery({
    ...grapeRankResultOptions(),
    enabled: !!user,
  });

  const taPubkey = historyData?.data?.ta_pubkey;
  const trustServiceProvider = useTrustProviderStatus(user?.pubkey, taPubkey);

  // The on-relay 10040 wins: a declaration naming a different assistant reads
  // as NOT activated no matter what the local flag says; absence/silence keeps
  // the flag's answer (a relay miss is not a deactivation).
  const nip85Activated =
    trustServiceProvider.data === "brainstorm" ||
    (trustServiceProvider.data !== "other" && isNip85Activated(user?.pubkey));
  const socialActions = useSocialActions(user?.pubkey);

  const followingList = useMemo(
    () => flattenConnections(followingConnections.data?.pages),
    [followingConnections.data?.pages],
  );
  const followingCount = overviewData?.data?.counts?.following ?? 0;
  const followersCount = overviewData?.data?.counts?.followed_by ?? 0;
  const totalNetworkSize = followingCount + followersCount;

  useEffect(() => {
    if (agentState.status === "dormant" || agentState.status === "activating") return;
    const totalSize = followingCount + followersCount;
    const grData = grapeRankData?.data;
    const hasCalc = grData?.internal_publication_status?.toLowerCase() === "success";

    const newStatus = nextAgentStatus(agentState.publishedAt, totalSize, nip85Activated, hasCalc);

    if (newStatus !== agentState.status) {
      updateAgentState({ status: newStatus });
    }
  }, [
    followingCount,
    followersCount,
    grapeRankData,
    nip85Activated,
    agentState.status,
    agentState.publishedAt,
    updateAgentState,
  ]);

  const grapeRank = grapeRankData?.data;
  const calcDone = grapeRank?.internal_publication_status?.toLowerCase() === "success" || hasOwnScores(user?.pubkey);
  const lastCalculated = historyData?.data?.last_time_calculated_graperank || grapeRankData?.data?.updated_at || null;

  const followedUsers = useMemo((): FollowedUser[] => {
    return followingList.map((entry) => {
      const pubkey = entry.pubkey;
      const influence = entry.influence ?? 0;
      let npub: string;
      try {
        npub = nip19.npubEncode(pubkey);
      } catch {
        npub = pubkey;
      }
      const tierInfo = getTier(influence);
      const profile = followedProfiles.get(pubkey);
      return {
        pubkey,
        npub,
        influence,
        displayName: profile?.name,
        picture: profile?.picture,
        tier: tierInfo.name,
        tierColor: tierInfo.badgeClass,
      };
    });
  }, [followingList, followedProfiles]);

  useEffect(() => {
    if (followedUsers.length > 0) {
      const currentScores = new Map<string, number>();
      followedUsers.forEach((u) => currentScores.set(u.pubkey, u.influence));
      savePreviousScores(pubkey, currentScores);
    }
  }, [followedUsers, pubkey]);

  useEffect(() => {
    if (followingList.length === 0) return;
    const pubkeys = followingList.map((e) => e.pubkey).slice(0, 100);
    if (pubkeys.length === 0) return;
    void fetchProfiles(pubkeys, (pubkey, profile) => {
      setFollowedProfiles((prev) => {
        const next = new Map(prev);
        next.set(pubkey, { name: profile.display_name || profile.name, picture: profile.picture || profile.image });
        return next;
      });
    });
  }, [followingList]);

  const taHistory = useMemo((): TaHistoryEntry[] => {
    let nip85Relay: string | null = null;
    if (grapeRank) {
      try {
        nip85Relay = getNip85RelayUrl();
      } catch {
        nip85Relay = null;
      }
    }
    return taHistoryFrom(grapeRank, nip85Relay, localStorage.getItem("brainstorm_ta_history"));
  }, [grapeRank]);

  const { getProfilePayload, getAgentStateUpdates, agentNameInput } = form;

  const publishBrainstormProfile = useMutation({
    mutationFn: async () => await apiClient.publishBrainstormAssistantProfile(getProfilePayload()),
    onSuccess: () => {
      updateAgentState({ ...getAgentStateUpdates(), status: "active", publishedAt: Date.now() });
      toast({
        title: "Assistant deployed!",
        description: `${agentNameInput.trim() || "Your assistant"} is now live on the Nostr network.`,
      });
    },
    // Nothing reached the network, whatever the reason: the assistant stays dormant.
    onError: (error: Error) => {
      updateAgentState({ status: "dormant" });
      toast({ variant: "destructive", ...publishFailure(error, "activate") });
    },
  });

  const updateBrainstormProfile = useMutation({
    mutationFn: async () => await apiClient.publishBrainstormAssistantProfile(getProfilePayload()),
    onSuccess: () => {
      toast({ title: "Assistant updated", description: "Profile published to the network." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", ...publishFailure(error, "update") });
    },
  });

  const handleActivateAgent = () => {
    if (!agentNameInput.trim()) {
      toast({
        variant: "destructive",
        title: "Name your assistant",
        description: "Give your assistant a name before activating.",
      });
      return;
    }
    setActivateConfirmOpen(true);
  };

  const handleConfirmActivation = () => {
    setActivateConfirmOpen(false);
    updateAgentState({ ...getAgentStateUpdates(), status: "activating", activatedAt: Date.now() });
    publishBrainstormProfile.mutate();
  };

  const handleUpdateAgent = () => {
    updateAgentState(getAgentStateUpdates());
    updateBrainstormProfile.mutate();
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user || isAuthRedirecting()) return null;

  const statusConfig = AGENT_STATUS_CONFIG[agentState.status];
  const agentIsLive = agentState.status !== "dormant" && agentState.status !== "activating";
  const truncatedNpub = user.npub.slice(0, 12) + "..." + user.npub.slice(-6);

  return (
    <div
      className="relative flex min-h-page flex-col overflow-hidden bg-[#F8FAFC] font-sans text-slate-900 selection:bg-brand-primary/[0.3] dark:bg-slate-950 dark:text-slate-100"
      data-testid="page-agentsuite"
    >
      <PageBackground />

      <AgentSuiteNav
        widthClassName={cn(pageWidth("wide"), "py-3 sm:py-4")}
        user={user}
        calcDone={calcDone}
        handleLogout={handleLogout}
      />

      <main className={cn(pageWidth("wide"), "relative z-10 flex-1 py-6 sm:py-8")}>
        <div className="animate-fade-up space-y-6" data-testid="container-agentsuite">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2" data-testid="section-agentsuite-header">
              <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-accent/20 bg-white/70 px-2.5 py-0.5 shadow-sm backdrop-blur-sm dark:bg-slate-900/70">
                <div className="h-1 w-1 rounded-full bg-brand-accent shadow-[0_0_4px_#13d2e5]" />
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-brand-accent">
                  Your Assistant on Nostr
                </p>
              </div>
              <h1
                className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-agentsuite-title"
              >
                <span className="block animate-gradient-x bg-gradient-to-r from-brand-accent via-brand-primary to-brand-primary bg-[length:200%_auto] bg-clip-text pb-1 text-transparent drop-shadow-sm">
                  Agent Suite
                </span>
              </h1>
              <p
                className="text-xs font-medium text-slate-600 dark:text-slate-300 sm:text-base"
                data-testid="text-agentsuite-subtitle"
              >
                Build your trust assistant — it grows with your network and earns trust on your behalf.
              </p>
            </div>
          </div>

          <AgentHeroCard
            agentState={agentState}
            statusConfig={statusConfig}
            agentIsLive={agentIsLive}
            form={form}
            handleActivateAgent={handleActivateAgent}
            totalNetworkSize={totalNetworkSize}
            nip85Activated={nip85Activated}
          />

          {agentIsLive && <AgentEditCard form={form} handleUpdateAgent={handleUpdateAgent} />}

          <AccountOverviewStrip
            selfLoading={selfLoading}
            npub={user.npub}
            truncatedNpub={truncatedNpub}
            nip85Activated={nip85Activated}
            totalNetworkSize={totalNetworkSize}
            lastCalculated={lastCalculated}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <InviteCard socialActions={socialActions} />

            <TaHistoryCard grapeRankLoading={grapeRankLoading} taHistory={taHistory} />
          </div>

          <ScoreMonitorCard
            followedUsers={followedUsers}
            followingCount={followingCount}
            selfLoading={selfLoading}
            grapeRankLoading={grapeRankLoading}
            previousScores={previousScores}
          />

          <ListsScaffoldCard />
        </div>
      </main>

      <Footer />

      <ActivateDialog
        activateConfirmOpen={activateConfirmOpen}
        setActivateConfirmOpen={setActivateConfirmOpen}
        agentNameInput={form.agentNameInput}
        agentDescInput={form.agentDescInput}
        handleConfirmActivation={handleConfirmActivation}
      />
    </div>
  );
}
