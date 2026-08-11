import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { loginWithPastedKey, type LoginErrorCode } from "@/services/nostr";
import { MIN_RECOVERY_PASSWORD_LENGTH, setRecoveryPassword } from "@/accounts/backup";
import { BACKUP_LOGN } from "@/accounts/local-signer";
import {
  backupTooExpensive,
  backupWorkFactor,
  extractKeyToken,
  UNUSABLE_BACKUP_MESSAGE,
} from "@/accounts/restore";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { isVaultSupported } from "@/lib/skVault";
import { tone } from "@/lib/tones";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KeySignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorCode: LoginErrorCode | null;
  errorMessage: string;
  onLoginSuccess: () => void;
  onRetryExtension: () => void;
}

const EXTENSIONS = [
  {
    name: "Alby",
    url: "https://getalby.com/",
    description:
      "A popular browser extension that stores your account and signs you in securely — nothing to copy or paste.",
  },
  {
    name: "nos2x",
    url: "https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp",
    description:
      "A lightweight Chrome extension that signs you in securely so you never have to paste your key.",
  },
];

/**
 * Signing in with a key: the paste box, its backup password, and the extension
 * triage that lands people here. Named for what it is — the primary way in for
 * anyone without a signer — not for the failure that used to be its only door.
 */
export function KeySignInModal({
  open,
  onOpenChange,
  errorCode,
  errorMessage,
  onLoginSuccess,
  onRetryExtension,
}: KeySignInModalProps) {
  const [secretKey, setSecretKey] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [recoveryPassword, setRecoveryPasswordInput] = useState("");
  const [recoveryConfirm, setRecoveryConfirm] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secretKeyError, setSecretKeyError] = useState("");
  const [showSecretKeyForm, setShowSecretKeyForm] = useState(false);
  /** Set once a restored Backup turns out to cost more to open than ours do. */
  const [importedCost, setImportedCost] = useState<number | null>(null);

  // People paste the whole backup file, not the key line inside it. Find the key
  // in whatever arrived; an encrypted one (NIP-49) then needs its password.
  const pastedKey = extractKeyToken(secretKey);
  const isEncryptedKey = pastedKey?.kind === "ncryptsec";
  /** Its own header says it needs more memory than a browser has — say so now. */
  const unusableBackup = isEncryptedKey && backupTooExpensive(pastedKey.token);

  // A pasted Backup already carries its own at-rest form. A plaintext key has
  // none, so on a browser with no Unlock cache "remember me" can only be honoured
  // by minting one — see ADR-0001. Without a Recovery password there, the account
  // would be dropped at the next `save()` and the promise on the checkbox is a lie.
  const vaultSupported = isVaultSupported();
  const needsRecoveryPassword = rememberMe && !vaultSupported && !isEncryptedKey;
  const recoveryMismatch = recoveryConfirm.length > 0 && recoveryPassword !== recoveryConfirm;
  const recoveryReady =
    recoveryPassword.length >= MIN_RECOVERY_PASSWORD_LENGTH && recoveryPassword === recoveryConfirm;

  const canSubmitKey =
    !!secretKey.trim() &&
    !unusableBackup &&
    (!isEncryptedKey || !!backupPassword) &&
    (!needsRecoveryPassword || recoveryReady);

  // Password-manager autofill often does NOT fire React's onChange, so the
  // controlled `secretKey` would stay empty and the ncryptsec branch never fire.
  const keyInputRef = useRef<HTMLInputElement>(null);
  const syncKeyFromDom = () => {
    const v = keyInputRef.current?.value;
    if (v != null && v !== secretKey) {
      setSecretKey(v);
      setSecretKeyError("");
    }
  };
  useEffect(() => {
    if (!showSecretKeyForm) return;
    const t = setTimeout(syncKeyFromDom, 80); // catch values prefilled before paint
    return () => clearTimeout(t);
  }, [showSecretKeyForm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) {
      setSecretKey("");
      setBackupPassword("");
      setRememberMe(true);
      setRecoveryPasswordInput("");
      setRecoveryConfirm("");
      setShowSecretKey(false);
      setSubmitting(false);
      setSecretKeyError("");
      setShowSecretKeyForm(false);
      setImportedCost(null);
    }
  }, [open]);

  const isNoExtension = errorCode === "NO_EXTENSION";
  const isServerError = errorCode === "SERVER_ERROR";

  const subheadline = isNoExtension
    ? "We couldn't find a sign-in extension in your browser. Add one and try again, or use your key to continue."
    : isServerError
    ? "We couldn't reach the sign-in server. Check your connection and try again, or use your key to continue."
    : "We couldn't complete sign-in with your browser extension. Unlock it and try again, or use your key to continue.";

  const handleSecretKeyLogin = async () => {
    setSecretKeyError("");
    setSubmitting(true);
    try {
      await loginWithPastedKey(secretKey, isEncryptedKey ? backupPassword : undefined, {
        persistent: rememberMe,
        recoveryPassword: needsRecoveryPassword ? recoveryPassword : undefined,
      });
      // A Backup heavier than ours makes every future unlock pay for it, so offer
      // — once, never silently — to re-mint it cheaper.
      const cost = isEncryptedKey ? backupWorkFactor(pastedKey!.token) : undefined;
      if (cost !== undefined && cost > BACKUP_LOGN) {
        setImportedCost(cost);
        return;
      }
      onLoginSuccess();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Sign-in failed. Check your key and try again.";
      setSecretKeyError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Same password, our work factor: which password opens what doesn't change, and
  // the file they already hold keeps working. Only the stored copy gets cheaper.
  const handleRemint = async () => {
    setSecretKeyError("");
    setSubmitting(true);
    try {
      await setRecoveryPassword(backupPassword);
      onLoginSuccess();
    } catch {
      setSecretKeyError("Couldn't re-encrypt your key. Your backup is unchanged — carry on.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (submitting) return;
    // Past the offer the sign-in has already happened. Dismissing it declines
    // the re-mint; it must not also swallow the login the app is waiting on.
    if (!nextOpen && importedCost !== null) {
      onLoginSuccess();
      return;
    }
    onOpenChange(nextOpen);
  };

  const openSecretKeyForm = () => setShowSecretKeyForm(true);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto"
        data-testid="dialog-key-signin"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-key-signin-title">
            {importedCost !== null
              ? "You're in"
              : showSecretKeyForm
              ? "Sign in with your key"
              : "Sign-in couldn't complete"}
          </DialogTitle>
          <DialogDescription data-testid="text-key-signin-subtitle">
            {importedCost !== null
              ? "Your backup was made with heavier protection than this app uses."
              : showSecretKeyForm
              ? "Paste your key to continue."
              : subheadline}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && !showSecretKeyForm && !isNoExtension && (
          <Alert variant="warning" data-testid="status-key-signin-detail">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {importedCost !== null && (
          <div className="space-y-3" data-testid="pane-work-factor">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Unlocking it takes {2 ** (importedCost - BACKUP_LOGN)}× the work Brainstorm asks
              for, every time — slow on a phone. We can re-encrypt your key here at our own
              setting, using the same password. That's less protection than whoever made this
              backup chose, so it's yours to decide; the file you already have is unchanged
              either way.
            </p>
            {secretKeyError && (
              <Alert variant="destructive" data-testid="text-remint-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{secretKeyError}</AlertDescription>
              </Alert>
            )}
            <Button
              type="button"
              onClick={() => void handleRemint()}
              disabled={submitting}
              className="w-full"
              data-testid="button-remint-backup"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Re-encrypting…
                </>
              ) : (
                <>
                  <ShieldCheck />
                  Make unlocking faster
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onLoginSuccess}
              disabled={submitting}
              className="w-full"
              data-testid="button-keep-work-factor"
            >
              Keep it as it is
              <ArrowRight />
            </Button>
          </div>
        )}

        {!showSecretKeyForm && importedCost === null && (
          <div className="space-y-3">
            {isNoExtension ? (
              <>
                <Button
                  type="button"
                  onClick={openSecretKeyForm}
                  className="w-full"
                  data-testid="button-show-nsec-form"
                >
                  <KeyRound />
                  Use your key
                  <ArrowRight />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRetryExtension}
                  className="w-full"
                  data-testid="button-retry-extension"
                >
                  Try again
                  <ArrowRight />
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={onRetryExtension}
                  className="w-full"
                  data-testid="button-retry-extension"
                >
                  Try again
                  <ArrowRight />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={openSecretKeyForm}
                  className="w-full"
                  data-testid="button-show-nsec-form"
                >
                  <KeyRound />
                  Use your key instead
                </Button>
              </>
            )}

            {isNoExtension && (
              <TooltipProvider delayDuration={150}>
                <p
                  className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground pt-1.5"
                  data-testid="text-no-extension-hint"
                >
                  <span>Need a sign-in extension?</span>
                  {EXTENSIONS.map((ext, i) => (
                    <span key={ext.name} className="inline-flex items-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={ext.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 font-semibold text-brand-link hover:underline transition-colors"
                            data-testid={`link-install-${ext.name.toLowerCase()}`}
                          >
                            {ext.name}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="center"
                          className="max-w-[260px] text-xs leading-relaxed"
                          data-testid={`tooltip-install-${ext.name.toLowerCase()}`}
                        >
                          {ext.description}
                        </TooltipContent>
                      </Tooltip>
                      {i === 0 && <span className="text-muted-foreground">&nbsp;or</span>}
                    </span>
                  ))}
                </p>
              </TooltipProvider>
            )}
          </div>
        )}

        {showSecretKeyForm && importedCost === null && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!submitting && canSubmitKey) handleSecretKeyLogin();
            }}
          >
            {/* Hidden username so the password manager can match/offer the saved
                credential (username = npub). Value is filled by the PM; we ignore it. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              data-testid="input-login-username"
            />

            <Alert variant="success" data-testid="warning-nsec-security">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Your key stays on your device — we never send or store it.
              </AlertDescription>
            </Alert>

            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={keyInputRef}
                type={showSecretKey ? "text" : "password"}
                name="password"
                value={secretKey}
                onChange={(e) => {
                  setSecretKey(e.target.value);
                  setSecretKeyError("");
                }}
                onAnimationStart={(e) => {
                  // Chrome fires this on :-webkit-autofill (see index.css).
                  if (e.animationName === "onAutoFillStart") syncKeyFromDom();
                }}
                placeholder="Paste your recovery key or backup"
                autoComplete="current-password"
                spellCheck={false}
                disabled={submitting}
                autoFocus
                className="h-11 pl-9 pr-10 font-mono placeholder:font-sans"
                data-testid="input-nsec"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowSecretKey((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
                data-testid="button-toggle-nsec-visibility"
                aria-label={showSecretKey ? "Hide key" : "Show key"}
              >
                {showSecretKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>

            {isEncryptedKey && (
              <p
                className={
                  unusableBackup
                    ? `text-xs font-medium ${tone("warning").text}`
                    : "text-xs text-muted-foreground"
                }
                data-testid={unusableBackup ? "text-backup-unusable" : "text-backup-detected"}
              >
                {unusableBackup
                  ? UNUSABLE_BACKUP_MESSAGE
                  : "Looks like a backup file — enter its password below."}
              </p>
            )}

            {isEncryptedKey && !unusableBackup && (
              <div className="relative" data-testid="row-backup-password">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="password"
                  name="backup-password"
                  value={backupPassword}
                  onChange={(e) => {
                    setBackupPassword(e.target.value);
                    setSecretKeyError("");
                  }}
                  placeholder="Backup password"
                  autoComplete="off"
                  disabled={submitting}
                  className="h-11 pl-9"
                  data-testid="input-backup-password"
                />
              </div>
            )}

            {secretKeyError && (
              <Alert variant="destructive" data-testid="text-nsec-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{secretKeyError}</AlertDescription>
              </Alert>
            )}

            <label
              htmlFor="remember-me"
              className="flex items-start gap-2.5 cursor-pointer select-none px-0.5 pt-1"
              data-testid="row-remember-me"
            >
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(next) => setRememberMe(next === true)}
                disabled={submitting}
                className="mt-0.5"
                data-testid="checkbox-remember-me"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Remember me on this device</span>
                <br />
                Stay signed in on this browser. Your key is stored only here — never sent to us.
              </span>
            </label>

            {needsRecoveryPassword && (
              <div className="space-y-1.5" data-testid="row-signin-recovery-password">
                <Input
                  type="password"
                  name="recovery-password"
                  value={recoveryPassword}
                  onChange={(e) => setRecoveryPasswordInput(e.target.value)}
                  placeholder={`Recovery password — at least ${MIN_RECOVERY_PASSWORD_LENGTH} characters`}
                  autoComplete="new-password"
                  disabled={submitting}
                  className="h-11"
                  data-testid="input-signin-recovery-password"
                />
                <Input
                  type="password"
                  name="recovery-password-confirm"
                  value={recoveryConfirm}
                  onChange={(e) => setRecoveryConfirm(e.target.value)}
                  placeholder="Confirm password"
                  aria-label="Confirm recovery password"
                  autoComplete="new-password"
                  disabled={submitting}
                  className="h-11"
                  data-testid="input-signin-recovery-confirm"
                />
                {recoveryMismatch ? (
                  <p
                    className={`text-xs font-medium ${tone("danger").text}`}
                    data-testid="text-signin-recovery-mismatch"
                  >
                    Passwords don't match.
                  </p>
                ) : (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="text-signin-recovery-hint"
                  >
                    This browser can't store a key on its own, so staying signed in needs a
                    password. There's no reset — save it in your password manager.
                  </p>
                )}
              </div>
            )}

            <p
              className="text-[11px] text-muted-foreground leading-relaxed text-center px-1"
              data-testid="text-nsec-session-note"
            >
              {!rememberMe
                ? "You'll be signed out when you close this tab."
                : needsRecoveryPassword && !recoveryReady
                ? "Set a recovery password to stay signed in, or continue for this tab only."
                : "You'll stay signed in on this device until you sign out."}
            </p>

            <Button
              type="submit"
              disabled={submitting || !canSubmitKey}
              className="w-full"
              data-testid="button-nsec-signin"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight />
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSecretKeyForm(false);
                setSecretKey("");
                setBackupPassword("");
                setSecretKeyError("");
              }}
              disabled={submitting}
              className="w-full text-muted-foreground"
              data-testid="button-back-to-options"
            >
              Back to sign-in options
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
