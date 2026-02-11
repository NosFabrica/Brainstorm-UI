import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, LogOut, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen w-full bg-background" data-testid="page-dashboard">
      <header className="border-b">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">Brainstorm</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-6">
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  <span>Nostr extension connection (NIP-07)</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  <span>Applesauce event signing</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
