import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Zap, LogOut, User, Copy, Check, Loader2, TrendingUp, Users, UserPlus, UserMinus, VolumeX, ShieldAlert, Star, Play } from "lucide-react";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";
import { apiClient } from "@/services/api";

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<NostrUser | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) {
      navigate("/");
      return;
    }
    setUser(u);
  }, [navigate]);

  const hasToken = !!sessionStorage.getItem("brainstorm_session_token");

  const selfQuery = useQuery({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user && hasToken,
    retry: false,
  });

  const grapeRankQuery = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user && hasToken,
    retry: false,
  });

  const triggerGrapeRankMutation = useMutation({
    mutationFn: () => apiClient.triggerGrapeRank(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/graperankResult"] });
      setTimeout(() => triggerGrapeRankMutation.reset(), 5000);
    },
    onError: () => {
      setTimeout(() => triggerGrapeRankMutation.reset(), 5000);
    },
  });

  const selfData = selfQuery.data?.data;
  const network = selfData?.graph || user?.userData?.data?.graph || null;
  const grapeRankRaw = grapeRankQuery.data?.data;
  const grapeRank = grapeRankRaw && typeof grapeRankRaw === "object" ? grapeRankRaw : null;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleCopyNpub = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.npub);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const truncatedNpub = user
    ? user.npub.slice(0, 12) + "..." + user.npub.slice(-6)
    : "";

  if (!user) return null;

  return (
    <div className="min-h-screen w-full bg-background" data-testid="page-dashboard">
      <header className="border-b">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">Brainstorm</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-6">
          <Card data-testid="card-user-info">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-start gap-4">
                <Avatar className="w-14 h-14" data-testid="img-user-avatar">
                  {user.picture ? (
                    <AvatarImage src={user.picture} alt={user.displayName || "Profile"} />
                  ) : null}
                  <AvatarFallback>
                    <User className="w-6 h-6 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <h2 className="text-lg font-semibold truncate" data-testid="text-display-name">
                    {user.displayName || "Anonymous"}
                  </h2>
                  {user.nip05 && (
                    <p className="text-sm text-muted-foreground truncate" data-testid="text-nip05">
                      {user.nip05}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1">
                    <code className="text-xs text-muted-foreground font-mono" data-testid="text-npub">
                      {truncatedNpub}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopyNpub}
                      data-testid="button-copy-npub"
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-chart-3" />
                      ) : (
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {user.about && (
                    <p className="text-sm text-muted-foreground mt-1" data-testid="text-about">
                      {user.about}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <h1 className="text-xl font-semibold" data-testid="text-dashboard-title">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your Brainstorm workspace
            </p>
          </div>

          <Card data-testid="card-network">
            <CardHeader className="flex flex-row flex-wrap items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Network</CardTitle>
            </CardHeader>
            <CardContent>
              {selfQuery.isLoading ? (
                <div className="flex items-center gap-2" data-testid="network-loading">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading network data...</p>
                </div>
              ) : network ? (
                <div className="flex flex-col gap-4" data-testid="network-data">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid="network-followers">{network.followed_by?.length ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Followers</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid="network-following">{network.following?.length ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Following</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <VolumeX className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid="network-muted-by">{network.muted_by?.length ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Muted By</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserMinus className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid="network-muting">{network.muting?.length ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Muting</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid="network-reported-by">{network.reported_by?.length ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Reported By</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid="network-reporting">{network.reporting?.length ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Reporting</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-lg font-semibold" data-testid="network-influence">{network.influence ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Influence</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="network-empty">
                  No network data available yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-graperank">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">GrapeRank</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => triggerGrapeRankMutation.mutate()}
                disabled={triggerGrapeRankMutation.isPending}
                data-testid="button-trigger-graperank"
              >
                {triggerGrapeRankMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                {triggerGrapeRankMutation.isPending ? "Calculating..." : "Calculate"}
              </Button>
            </CardHeader>
            <CardContent>
              {triggerGrapeRankMutation.isSuccess && (
                <p className="text-sm text-chart-3 mb-3" data-testid="graperank-triggered">
                  GrapeRank calculation triggered successfully. Results may take a moment to appear.
                </p>
              )}
              {triggerGrapeRankMutation.isError && (
                <p className="text-sm text-destructive mb-3" data-testid="graperank-trigger-error">
                  Failed to trigger GrapeRank calculation. Please try again.
                </p>
              )}
              {grapeRankQuery.isLoading ? (
                <div className="flex items-center gap-2" data-testid="graperank-loading">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading GrapeRank data...</p>
                </div>
              ) : grapeRankQuery.isError ? (
                <p className="text-sm text-muted-foreground" data-testid="graperank-error">
                  Could not load GrapeRank data.
                </p>
              ) : grapeRank ? (
                <div className="flex flex-col gap-3" data-testid="graperank-data">
                  <div className="grid grid-cols-2 gap-4">
                    {grapeRank.status && (
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <p className="text-sm font-medium" data-testid="graperank-status">{grapeRank.status}</p>
                      </div>
                    )}
                    {grapeRank.algorithm && (
                      <div>
                        <p className="text-xs text-muted-foreground">Algorithm</p>
                        <p className="text-sm font-medium" data-testid="graperank-algorithm">{grapeRank.algorithm}</p>
                      </div>
                    )}
                  </div>
                  {grapeRank.result && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Result</p>
                      <pre
                        className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48"
                        data-testid="graperank-result"
                      >
                        {typeof grapeRank.result === "string" ? grapeRank.result : JSON.stringify(grapeRank.result, null, 2)}
                      </pre>
                    </div>
                  )}
                  {grapeRank.parameters && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Parameters</p>
                      <pre
                        className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-32"
                        data-testid="graperank-parameters"
                      >
                        {typeof grapeRank.parameters === "string" ? grapeRank.parameters : JSON.stringify(grapeRank.parameters, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="graperank-empty">
                  No GrapeRank calculation results yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2">
              <CardTitle className="text-base">User Data</CardTitle>
            </CardHeader>
            <CardContent>
              {user.userData ? (
                <pre
                  className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-96"
                  data-testid="text-user-data"
                >
                  {JSON.stringify(user.userData, null, 2)}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="text-auth-status">
                  Signed in via Nostr. Backend user data is not yet available.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
