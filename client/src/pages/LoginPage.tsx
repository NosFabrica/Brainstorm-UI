import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  Loader2,
  ChevronDown,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import { handleLogin, LoginError, type LoginErrorCode, getCurrentUser, hasPersistentKey } from "@/services/nostr";
import { LoginFailureModal } from "@/components/LoginFailureModal";
import { CreateAccountModal } from "@/components/CreateAccountModal";
import { decodeShareId } from "@/lib/shareId";
import { BrainLogo } from "@/components/BrainLogo";
import heroImage1 from "@/assets/login-hero/hero-1.webp";
import heroImage2 from "@/assets/login-hero/hero-2.webp";
import heroImage3 from "@/assets/login-hero/hero-3.webp";

const HERO_IMAGES: string[] = [heroImage1, heroImage2, heroImage3];

function getNextPath(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//") && next !== "/login")
      return next;
  } catch {}
  return "/";
}

// The inviter's hex pubkey when arriving via someone's invite link
// (?invite=npub… or a pending invite stored when viewing their share page). New
// accounts created here auto-follow them so they start connected.
function getInviterPubkey(): string | undefined {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("invite") || sessionStorage.getItem("brainstorm_pending_invite") || "";
    if (!raw) return undefined;
    return decodeShareId(raw)?.pubkey;
  } catch {
    return undefined;
  }
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureOpen, setFailureOpen] = useState(false);
  const [failureCode, setFailureCode] = useState<LoginErrorCode | null>(null);
  const [failureMessage, setFailureMessage] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);

  const nextPath = getNextPath();
  const inviterPubkey = getInviterPubkey();

  useEffect(() => {
    if (getCurrentUser()) {
      navigate(nextPath, { replace: true });
    }
  }, [navigate, nextPath]);

  useEffect(() => {
    if (HERO_IMAGES.length <= 1) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return;

    // The hero panel is only rendered on lg+ (hidden on mobile), so skip
    // preloading images and running the rotation interval on small screens.
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) return;

    HERO_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    const interval = setInterval(() => {
      setHeroIndex((i) => (i + 1) % HERO_IMAGES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  // Existing external accounts (extension/nsec) reaching Brainstorm for the first
  // time and never scored → the one-time "Calculate your Web of Trust" step.
  // Brand-new in-app accounts go through CreateAccountModal → /welcome instead.
  const routeAfterLogin = () => {
    try {
      const pk = getCurrentUser()?.pubkey || "";
      const explicitNext = new URLSearchParams(window.location.search).get("next");
      // Per-pubkey only — NOT the global `brainstorm_calc_completed`, which would
      // leak one account's state onto the next user on the same browser. The
      // /activate page itself redirects already-scored accounts (via hasMywot).
      const seen = pk ? localStorage.getItem(`brainstorm_activate_seen:${pk}`) === "true" : true;
      if (pk && !hasPersistentKey() && !explicitNext && !seen) {
        navigate("/activate", { replace: true });
        return;
      }
    } catch { /* fall through */ }
    navigate(nextPath, { replace: true });
  };

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await handleLogin();
      routeAfterLogin();
    } catch (err) {
      if (err instanceof LoginError) {
        setFailureCode(err.code);
        setFailureMessage(err.message);
        setFailureOpen(true);
      } else {
        setError(err instanceof Error ? err.message : "Couldn't complete sign-in. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const openNsec = () => {
    setFailureCode("NO_EXTENSION");
    setFailureMessage("Paste your key to sign in.");
    setFailureOpen(true);
  };

  const handleNsecLoginSuccess = () => {
    setFailureOpen(false);
    routeAfterLogin();
  };

  const handleRetryExtension = () => {
    setFailureOpen(false);
    setTimeout(() => onLogin(), 100);
  };

  return (
    <div className="flex min-h-screen w-full bg-[#F8FAFC] text-slate-900 font-sans lg:overflow-hidden" data-testid="page-login">
      {/* Left column — editorial value panel */}
      <div className="hidden lg:flex w-[45%] flex-col relative bg-indigo-900 text-white overflow-hidden p-12 justify-between">
        <div className="absolute inset-0 z-0" aria-hidden="true">
          {HERO_IMAGES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              draggable={false}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover mix-blend-overlay select-none transition-opacity duration-1000 ease-in-out ${
                i === heroIndex ? "opacity-40" : "opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-indigo-950 via-indigo-900/60 to-transparent" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-12" data-testid="brand-login">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
              <BrainLogo size={32} className="text-white" />
            </div>
            <span
              className="text-2xl font-bold tracking-tight text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Brainstorm
            </span>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-semibold mb-6 leading-tight text-white/90">
            Trust is earned. <br />
            <span className="text-white">Now it's visible.</span>
          </h1>
          <p className="text-lg text-indigo-200 leading-relaxed">
            Brainstorm maps the relationships that matter. See who your friends trust,
            build your reputation, and navigate your network with confidence.
          </p>
        </div>
      </div>

      {/* Right column — sign-in focus */}
      <main className="flex-1 flex flex-col px-5 py-8 sm:p-8">
        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
        <div className="w-full max-w-[420px] flex flex-col animate-fade-up">
          {/* Mobile brand header (hidden on desktop) */}
          <div className="flex lg:hidden items-center justify-center gap-2 mb-8">
            <BrainLogo size={30} className="text-indigo-600" />
            <span
              className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-800 to-indigo-500"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Brainstorm
            </span>
          </div>

          <div className="mb-10 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2.5 mb-4">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-[#7c86ff] uppercase">
                Welcome back
              </span>
              <div className="h-px w-12 bg-[#7c86ff]/40" />
            </div>
            <h2
              className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-[1.1] mb-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Sign in to your <span className="text-[#333286]">Brainstorm</span> account
            </h2>
            <p className="text-base text-slate-500 leading-relaxed">
              Pick up where you left off and keep building your web of trust.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 mb-4" data-testid="text-login-error">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={onLogin}
              disabled={loading}
              className="group w-full inline-flex items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-sm active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="button-signin-extension"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin shrink-0" />
              ) : (
                <svg
                  className="h-5 w-5 shrink-0"
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
              <span>{loading ? "Connecting…" : "Sign in with your extension"}</span>
              <ArrowRight className="h-4 w-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              type="button"
              onClick={openNsec}
              className="w-full inline-flex justify-center items-center gap-2 py-3 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors"
              data-testid="link-use-nsec"
            >
              <KeyRound className="h-4 w-4" /> Use your key?
            </button>
          </div>

          <div className="my-8 flex items-center gap-4" aria-hidden="true">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              New to Brainstorm?
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="group w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.99]"
              data-testid="link-create-identity"
            >
              Create your account
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="text-xs text-slate-500 font-medium">
              Free, takes a minute — no email required
            </p>
          </div>

          <div className="mt-8 p-5 rounded-2xl bg-slate-50 border border-slate-100 text-sm text-slate-600 text-center leading-relaxed">
            <p className="mb-2" data-testid="text-anon-note">
              <span className="font-semibold text-slate-800">Not your device?</span> Keep your identity private — you can browse Brainstorm anonymously without signing in.
            </p>
            <button
              type="button"
              onClick={() => navigate("/personalization")}
              className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors inline-flex items-center gap-1"
              data-testid="link-learn-anon"
            >
              Learn about anonymous browsing
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

        </div>
        </div>

        {/* Footer */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 text-xs font-medium text-slate-500">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:text-slate-800 transition-colors px-2 py-1 rounded-md hover:bg-slate-100"
            data-testid="button-login-language"
          >
            English (United States) <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-6">
            <button type="button" onClick={() => navigate("/faq")} className="hover:text-slate-800 transition-colors" data-testid="link-login-help">Help</button>
            <button type="button" onClick={() => navigate("/privacy")} className="hover:text-slate-800 transition-colors" data-testid="link-login-privacy">Privacy</button>
            <button type="button" onClick={() => navigate("/terms")} className="hover:text-slate-800 transition-colors" data-testid="link-login-terms">Terms</button>
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

      <CreateAccountModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        inviterPubkey={inviterPubkey}
        onCreated={() => {
          setCreateOpen(false);
          // If they came from a value gate with ?next= (e.g. a thread on /e),
          // return them straight there — the thing that made them sign up.
          // Otherwise go to the "Build your network" onboarding (/welcome).
          navigate(nextPath !== "/" ? nextPath : "/welcome", { replace: true });
        }}
      />
    </div>
  );
}
