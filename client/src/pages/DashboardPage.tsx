import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Zap, LogOut, Loader2, User, Copy, Check } from "lucide-react";
import { getCurrentUser, logout, type NostrUser } from "@/services/nostr";

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

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              <CardTitle className="text-base">Waiting for backend integration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This shell is ready for the backend team to integrate applesauce for Nostr
                functionality and connect to the brainstormserver API.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  <span>Nostr extension connection (NIP-07)</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  <span>Applesauce event signing</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  <span>brainstormserver API integration</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
