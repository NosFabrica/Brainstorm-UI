import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Zap, LogOut, User, Copy, Check, Loader2, TrendingUp } from "lucide-react";
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

  const grapeRankQuery = useQuery({
    queryKey: ["/api/auth/graperankResult"],
    queryFn: () => apiClient.getGrapeRankResult(),
    enabled: !!user && hasToken,
    retry: false,
  });

  const grapeRank = grapeRankQuery.data?.data || grapeRankQuery.data;

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

          <Card data-testid="card-graperank">
            <CardHeader className="flex flex-row flex-wrap items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">GrapeRank</CardTitle>
            </CardHeader>
            <CardContent>
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
