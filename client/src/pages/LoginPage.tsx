import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap, Loader2, AlertCircle } from "lucide-react";
import { handleLogin } from "@/services/nostr";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await handleLogin();
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Nostr.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background" data-testid="page-login">
      <div className="w-full max-w-sm mx-4">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Brainstorm</h1>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Decentralized collaboration powered by Nostr
          </p>

          <Card className="w-full">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col gap-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3" data-testid="text-login-error">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}
                <Button
                  size="lg"
                  className="w-full"
                  onClick={onLogin}
                  disabled={loading}
                  data-testid="button-sign-in"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  {loading ? "Connecting..." : "Sign in with Nostr"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Uses your Nostr extension (NIP-07) to sign in
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
