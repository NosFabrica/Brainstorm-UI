import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  Loader2,
  ChevronDown,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import { handleLogin, LoginError, type LoginErrorCode, getCurrentUser } from "@/services/nostr";
import { LoginFailureModal } from "@/components/LoginFailureModal";
import { CleanBackground } from "@/components/CleanBackground";

const BRAIN_SVG_PATHS = [
  "M13.75 10C14.3023 10 14.75 9.55228 14.75 9C14.75 8.44772 14.3023 8 13.75 8C13.1977 8 12.75 8.44772 12.75 9C12.75 9.55228 13.1977 10 13.75 10Z",
  "M15.5 13C16.0523 13 16.5 12.5523 16.5 12C16.5 11.4477 16.0523 11 15.5 11C14.9477 11 14.5 11.4477 14.5 12C14.5 12.5523 14.9477 13 15.5 13Z",
  "M17.1504 9.75C17.5646 9.75 17.9004 9.41421 17.9004 9C17.9004 8.58579 17.5646 8.25 17.1504 8.25C16.7362 8.25 16.4004 8.58579 16.4004 9C16.4004 9.41421 16.7362 9.75 17.1504 9.75Z",
  "M17.1504 15.75C17.5646 15.75 17.9004 15.4142 17.9004 15C17.9004 14.5858 17.5646 14.25 17.1504 14.25C16.7362 14.25 16.4004 14.5858 16.4004 15C16.4004 15.4142 16.7362 15.75 17.1504 15.75Z",
  "M19.75 12.75C20.1642 12.75 20.5 12.4142 20.5 12C20.5 11.5858 20.1642 11.25 19.75 11.25C19.3358 11.25 19 11.5858 19 12C19 12.4142 19.3358 12.75 19.75 12.75Z",
  "M6.80078 9.75C7.21499 9.75 7.55078 9.41421 7.55078 9C7.55078 8.58579 7.21499 8.25 6.80078 8.25C6.38657 8.25 6.05078 8.58579 6.05078 9C6.05078 9.41421 6.38657 9.75 6.80078 9.75Z",
  "M6.80078 15.75C7.21499 15.75 7.55078 15.4142 7.55078 15C7.55078 14.5858 7.21499 14.25 6.80078 14.25C6.38657 14.25 6.05078 14.5858 6.05078 15C6.05078 15.4142 6.38657 15.75 6.80078 15.75Z",
  "M4.19922 12.75C4.61343 12.75 4.94922 12.4142 4.94922 12C4.94922 11.5858 4.61343 11.25 4.19922 11.25C3.78501 11.25 3.44922 11.5858 3.44922 12C3.44922 12.4142 3.78501 12.75 4.19922 12.75Z",
  "M15.9004 5.94922C16.3146 5.94922 16.6504 5.61343 16.6504 5.19922C16.6504 4.78501 16.3146 4.44922 15.9004 4.44922C15.4862 4.44922 15.1504 4.78501 15.1504 5.19922C15.1504 5.61343 15.4862 5.94922 15.9004 5.94922Z",
  "M8.09961 5.94922C8.51382 5.94922 8.84961 5.61343 8.84961 5.19922C8.84961 4.78501 8.51382 4.44922 8.09961 4.44922C7.6854 4.44922 7.34961 4.78501 7.34961 5.19922C7.34961 5.61343 7.6854 5.94922 8.09961 5.94922Z",
  "M12.0508 6.75C12.465 6.75 12.8008 6.41421 12.8008 6C12.8008 5.58579 12.465 5.25 12.0508 5.25C11.6366 5.25 11.3008 5.58579 11.3008 6C11.3008 6.41421 11.6366 6.75 12.0508 6.75Z",
  "M15.9004 19.75C16.3146 19.75 16.6504 19.4142 16.6504 19C16.6504 18.5858 16.3146 18.25 15.9004 18.25C15.4862 18.25 15.1504 18.5858 15.1504 19C15.1504 19.4142 15.4862 19.75 15.9004 19.75Z",
  "M12.0508 18.9492C12.465 18.9492 12.8008 18.6134 12.8008 18.1992C12.8008 17.785 12.465 17.4492 12.0508 17.4492C11.6366 17.4492 11.3008 17.785 11.3008 18.1992C11.3008 18.6134 11.6366 18.9492 12.0508 18.9492Z",
  "M8.5 13C9.05228 13 9.5 12.5523 9.5 12C9.5 11.4477 9.05228 11 8.5 11C7.94772 11 7.5 11.4477 7.5 12C7.5 12.5523 7.94772 13 8.5 13Z",
  "M10.25 16C10.8023 16 11.25 15.5523 11.25 15C11.25 14.4477 10.8023 14 10.25 14C9.69772 14 9.25 14.4477 9.25 15C9.25 15.5523 9.69772 16 10.25 16Z",
];

const OPEN_PATHS = [
  "M10.25 10C10.8 10 11.25 9.55 11.25 9C11.25 8.45 10.8 8 10.25 8",
  "M14.75 15C14.75 14.45 14.3 14 13.75 14C13.2 14 12.75 14.45 12.75 15",
  "M8.84961 19C8.84961 19.41 8.50961 19.75 8.09961 19.75C7.68961 19.75 7.34961 19.41 7.34961 19",
];

const DOT_POINTS = [
  { cx: 11.9492, cy: 2.5, sw: 2 },
  { cx: 17.4492, cy: 2.9, sw: 1.5 },
  { cx: 17.4492, cy: 21.25, sw: 1.5 },
  { cx: 19.9492, cy: 16.55, sw: 1.5 },
  { cx: 19.9492, cy: 7.05, sw: 1.5 },
  { cx: 3.94922, cy: 16.55, sw: 1.5 },
  { cx: 3.94922, cy: 7.05, sw: 1.5 },
  { cx: 6.44922, cy: 2.9, sw: 1.5 },
  { cx: 6.44922, cy: 21.25, sw: 1.5 },
  { cx: 11.9492, cy: 21.55, sw: 2 },
  { cx: 1.5, cy: 12.05, sw: 2 },
  { cx: 22.4492, cy: 12.05, sw: 2 },
];

function BrainIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-indigo-600">
      <g clipPath="url(#clip0_brain)">
        {BRAIN_SVG_PATHS.map((d, i) => (
          <path key={i} d={d} stroke="currentColor" strokeMiterlimit="10" />
        ))}
        {OPEN_PATHS.map((d, i) => (
          <path key={`o-${i}`} d={d} stroke="currentColor" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {DOT_POINTS.map((p, i) => (
          <path key={`d-${i}`} d={`M${p.cx} ${p.cy}V${p.cy}`} stroke="currentColor" strokeWidth={p.sw} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
      <defs>
        <clipPath id="clip0_brain">
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function getNextPath(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//") && next !== "/login")
      return next;
  } catch {}
  return "/dashboard";
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureOpen, setFailureOpen] = useState(false);
  const [failureCode, setFailureCode] = useState<LoginErrorCode | null>(null);
  const [failureMessage, setFailureMessage] = useState("");

  const nextPath = getNextPath();

  useEffect(() => {
    if (getCurrentUser()) {
      navigate(nextPath, { replace: true });
    }
  }, [navigate, nextPath]);

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await handleLogin();
      navigate(nextPath, { replace: true });
    } catch (err) {
      if (err instanceof LoginError) {
        setFailureCode(err.code);
        setFailureMessage(err.message);
        setFailureOpen(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to connect to Nostr.");
      }
    } finally {
      setLoading(false);
    }
  };

  const openNsec = () => {
    setFailureCode("NO_EXTENSION");
    setFailureMessage("Paste your private key (nsec) to sign in.");
    setFailureOpen(true);
  };

  const handleNsecLoginSuccess = () => {
    setFailureOpen(false);
    navigate(nextPath, { replace: true });
  };

  const handleRetryExtension = () => {
    setFailureOpen(false);
    setTimeout(() => onLogin(), 100);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col relative overflow-hidden font-sans" data-testid="page-login">
      <CleanBackground />

      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-[460px] animate-fade-up">
          <div className="relative bg-white/90 backdrop-blur-2xl border border-slate-200 rounded-3xl shadow-[0_8px_40px_-12px_rgba(79,70,229,0.18)] overflow-hidden">
            <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-300/15 rounded-full blur-[60px] pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-violet-300/15 rounded-full blur-[60px] pointer-events-none" />

            <div className="relative flex flex-col p-8 sm:p-10">
              {/* Header — identity (centered, Google-style) */}
              <div className="flex flex-col items-center text-center">
                <div className="flex items-center gap-2.5" data-testid="brand-login">
                  <BrainIcon size={44} />
                  <span
                    className="text-3xl sm:text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 via-indigo-500 to-indigo-800"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Brainstorm
                  </span>
                </div>
                <p className="text-slate-500 text-base mt-3" data-testid="text-login-subtitle">
                  Use your Nostr identity
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col mt-8">
                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 mb-4" data-testid="text-login-error">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <button
                  onClick={onLogin}
                  disabled={loading}
                  className="group w-full text-left rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300 transition-colors p-4 flex items-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
                  data-testid="button-signin-extension"
                >
                  <div className="h-10 w-10 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                    {loading ? (
                      <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                    ) : (
                      <svg
                        className="h-5 w-5 text-indigo-600"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="square"
                        aria-hidden="true"
                      >
                        <path d="M8.90002 6.74084V1.6709H21.5V20.7008H8.90002L8.91003 15.7108" />
                        <path d="M2 11.1914H14.88" />
                        <path d="M12.65 7.83105L16 11.191L12.65 14.5411" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{loading ? "Connecting…" : "Sign in with your extension"}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">Alby, Nos2x & other signers</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-indigo-400 shrink-0 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </button>

                <button
                  type="button"
                  onClick={openNsec}
                  className="self-center mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                  data-testid="link-use-nsec"
                >
                  <KeyRound className="h-3.5 w-3.5" /> Use your private key?
                </button>

                <div className="my-6 flex items-center gap-3" aria-hidden="true">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[11px] font-medium uppercase tracking-widest text-slate-400">or</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-500 leading-relaxed text-center">
                  <p data-testid="text-anon-note">
                    Not your device? Keep your identity private — you can browse Brainstorm anonymously without signing in.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/what-is-wot")}
                    className="mt-1.5 font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                    data-testid="link-learn-anon"
                  >
                    Learn about anonymous browsing
                  </button>
                </div>

                <div className="flex items-center justify-between mt-8">
                  <button
                    type="button"
                    onClick={() => window.open("https://nstart.me", "_blank", "noopener,noreferrer")}
                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                    data-testid="link-create-identity"
                  >
                    Create a Nostr identity
                  </button>
                  <button
                    onClick={onLogin}
                    disabled={loading}
                    className="inline-flex items-center justify-center px-7 py-2.5 rounded-full text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    data-testid="button-login-next"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 mt-6 text-xs text-slate-500">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 hover:text-slate-700 transition-colors"
              data-testid="button-login-language"
            >
              English (United States) <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-5">
              <button type="button" onClick={() => navigate("/faq")} className="hover:text-slate-700 transition-colors" data-testid="link-login-help">Help</button>
              <button type="button" onClick={() => navigate("/what-is-wot")} className="hover:text-slate-700 transition-colors" data-testid="link-login-privacy">Privacy</button>
              <button type="button" onClick={() => navigate("/faq")} className="hover:text-slate-700 transition-colors" data-testid="link-login-terms">Terms</button>
            </div>
          </div>
        </div>
      </main>

      <LoginFailureModal
        open={failureOpen}
        onOpenChange={setFailureOpen}
        errorCode={failureCode}
        errorMessage={failureMessage}
        onLoginSuccess={handleNsecLoginSuccess}
        onRetryExtension={handleRetryExtension}
      />
    </div>
  );
}
