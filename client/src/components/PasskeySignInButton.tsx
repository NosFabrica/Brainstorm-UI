/**
 * "Sign in with Face ID" — the login page's passkey row, on a device that holds
 * the account already or on one that holds nothing yet.
 *
 * The server's challenge is fetched before the tap and kept fresh: Safari opens a
 * passkey sheet only from a user gesture, and a round-trip between the tap and
 * the sheet can spend it. Should the prefetch have failed, the tap fetches one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, KeyRound, Loader2 } from "lucide-react";

import { loginWithPasskey } from "@/accounts/login-flow";
import { isPasskeyCancelled, PasskeyMismatchError, PasskeyPrfUnsupportedError } from "@/accounts/passkey";
import { passkeyVaultApi, PasskeyNotReadyError } from "@/services/api/passkeyVault";
import { PasskeyIcon } from "@/components/PasskeyIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePasskeySupport } from "@/hooks/usePasskeySupport";
import { tone } from "@/lib/tones";

/** The server's challenges live two minutes; renewing at 90s leaves a margin for a slow tap. */
const CHALLENGE_REFRESH_MS = 90_000;

function usePrefetchedChallenge(enabled: boolean) {
  const challenge = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () =>
      passkeyVaultApi
        .passkeyVaultChallenge()
        .then((value) => {
          if (live) challenge.current = value;
        })
        .catch(() => {
          if (live) challenge.current = null;
        });
    void load();
    const timer = setInterval(load, CHALLENGE_REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled]);
  // Single use: the one handed out is gone, whatever the sheet does with it.
  return useCallback(() => {
    const value = challenge.current;
    challenge.current = null;
    return value ?? undefined;
  }, []);
}

export function PasskeySignInButton({
  primary,
  onSignedIn,
  onUseKey,
}: {
  /** The page's lead option — ink, not outline. */
  primary: boolean;
  onSignedIn: () => void;
  onUseKey: () => void;
}) {
  const { support, method } = usePasskeySupport();
  const takeChallenge = usePrefetchedChallenge(!!support?.supported);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);

  if (!support?.supported) return null;

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await loginWithPasskey(takeChallenge());
      onSignedIn();
    } catch (err) {
      // Closing the system sheet is changing your mind, not a failure.
      if (isPasskeyCancelled(err)) return;
      if (err instanceof PasskeyNotReadyError) setNotReady(true);
      else if (err instanceof PasskeyPrfUnsupportedError) {
        setError(
          "That passkey can't unlock a key. Try one saved in iCloud Keychain or Google Password Manager, or use your key.",
        );
      } else if (err instanceof PasskeyMismatchError) setError("That passkey didn't open an account. Try another.");
      else setError(err instanceof Error && err.message ? err.message : "Couldn't sign in with your passkey.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-1.5">
        <Button
          type="button"
          onClick={signIn}
          disabled={busy}
          variant={primary ? "neutral" : "outline"}
          size="lg"
          className="w-full"
          data-testid="button-signin-passkey"
        >
          {busy ? <Loader2 className="animate-spin" /> : <PasskeyIcon />}
          <span>{busy ? `Waiting for ${method.label}…` : `Sign in with ${method.withPhrase}`}</span>
        </Button>
        {error ? (
          <p className={`text-center text-xs font-medium ${tone("danger").text}`} data-testid="text-passkey-error">
            {error}
          </p>
        ) : (
          <p className="text-center text-xs text-muted-foreground">Uses a passkey you've saved for Brainstorm.</p>
        )}
      </div>

      <Dialog open={notReady} onOpenChange={setNotReady}>
        <DialogContent className="sm:max-w-[420px]" data-testid="modal-passkey-not-ready">
          <DialogHeader>
            <span className={`mb-1 flex h-10 w-10 items-center justify-center rounded-xl ${tone("warning").bg}`}>
              <AlertTriangle className={`h-5 w-5 ${tone("warning").icon}`} />
            </span>
            <DialogTitle>This passkey isn't ready for new devices</DialogTitle>
            <DialogDescription>
              Brainstorm doesn't have a copy for it yet. Open Brainstorm where you created the passkey and unlock once,
              then try again here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setNotReady(false)}>
              Try again later
            </Button>
            <Button
              type="button"
              variant="neutral"
              onClick={() => {
                setNotReady(false);
                onUseKey();
              }}
              data-testid="button-passkey-use-key"
            >
              <KeyRound /> Use your key instead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
