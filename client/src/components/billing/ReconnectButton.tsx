import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResumeSession } from "@/hooks/useResumeSession";

/**
 * The way out of "your account is here, its Session is not": mint the Session
 * — asking the signer, or unlocking the key, on the way through — and reload
 * what was never asked. Shared by the two plan surfaces so they offer one thing.
 */
export function ReconnectButton({ testId }: { testId: string }) {
  const { resume, busy } = useResumeSession();
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => void resume()}
      disabled={busy}
      data-testid={testId}
    >
      <RefreshCw className="h-3.5 w-3.5" /> {busy ? "Reconnecting…" : "Reconnect"}
    </Button>
  );
}
