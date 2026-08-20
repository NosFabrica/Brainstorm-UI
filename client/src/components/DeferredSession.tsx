/**
 * The two faces of a deferred Session: the card says why at load, the notice
 * says it where the data would have been. Both end in `resumeSession` — the
 * unlock the user has now opted into. Cards, not a modal: they chose nothing
 * here, and reading on without a Session is a fair choice.
 */
import { KeyRound, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDeferredSession } from "@/hooks/useDeferredSession";
import { useResumeSession } from "@/hooks/useResumeSession";
import { cn } from "@/lib/utils";

/** Shared by both surfaces — the unlock is the point, not the copy around it. */
function UnlockButton({ className }: { className?: string }) {
  const { resume, busy } = useResumeSession();
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => void resume()}
      disabled={busy}
      className={className}
      data-testid="button-unlock-session"
    >
      <KeyRound /> Unlock
    </Button>
  );
}

/**
 * At load: one offer to unlock, for the whole page. Dismissal belongs to the
 * card strip, which hands what's left to the next nudge in line.
 */
export function DeferredSessionCard({ onDismiss }: { onDismiss: () => void }) {
  const account = useDeferredSession();

  if (!account) return null;

  return (
    <Card
      className="w-full max-w-3xl mx-auto mt-4 flex items-center gap-3 px-4 py-3"
      data-testid="card-unlock-session"
    >
      <span className="h-9 w-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center text-brand-deep shrink-0">
        <KeyRound className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Your account is locked</p>
        <p className="text-[13px] text-muted-foreground leading-snug">
          Unlock it to load your own data and publish again. Reading works without it.
        </p>
      </div>
      <UnlockButton className="shrink-0" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground"
        data-testid="button-unlock-session-dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </Card>
  );
}

/**
 * Where authenticated data would have been — one state for every page, instead
 * of each one's generic "couldn't load". Gates itself, so a page drops it in and
 * never asks the question, and it sits *above* the page rather than replacing
 * it: cached views still read and public data still loads, so a wall would take
 * away more than it explains.
 */
export function DeferredSessionNotice({ className }: { className?: string }) {
  const account = useDeferredSession();
  if (!account) return null;

  return (
    <Alert variant="info" className={cn("flex flex-wrap items-center gap-3", className)} data-testid="notice-unlock-session">
      <div className="min-w-0 flex-1">
        <AlertTitle>Sign in again to see this</AlertTitle>
        <AlertDescription>
          Your session ended while your account was locked. Unlock it to see your own data again.
        </AlertDescription>
      </div>
      <UnlockButton className="shrink-0" />
    </Alert>
  );
}
