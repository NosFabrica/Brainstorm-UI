import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BrainLogo } from "@/components/BrainLogo";
import {
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { loginWithNsec, type LoginErrorCode } from "@/services/nostr";

interface LoginFailureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorCode: LoginErrorCode | null;
  errorMessage: string;
  onLoginSuccess: () => void;
  onRetryExtension: () => void;
}

const EXTENSIONS = [
  { name: "nos2x", url: "https://github.com/fiatjaf/nos2x" },
  { name: "Alby", url: "https://getalby.com/" },
  { name: "Keys.Band", url: "https://keys.band/" },
];

export function LoginFailureModal({
  open,
  onOpenChange,
  errorCode,
  errorMessage,
  onLoginSuccess,
  onRetryExtension,
}: LoginFailureModalProps) {
  const [nsec, setNsec] = useState("");
  const [showNsec, setShowNsec] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nsecError, setNsecError] = useState("");
  const [showNsecForm, setShowNsecForm] = useState(false);

  useEffect(() => {
    if (!open) {
      setNsec("");
      setShowNsec(false);
      setSubmitting(false);
      setNsecError("");
      setShowNsecForm(false);
    }
  }, [open]);

  const isNoExtension = errorCode === "NO_EXTENSION";

  const subheadline = isNoExtension
    ? "We couldn't find a Nostr signing extension in your browser. Install one and try again, or use a private key to continue."
    : "We couldn't get a signature from your Nostr extension. Unlock it and try again, or use a private key to continue.";

  const handleNsecLogin = async () => {
    setNsecError("");
    setSubmitting(true);
    try {
      await loginWithNsec(nsec);
      onLoginSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed. Please check your nsec and try again.";
      setNsecError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (submitting) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[480px] max-h-[90vh] rounded-3xl border border-[#7c86ff]/20 bg-gradient-to-b from-white/92 via-white/88 to-indigo-50/60 backdrop-blur-xl shadow-[0_60px_140px_-70px_rgba(51,50,134,0.75)] overflow-hidden p-0"
        data-testid="dialog-login-failure"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
          <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/15 blur-[110px]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,134,255,0.14)_0%,rgba(255,255,255,0.00)_40%,rgba(51,50,134,0.12)_100%)]" />
        </div>

        <div className="relative flex flex-col max-h-[90vh]">
          <div className="h-1.5 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff] animate-gradient-x shrink-0" />

          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div
                    className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl bg-white/70 border border-[#7c86ff]/20 shadow-sm flex items-center justify-center text-[#333286] shrink-0"
                    data-testid="icon-login-failure"
                  >
                    <BrainLogo size={18} className="sm:hidden" />
                    <BrainLogo size={22} className="hidden sm:block" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle
                      className="text-base sm:text-lg font-bold text-slate-900 leading-tight tracking-tight"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      data-testid="text-login-failure-title"
                    >
                      Sign-in couldn't complete
                    </DialogTitle>
                    <DialogDescription
                      className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed"
                      data-testid="text-login-failure-subtitle"
                    >
                      {subheadline}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>

            {errorMessage && (
              <div className="px-4 sm:px-6 pb-2">
                <div
                  className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800"
                  data-testid="status-login-failure-detail"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="text-xs font-medium leading-relaxed">{errorMessage}</span>
                </div>
              </div>
            )}

            {isNoExtension && (
              <div className="px-4 sm:px-6 pb-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
                  Install an extension
                </p>
                <div className="space-y-2">
                  {EXTENSIONS.map((ext) => (
                    <a
                      key={ext.name}
                      href={ext.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/70 border border-[#7c86ff]/20 text-[#333286] hover:bg-white hover:border-[#7c86ff]/40 transition-colors"
                      data-testid={`link-install-${ext.name.toLowerCase()}`}
                    >
                      <span className="h-8 w-8 rounded-lg bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center text-[#333286] shrink-0">
                        <KeyRound className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm font-semibold">{ext.name}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!showNsecForm && (
              <div className="px-4 sm:px-6 pb-4 space-y-2">
                <button
                  type="button"
                  onClick={onRetryExtension}
                  className="w-full h-11 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-[#3730a3]/20 transition-all duration-200 flex items-center justify-center gap-2"
                  data-testid="button-retry-extension"
                >
                  Try again
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowNsecForm(true)}
                  className="w-full h-10 rounded-xl bg-white/70 hover:bg-white border border-[#7c86ff]/30 hover:border-[#7c86ff]/50 text-[#333286] font-semibold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2"
                  data-testid="button-show-nsec-form"
                >
                  <KeyRound className="h-4 w-4" />
                  Use a private key (nsec) instead
                </button>
              </div>
            )}

            {showNsecForm && (
              <>
                <div className="px-4 sm:px-6 pb-2">
                  <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-slate-200/70" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Sign in with nsec
                    </span>
                    <div className="flex-1 h-px bg-slate-200/70" />
                  </div>
                </div>

                <div className="px-4 sm:px-6 pb-3 space-y-3">
                  <div
                    className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800"
                    data-testid="warning-nsec-security"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed font-medium">
                      Your nsec is your private key. Only paste it on sites you trust. It stays in this tab and is cleared when you close it.
                    </p>
                  </div>

                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      type={showNsec ? "text" : "password"}
                      value={nsec}
                      onChange={(e) => {
                        setNsec(e.target.value);
                        setNsecError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !submitting && nsec.trim()) {
                          handleNsecLogin();
                        }
                      }}
                      placeholder="nsec1..."
                      autoComplete="off"
                      spellCheck={false}
                      disabled={submitting}
                      autoFocus
                      className="w-full h-11 pl-9 pr-10 rounded-xl bg-white/80 border border-slate-200 focus:border-[#7c86ff]/60 focus:ring-2 focus:ring-[#7c86ff]/20 outline-none text-sm font-mono text-slate-900 placeholder:text-slate-400 transition-all disabled:opacity-60"
                      data-testid="input-nsec"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNsec((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-[#333286] hover:bg-slate-100 transition-colors"
                      data-testid="button-toggle-nsec-visibility"
                      aria-label={showNsec ? "Hide nsec" : "Show nsec"}
                    >
                      {showNsec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {nsecError && (
                    <div
                      className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700"
                      data-testid="text-nsec-error"
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="text-xs font-medium leading-relaxed">{nsecError}</span>
                    </div>
                  )}
                </div>

                <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-1 space-y-2">
                  <p
                    className="text-[11px] text-slate-500 leading-relaxed text-center px-1"
                    data-testid="text-nsec-session-note"
                  >
                    You'll stay signed in until you close this tab or your session expires.
                  </p>
                  <button
                    type="button"
                    onClick={handleNsecLogin}
                    disabled={submitting || !nsec.trim()}
                    className="w-full h-11 sm:h-12 rounded-xl bg-[#3730a3] hover:bg-[#312e81] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-[#3730a3]/20 transition-all duration-200 flex items-center justify-center gap-2"
                    data-testid="button-nsec-signin"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign in with nsec
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNsecForm(false);
                      setNsec("");
                      setNsecError("");
                    }}
                    disabled={submitting}
                    className="w-full h-9 rounded-xl text-slate-500 hover:text-[#333286] text-xs font-semibold transition-colors disabled:opacity-50"
                    data-testid="button-back-to-options"
                  >
                    Back to sign-in options
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
