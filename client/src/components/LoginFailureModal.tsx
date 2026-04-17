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
    description: "A popular Bitcoin & Nostr browser extension. It manages your Nostr identity and signs sign-in requests on your behalf.",
  },
  {
    name: "nos2x",
    url: "https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp",
    description: "A lightweight Chrome extension that signs Nostr events for you so you never have to paste your private key.",
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
  const isServerError = errorCode === "SERVER_ERROR";

  const subheadline = isNoExtension
    ? "We couldn't find a Nostr signing extension in your browser. Install one and try again, or use a private key to continue."
    : isServerError
    ? "We couldn't reach the sign-in server. Check your connection and try again, or use a private key to continue."
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
        className="sm:max-w-[480px] max-h-[90vh] rounded-3xl border border-slate-700/50 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-indigo-500/20 ring-1 ring-indigo-500/10 overflow-hidden p-0 [&>button]:text-slate-300 [&>button]:hover:text-white [&>button]:opacity-100 [&>button]:hover:bg-slate-700/50 [&>button]:rounded-md [&>button]:p-1 [&>button]:transition-colors"
        data-testid="dialog-login-failure"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-[90px]" />
          <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-violet-500/10 blur-[110px]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(99,102,241,0.10)_0%,rgba(15,23,42,0.00)_45%,rgba(124,58,237,0.10)_100%)]" />
        </div>

        <div className="relative flex flex-col max-h-[90vh]">
          <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 animate-gradient-x shrink-0" />

          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div
                    className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl bg-slate-800/70 border border-slate-700/60 shadow-sm flex items-center justify-center text-indigo-300 shrink-0"
                    data-testid="icon-login-failure"
                  >
                    <BrainLogo size={18} className="sm:hidden" />
                    <BrainLogo size={22} className="hidden sm:block" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle
                      className="text-base sm:text-lg font-bold text-white leading-tight tracking-tight"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      data-testid="text-login-failure-title"
                    >
                      {showNsecForm ? "Sign in with your private key" : "Sign-in couldn't complete"}
                    </DialogTitle>
                    <DialogDescription
                      className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed"
                      data-testid="text-login-failure-subtitle"
                    >
                      {showNsecForm
                        ? "Paste your nsec below to continue."
                        : subheadline}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>

            {errorMessage && !showNsecForm && (
              <div className="px-4 sm:px-6 pb-2">
                <div
                  className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200"
                  data-testid="status-login-failure-detail"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="text-xs font-medium leading-relaxed">{errorMessage}</span>
                </div>
              </div>
            )}

            {isNoExtension && !showNsecForm && (
              <div className="px-4 sm:px-6 pb-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 px-1">
                  Install an extension
                </p>
                <TooltipProvider delayDuration={150}>
                  <div className="space-y-2">
                    {EXTENSIONS.map((ext) => (
                      <Tooltip key={ext.name}>
                        <TooltipTrigger asChild>
                          <a
                            href={ext.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-600/60 text-white hover:bg-slate-200 hover:border-slate-300 hover:text-indigo-900 transition-colors"
                            data-testid={`link-install-${ext.name.toLowerCase()}`}
                          >
                            <span className="h-8 w-8 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-200 shrink-0 group-hover:bg-indigo-100 group-hover:border-indigo-300 group-hover:text-indigo-700 transition-colors">
                              <KeyRound className="h-4 w-4" />
                            </span>
                            <span className="flex-1 text-sm font-semibold">{ext.name}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-indigo-700 transition-colors" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          align="center"
                          className="max-w-[280px] bg-slate-950 border border-slate-700 text-slate-200 text-xs leading-relaxed"
                          data-testid={`tooltip-install-${ext.name.toLowerCase()}`}
                        >
                          {ext.description}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </div>
            )}

            {!showNsecForm && (
              <div className="px-4 sm:px-6 pb-4 space-y-2">
                <button
                  type="button"
                  onClick={onRetryExtension}
                  className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-100 hover:text-indigo-900 text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-indigo-500/20 transition-all duration-300 flex items-center justify-center gap-2"
                  data-testid="button-retry-extension"
                >
                  Try again
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowNsecForm(true)}
                  className="group w-full h-10 rounded-xl bg-indigo-500/10 hover:bg-slate-200 border border-indigo-400/40 hover:border-slate-300 text-indigo-100 hover:text-indigo-900 font-semibold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2"
                  data-testid="button-show-nsec-form"
                >
                  <KeyRound className="h-4 w-4 text-indigo-200 group-hover:text-indigo-700" />
                  Use a private key (nsec) instead
                </button>
              </div>
            )}

            {showNsecForm && (
              <>
                <div className="px-4 sm:px-6 pt-1 pb-3 space-y-3">
                  <div
                    className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200"
                    data-testid="warning-nsec-security"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed font-medium">
                      Your nsec is your private key — only paste it on sites you trust.
                    </p>
                  </div>

                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
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
                      className="w-full h-11 pl-9 pr-10 rounded-xl bg-slate-800/60 border border-slate-700/60 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm font-mono text-white placeholder:text-slate-500 transition-all disabled:opacity-60"
                      data-testid="input-nsec"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNsec((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60 transition-colors"
                      data-testid="button-toggle-nsec-visibility"
                      aria-label={showNsec ? "Hide nsec" : "Show nsec"}
                    >
                      {showNsec ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {nsecError && (
                    <div
                      className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200"
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
                    className="w-full h-11 sm:h-12 rounded-xl bg-indigo-600 hover:bg-indigo-100 hover:text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-indigo-500/20 transition-all duration-300 flex items-center justify-center gap-2"
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
                    className="w-full h-9 rounded-xl text-slate-400 hover:text-indigo-300 text-xs font-semibold transition-colors disabled:opacity-50"
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
