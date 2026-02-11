import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Zap } from "lucide-react";

export default function LoginPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background" data-testid="page-login">
      <div className="w-full max-w-sm mx-4">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
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
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => navigate("/dashboard")}
                  data-testid="button-sign-in"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Sign in with Nostr
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
