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
import { loginWithNsec, loginWithEncryptedBackup, type LoginErrorCode } from "@/services/nostr";
import { looksLikeEncryptedKey } from "@/lib/credentialManager";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LoginFailureModalProps {
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

export function LoginFailureModal({
  open,
  onOpenChange,
  errorCode,
  errorMessage,
  onLoginSuccess,
  onRetryExtension,
}: LoginFailureModalProps) {
  const [secretKey, setSecretKey] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secretKeyError, setSecretKeyError] = useState("");
  const [showSecretKeyForm, setShowSecretKeyForm] = useState(false);

  // An encrypted backup key (NIP-49) needs a password to unlock.
  const isEncryptedKey = looksLikeEncryptedKey(secretKey);
  const canSubmitKey = !!secretKey.trim() && (!isEncryptedKey || !!backupPassword);

  // Password-manager autofill often does NOT fire React's onChange, so the
  // controlled `secretKey` would stay empty and the ncryptsec branch never
  // trigger. Reconcile the DOM value into state on autofill + on mount.
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
      setShowSecretKey(false);
      setSubmitting(false);
      setSecretKeyError("");
      setShowSecretKeyForm(false);
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
      if (isEncryptedKey) {
        await loginWithEncryptedBackup(secretKey, backupPassword, { persistent: rememberMe });
      } else {
        await loginWithNsec(secretKey, { persistent: rememberMe });
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

  const handleClose = (nextOpen: boolean) => {
    if (submitting) return;
    onOpenChange(nextOpen);
  };

  const openSecretKeyForm = () => setShowSecretKeyForm(true);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[440px] max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 overflow-hidden p-0 [&>button]:text-slate-400 [&>button]:hover:text-slate-700 [&>button]:opacity-100 [&>button]:hover:bg-slate-100 [&>button]:rounded-md [&>button]:p-1 [&>button]:transition-colors"
        data-testid="dialog-login-failure"
      >
        <div className="flex flex-col max-h-[90vh]">
          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
              <DialogHeader>
                <DialogTitle
                  className="text-base sm:text-lg font-bold text-slate-900 leading-tight tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-login-failure-title"
                >
                  {showSecretKeyForm
                    ? "Sign in with your key"
                    : "Sign-in couldn't complete"}
                </DialogTitle>
                <DialogDescription
                  className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed"
                  data-testid="text-login-failure-subtitle"
                >
                  {showSecretKeyForm
                    ? "Paste your key to continue."
                    : subheadline}
                </DialogDescription>
              </DialogHeader>
            </div>

            {errorMessage && !showSecretKeyForm && !isNoExtension && (
              <div className="px-5 sm:px-6 pb-2">
                <div
                  className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700"
                  data-testid="status-login-failure-detail"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="text-xs font-medium leading-relaxed">
                    {errorMessage}
                  </span>
                </div>
              </div>
            )}

            {!showSecretKeyForm && (
              <div className="px-5 sm:px-6 pb-5 pt-2 space-y-2.5">
                {isNoExtension ? (
                  <>
                    <button
                      type="button"
                      onClick={openSecretKeyForm}
                      className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm tracking-wide shadow-sm transition-colors flex items-center justify-center gap-2"
                      data-testid="button-show-nsec-form"
                    >
                      <KeyRound className="h-4 w-4" />
                      Use your key
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onRetryExtension}
                      className="w-full h-10 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                      data-testid="button-retry-extension"
                    >
                      Try again
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onRetryExtension}
                      className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm tracking-wide shadow-sm transition-colors flex items-center justify-center gap-2"
                      data-testid="button-retry-extension"
                    >
                      Try again
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={openSecretKeyForm}
                      className="w-full h-10 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                      data-testid="button-show-nsec-form"
                    >
                      <KeyRound className="h-4 w-4 text-slate-500" />
                      Use your key instead
                    </button>
                  </>
                )}

                {isNoExtension && (
                  <TooltipProvider delayDuration={150}>
                    <p
                      className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xs text-slate-500 pt-1.5"
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
                                className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                                data-testid={`link-install-${ext.name.toLowerCase()}`}
                              >
                                {ext.name}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="center"
                              className="max-w-[260px] bg-white border border-slate-200 text-slate-700 text-xs leading-relaxed shadow-lg"
                              data-testid={`tooltip-install-${ext.name.toLowerCase()}`}
                            >
                              {ext.description}
                            </TooltipContent>
                          </Tooltip>
                          {i === 0 && (
                            <span className="text-slate-400">&nbsp;or</span>
                          )}
                        </span>
                      ))}
                    </p>
                  </TooltipProvider>
                )}
              </div>
            )}

            {showSecretKeyForm && (
              <form
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
                <div className="px-5 sm:px-6 pt-1 pb-3 space-y-3">
                  <div
                    className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600"
                    data-testid="warning-nsec-security"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    <p className="text-[11px] leading-relaxed font-medium">
                      Your key stays on your device — we never send or store it.
                    </p>
                  </div>

                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      ref={keyInputRef}
                      type={showSecretKey ? "text" : "password"}
                      name="password"
                      value={secretKey}
                      onChange={(e) => {
                        setSecretKey(e.target.value);
                        setSecretKeyError("");
                      }}
                      onAnimationStart={(e) => {
                        // Chrome fires this on :-webkit-autofill (see index.css) —
                        // the moment the password manager fills the field.
                        if (e.animationName === "onAutoFillStart") syncKeyFromDom();
                      }}
                      placeholder="Paste your recovery key or backup"
                      autoComplete="current-password"
                      spellCheck={false}
                      disabled={submitting}
                      autoFocus
                      className="w-full h-11 pl-9 pr-10 rounded-xl bg-white border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm font-mono text-slate-900 placeholder:text-slate-400 placeholder:font-sans transition-all disabled:opacity-60"
                      data-testid="input-nsec"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecretKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                      data-testid="button-toggle-nsec-visibility"
                      aria-label={showSecretKey ? "Hide key" : "Show key"}
                    >
                      {showSecretKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {isEncryptedKey && (
                    <p className="text-xs text-slate-500" data-testid="text-backup-detected">
                      Looks like a backup file — enter its password below.
                    </p>
                  )}

                  {isEncryptedKey && (
                    <div className="relative" data-testid="row-backup-password">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
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
                        className="w-full h-11 pl-9 pr-3 rounded-xl bg-white border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition-all disabled:opacity-60"
                        data-testid="input-backup-password"
                      />
                    </div>
                  )}

                  {secretKeyError && (
                    <div
                      className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700"
                      data-testid="text-nsec-error"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="text-xs font-medium leading-relaxed">
                        {secretKeyError}
                      </span>
                    </div>
                  )}
                </div>

                <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-1 space-y-2.5">
                  <label
                    className="flex items-start gap-2.5 cursor-pointer select-none px-0.5"
                    data-testid="row-remember-me"
                  >
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={submitting}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-indigo-600 cursor-pointer disabled:opacity-60"
                      data-testid="checkbox-remember-me"
                    />
                    <span className="text-xs text-slate-600 leading-relaxed">
                      <span className="font-semibold text-slate-700">Remember me on this device</span>
                      <br />
                      Stay signed in on this browser. Your key is stored only here — never sent to us.
                    </span>
                  </label>
                  <p
                    className="text-[11px] text-slate-400 leading-relaxed text-center px-1"
                    data-testid="text-nsec-session-note"
                  >
                    {rememberMe
                      ? "You'll stay signed in on this device until you sign out."
                      : "You'll be signed out when you close this tab."}
                  </p>
                  <button
                    type="submit"
                    disabled={submitting || !canSubmitKey}
                    className="w-full h-11 sm:h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm tracking-wide shadow-sm transition-colors flex items-center justify-center gap-2"
                    data-testid="button-nsec-signin"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSecretKeyForm(false);
                      setSecretKey("");
                      setBackupPassword("");
                      setSecretKeyError("");
                    }}
                    disabled={submitting}
                    className="w-full h-9 rounded-xl text-slate-500 hover:text-indigo-600 text-xs font-semibold transition-colors disabled:opacity-50"
                    data-testid="button-back-to-options"
                  >
                    Back to sign-in options
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
