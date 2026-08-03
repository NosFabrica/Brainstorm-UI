import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Check, AlertCircle, ArrowRight } from "lucide-react";
import { createAccount, triggerScoringAndAnchor, type NostrUser } from "@/services/nostr";
import { followPubkeys } from "@/services/socialActions";
import { afterPaint } from "@/lib/afterPaint";
import { MIN_RECOVERY_PASSWORD_LENGTH } from "@/accounts/backup";

const inputClass =
  "w-full h-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/25 outline-none transition-all disabled:opacity-60";

interface CreateAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: NostrUser) => void;
  /** Hex pubkey of the inviter (if created via an invite link) — auto-followed. */
  inviterPubkey?: string;
}

type CreateState = "idle" | "creating" | "success" | "error";

/**
 * Express account creation — one screen: display name + Recovery password →
 * "Create account". Generates a keypair client-side, encrypts it under that
 * password, logs in, and fires the background first-run setup. Visually matched
 * to LoginFailureModal (the "Sign in with your key" flow) so the sign-in and
 * sign-up surfaces read as one system. Crypto stays hidden: the user is
 * "creating an account," not "generating a key."
 *
 * The password is the account's only at-rest protection and cannot be reset, so
 * the confirm field is mandatory and there is no strength meter — a weak password
 * is cheap here (there is no server to attack), a typo is unrecoverable.
 *
 * The password copy is provisional and deliberately minimal. It must not claim
 * the key never leaves this device: the encrypted key is *built* to travel — it
 * is the Backup. What never leaves is the plaintext key and the password itself,
 * which is why nobody can reset one.
 */
export function CreateAccountModal({ open, onOpenChange, onCreated, inviterPubkey }: CreateAccountModalProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<CreateState>("idle");
  const [error, setError] = useState("");
  const [createdUser, setCreatedUser] = useState<NostrUser | null>(null);

  const busy = state === "creating";
  const trimmed = name.trim();
  const mismatch = confirm.length > 0 && password !== confirm;
  const passwordReady = password.length >= MIN_RECOVERY_PASSWORD_LENGTH && password === confirm;
  const canSubmit = trimmed.length >= 1 && trimmed.length <= 50 && passwordReady && !busy;

  const handleClose = (nextOpen: boolean) => {
    if (busy) return; // never close mid-creation
    if (!nextOpen) {
      setState("idle");
      setError("");
      setName("");
      setPassword("");
      setConfirm("");
      setCreatedUser(null);
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
      const user = await createAccount(trimmed, { inviterPubkey, password });
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
      setTimeout(() => onCreated(user), 1600);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[440px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/5 overflow-hidden p-0 [&>button]:text-slate-400 dark:[&>button]:text-slate-500 [&>button]:hover:text-slate-700 dark:[&>button]:hover:text-slate-200 [&>button]:opacity-100 [&>button]:hover:bg-slate-100 dark:[&>button]:hover:bg-slate-800 [&>button]:rounded-md [&>button]:p-1 [&>button]:transition-colors"
        data-testid="modal-create-account"
      >
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
          <DialogHeader>
            <DialogTitle
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-create-title"
            >
              {state === "success" ? "You're all set!" : "Let's set up your account"}
            </DialogTitle>
            <DialogDescription
              className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed"
              data-testid="text-create-subtitle"
            >
              {state === "success"
                ? "Your account is ready — we're setting up your trust network in the background."
                : "Pick a name to get started. No email required."}
            </DialogDescription>
          </DialogHeader>
        </div>

        {state === "success" ? (
          <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-2" data-testid="status-create-success">
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 mb-4">
              <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <Check className="h-5 w-5 text-white" />
              </div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                Welcome to Brainstorm{trimmed ? `, ${trimmed}` : ""}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => createdUser && onCreated(createdUser)}
              className="w-full h-11 sm:h-12 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold text-sm tracking-wide shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2"
              data-testid="button-create-get-started"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          // `username` on the name field is what pairs the password with an entry
          // outside Chromium, where form markup is the only capture there is.
          <form onSubmit={handleSubmit} className="px-5 sm:px-6 pb-5 sm:pb-6 pt-2">
            <label
              htmlFor="create-display-name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5"
            >
              Display name
            </label>
            <input
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
              className={inputClass}
              data-testid="input-create-display-name"
            />
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">You can change this anytime.</p>

            <label
              htmlFor="create-password"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 mt-4"
            >
              Recovery password
            </label>
            <input
              id="create-password"
              name="recovery-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className={inputClass}
              data-testid="input-create-password"
            />
            <input
              id="create-password-confirm"
              name="recovery-password-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              placeholder="Confirm password"
              aria-label="Confirm recovery password"
              className={`${inputClass} mt-2`}
              data-testid="input-create-confirm"
            />
            {mismatch ? (
              <p
                className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400"
                data-testid="text-create-mismatch"
              >
                Passwords don't match.
              </p>
            ) : (
              <p
                className="mt-1.5 text-xs text-slate-400 dark:text-slate-500"
                data-testid="text-create-password-hint"
              >
                Unlocks your key. There's no reset — save it in your password manager.
              </p>
            )}

            {state === "error" && (
              <div
                className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 text-red-700 dark:text-red-300"
                data-testid="status-create-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-5 w-full h-11 sm:h-12 rounded-xl bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm tracking-wide shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2"
              data-testid="button-create-submit"
            >
              {busy ? (
                // No spinner: encrypting the key blocks the thread, so an
                // animation would visibly stall — as UnlockModal's doesn't.
                <>Setting up your account…</>
              ) : (
                <>
                  Create account <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
              Free · no email · takes a minute
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
