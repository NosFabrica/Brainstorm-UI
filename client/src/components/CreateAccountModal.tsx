import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, AlertCircle, ArrowRight } from "lucide-react";
import { createAccount, type NostrUser } from "@/accounts/login-flow";
import { isPasskeyCancelled, PasskeyPrfUnsupportedError } from "@/accounts/passkey";
import { PasskeyIcon } from "@/components/PasskeyIcon";
import { usePasskeySupport } from "@/hooks/usePasskeySupport";
import { triggerScoringAndAnchor } from "@/services/trustAnchor";
import { followPubkeys } from "@/services/socialActions";
import { afterPaint } from "@/lib/afterPaint";
import { MIN_RECOVERY_PASSWORD_LENGTH } from "@/accounts/backup";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tone } from "@/lib/tones";

interface CreateAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: NostrUser) => void;
  /** Hex pubkey of the inviter (if created via an invite link) — auto-followed. */
  inviterPubkey?: string;
}

type CreateState = "idle" | "creating" | "success" | "error";

/** How the new key is locked: a passkey where the browser can make one, else a Recovery password. */
type LockChoice = "passkey" | "password";

/**
 * Express account creation — display name + Recovery password → an encrypted
 * keypair, logged in, first-run setup fired. Crypto stays hidden: the user is
 * "creating an account," not "generating a key."
 *
 * The password is the account's only at-rest protection and cannot be reset, so
 * confirm is mandatory and there is no strength meter — weakness is cheap here
 * (no server to attack), a typo is unrecoverable. The copy must never claim the
 * key stays on this device: the encrypted key is *built* to travel, it is the
 * Backup. What never leaves is the plaintext key and the password.
 *
 * Where the browser can make a passkey, that leads instead: a name and one Face
 * ID prompt, no password up front (ADR 0009). The Backup is then the backup
 * reminder's ask — a passkey opens the key, it is not a copy of it.
 */
export function CreateAccountModal({ open, onOpenChange, onCreated, inviterPubkey }: CreateAccountModalProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<CreateState>("idle");
  const [error, setError] = useState("");
  const [createdUser, setCreatedUser] = useState<NostrUser | null>(null);
  const { support, method } = usePasskeySupport();
  const [picked, setPicked] = useState<LockChoice | null>(null);
  // The password form until the probe says otherwise: it works everywhere.
  const lock: LockChoice = picked ?? (support?.supported ? "passkey" : "password");
  const [createdWith, setCreatedWith] = useState<LockChoice>("password");

  const busy = state === "creating";
  const trimmed = name.trim();
  const nameReady = trimmed.length >= 1 && trimmed.length <= 50;
  const mismatch = confirm.length > 0 && password !== confirm;
  const passwordReady = password.length >= MIN_RECOVERY_PASSWORD_LENGTH && password === confirm;
  const canSubmit = nameReady && (lock === "passkey" || passwordReady) && !busy;

  const handleClose = (nextOpen: boolean) => {
    if (busy) return; // never close mid-creation
    if (!nextOpen) {
      setState("idle");
      setError("");
      setName("");
      setPassword("");
      setConfirm("");
      setCreatedUser(null);
      setPicked(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setState("creating");
    setError("");
    // Encrypting the new key blocks the main thread for up to a second on a
    // phone, so "Setting up your account…" has to be on screen before it starts.
    await afterPaint();
    try {
      const user = await createAccount(
        trimmed,
        lock === "passkey" ? { inviterPubkey, passkey: true } : { inviterPubkey, password },
      );
      setCreatedWith(lock);
      // The one follow the user explicitly opted into by using an invite link.
      // Published here (not just preselected in onboarding) so the invite promise
      // — "join and you're connected to them" — always holds, even if the invitee
      // skips onboarding or is routed straight to the inviter's profile. Safe: a
      // brand-new account has no follow list to wipe. Fire-and-forget so signup
      // stays instant; the onboarding preselect remains as a backstop.
      if (inviterPubkey) {
        void (async () => {
          try {
            await followPubkeys([inviterPubkey]);
            triggerScoringAndAnchor(user.pubkey); // give the invitee a starter Web of Trust
          } catch {
            /* non-fatal — onboarding's preselected inviter follow is the backstop */
          }
        })();
      }
      setCreatedUser(user);
      setState("success");
      // Never a dead end: auto-advance if the user doesn't tap "Get started".
      // Longer when there is a passkey to explain: the card is how they learn to sign in elsewhere.
      setTimeout(() => onCreated(user), lock === "passkey" ? 4000 : 1600);
    } catch (err) {
      // Closing the passkey sheet creates nothing — back to where they were.
      if (isPasskeyCancelled(err)) {
        setState("idle");
        return;
      }
      setState("error");
      if (err instanceof PasskeyPrfUnsupportedError) {
        setPicked("password");
        setError(
          "Your password manager made a passkey but can't lock a key with it. Use a recovery password instead" +
            (err.orphan ? " — you can delete the new brainstorm passkey from your password manager." : "."),
        );
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px]" data-testid="modal-create-account">
        <DialogHeader>
          <DialogTitle data-testid="text-create-title">
            {state === "success" ? "You're all set!" : "Let's set up your account"}
          </DialogTitle>
          <DialogDescription data-testid="text-create-subtitle">
            {state === "success"
              ? "Your account is ready — we're setting up your trust network in the background."
              : "Pick a name to get started. No email required."}
          </DialogDescription>
        </DialogHeader>

        {state === "success" ? (
          <div className="space-y-4" data-testid="status-create-success">
            <Alert variant="success">
              <Check className="h-4 w-4" />
              <AlertDescription className="font-semibold">
                Welcome to Brainstorm{trimmed ? `, ${trimmed}` : ""}.
              </AlertDescription>
            </Alert>
            {createdWith === "passkey" && (
              <div className="flex items-start gap-3 rounded-xl border p-3.5" data-testid="text-create-passkey-done">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone("violet").bg} ${tone("violet").icon}`}
                >
                  <PasskeyIcon className="h-5 w-5" />
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">Protected with {method.withPhrase}</p>
                  <p className="text-[13px] leading-snug text-muted-foreground">
                    On your other devices, tap “Sign in with {method.withPhrase}”. It works wherever your passkeys sync.
                  </p>
                </div>
              </div>
            )}
            <Button
              type="button"
              onClick={() => createdUser && onCreated(createdUser)}
              className="w-full"
              data-testid="button-create-get-started"
            >
              Get started <ArrowRight />
            </Button>
          </div>
        ) : (
          // `username` on the name field is what pairs the password with an entry
          // outside Chromium, where form markup is the only capture there is.
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-display-name">Display name</Label>
              <Input
                id="create-display-name"
                name="display-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                autoFocus
                disabled={busy}
                autoComplete="username"
                placeholder="e.g. Alex Mercer"
                className="h-11"
                data-testid="input-create-display-name"
              />
              <p className="text-xs text-muted-foreground">You can change this anytime.</p>
            </div>

            {lock === "passkey" ? (
              <div className="space-y-3">
                <Button
                  type="submit"
                  variant="neutral"
                  size="lg"
                  disabled={!canSubmit}
                  className="w-full"
                  data-testid="button-create-passkey"
                >
                  <PasskeyIcon />
                  {busy ? `Waiting for ${method.label}…` : `Create with ${method.withPhrase}`}
                </Button>
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  {method.label === "Passkey" ? "Your passkey" : method.label} locks your key. Nothing to remember, and
                  it signs you in wherever your passkeys sync.
                </p>
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setState("idle");
                    setPicked("password");
                  }}
                  data-testid="button-create-use-password"
                >
                  Use a recovery password instead
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="create-password">Recovery password</Label>
                <Input
                  id="create-password"
                  name="recovery-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="h-11"
                  data-testid="input-create-password"
                />
                <Input
                  id="create-password-confirm"
                  name="recovery-password-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  aria-label="Confirm recovery password"
                  className="h-11"
                  data-testid="input-create-confirm"
                />
                {mismatch ? (
                  <p className={`text-xs font-medium ${tone("danger").text}`} data-testid="text-create-mismatch">
                    Passwords don't match.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground" data-testid="text-create-password-hint">
                    Unlocks your key. There's no reset — save it in your password manager.
                  </p>
                )}
              </div>
            )}

            {state === "error" && (
              <Alert variant="destructive" data-testid="status-create-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              {lock === "password" && (
                <Button type="submit" disabled={!canSubmit} className="w-full" data-testid="button-create-submit">
                  {busy ? (
                    // No spinner: encrypting the key blocks the thread, so an
                    // animation would visibly stall — as UnlockModal's doesn't.
                    <>Setting up your account…</>
                  ) : (
                    <>
                      Create account <ArrowRight />
                    </>
                  )}
                </Button>
              )}
              <p className="text-center text-[11px] text-muted-foreground">Free · no email · takes a minute</p>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
