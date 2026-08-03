import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { use$ } from "applesauce-react/hooks";
import { KeyRound, Trash2 } from "lucide-react";

import { installUnlockPrompt, unlockPrompt$ } from "@/accounts/unlock-request";
import type { UnlockFailure } from "@/accounts/local-signer";
import { logout } from "@/services/nostr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Module scope, not an effect: a Locked Account can be asked to sign before any
// effect has run, and the prompt must outlive a StrictMode remount.
installUnlockPrompt();

const FAILURE_COPY: Record<UnlockFailure, string> = {
  "wrong-password": "That's not the recovery password for this account. Try again.",
  "unusable-backup":
    "This backup needs more memory than this browser allows. Try a desktop browser, or sign in with your key.",
};

/** `npub1abcd…wxyz` — enough to tell two of your own Accounts apart. */
function shortNpub(npub: string): string {
  return npub.length > 20 ? `${npub.slice(0, 12)}…${npub.slice(-6)}` : npub;
}

/**
 * Yield long enough for the browser to paint. Two frames, because a rAF callback
 * runs *before* the paint of its own frame.
 */
function afterPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * The Unlock modal: the one place this app asks for a Recovery password.
 *
 * Mounted once, for whatever the user just did — following someone, editing a
 * profile, activating NIP-85. The copy is deliberately generic: naming the action
 * would mean threading an intent string through every signing call site, and the
 * user knows what they clicked.
 */
export function UnlockModal() {
  const prompt = use$(unlockPrompt$);
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [failure, setFailure] = useState<UnlockFailure | null>(null);
  const [pane, setPane] = useState<"password" | "forgotten" | "removing">("password");

  // A fresh request is a fresh question — including one that arrives while the
  // "forgotten it" pane is open.
  useEffect(() => {
    setPassword("");
    setUnlocking(false);
    setFailure(null);
    setPane("password");
  }, [prompt]);

  if (!prompt) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (unlocking || !password) return;

    setFailure(null);
    setUnlocking(true);
    // The disabled control and "Unlocking…" must be on screen BEFORE the key
    // derivation starts: it blocks the main thread for up to a second on a phone,
    // and repeat submissions would otherwise queue up behind the freeze.
    await afterPaint();

    // A throw here shouldn't be possible — an attempt reports its failure rather
    // than raising — but swallowing one silently would leave a dead dialog with a
    // disabled button and no way out.
    const result = await prompt.submit(password).catch(
      () => ({ ok: false, reason: "wrong-password" }) as const,
    );
    if (result.ok) return; // the action resumes and this dialog is already closing

    setUnlocking(false);
    setFailure(result.reason);
    setPassword("");
  };

  // Cancelling is a deliberate choice, so the action it interrupted is abandoned
  // quietly — no toast, no error state anywhere.
  const cancel = () => {
    if (!unlocking) prompt.cancel();
  };

  const signInWithKey = () => {
    prompt.cancel();
    navigate("/login?key=1");
  };

  const removeFromDevice = () => {
    prompt.cancel();
    logout();
    navigate("/login");
  };

  return (
    <Dialog open onOpenChange={(next) => !next && cancel()}>
      <DialogContent className="sm:max-w-[440px]" data-testid="modal-unlock">
        {pane === "password" && (
          <>
            <DialogHeader>
              <DialogTitle>Unlock your account</DialogTitle>
              <DialogDescription>
                Enter your recovery password to continue. We'll only ask once — it stays unlocked
                in this tab for the rest of your visit.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="unlock-password">Recovery password</Label>
                <Input
                  id="unlock-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={unlocking}
                  data-testid="input-unlock-password"
                />
                <p className="text-xs text-muted-foreground font-mono" data-testid="text-unlock-npub">
                  {shortNpub(prompt.npub)}
                </p>
              </div>

              {failure && (
                <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-unlock-error">
                  {FAILURE_COPY[failure]}
                </p>
              )}

              <DialogFooter className="gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancel}
                  disabled={unlocking}
                  data-testid="button-unlock-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={unlocking || !password}
                  data-testid="button-unlock-submit"
                >
                  {/* No spinner: the thread is blocked, so an animation would visibly stall. */}
                  {unlocking ? "Unlocking…" : "Unlock"}
                </Button>
              </DialogFooter>
            </form>

            <button
              type="button"
              className="text-xs text-brand-link hover:underline self-start disabled:opacity-50"
              onClick={() => setPane("forgotten")}
              disabled={unlocking}
              data-testid="button-unlock-forgotten"
            >
              Forgotten it?
            </button>
          </>
        )}

        {pane === "forgotten" && (
          <>
            <DialogHeader>
              <DialogTitle>There's no way to reset it</DialogTitle>
              <DialogDescription>
                Your recovery password is the only thing that opens the copy of your key on this
                device. Nobody can reset it — not even us. Two things still work.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={signInWithKey}
                data-testid="button-unlock-use-key"
              >
                <KeyRound /> Sign in with your key
              </Button>
              <p className="text-xs text-muted-foreground px-1">
                If you still have your key, or a backup file and its password, use it to sign in
                again.
              </p>

              <Button
                variant="ghost"
                className="w-full justify-start text-red-600 hover:text-red-700"
                onClick={() => setPane("removing")}
                data-testid="button-unlock-remove"
              >
                <Trash2 /> Remove from this device
              </Button>
              <p className="text-xs text-muted-foreground px-1">
                Forget {shortNpub(prompt.npub)} here.
              </p>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setPane("password")} data-testid="button-unlock-back">
                Back
              </Button>
            </DialogFooter>
          </>
        )}

        {pane === "removing" && (
          <>
            <DialogHeader>
              <DialogTitle>Remove this account?</DialogTitle>
              <DialogDescription>
                This deletes this browser's copy of the key. If it's your only copy, the account is
                gone for good — nobody can bring it back.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPane("forgotten")} data-testid="button-unlock-keep">
                Keep it
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={removeFromDevice}
                data-testid="button-unlock-remove-confirm"
              >
                Remove
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
