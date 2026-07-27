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
import { CreateAccountModal } from "@/components/CreateAccountModal";
import { decodeShareId } from "@/lib/shareId";
import { Wordmark } from "@/components/Wordmark";
import { NodesOverlay } from "@/components/brand/NodesOverlay";
// Human-Signals photography (Design System v1.0) — people, with the nodes
// overlay baked in — for the login brand panel. Served from public/brand.
const HERO_IMAGES: string[] = ["/brand/hero.jpg", "/brand/hero-2.jpg", "/brand/hero-3.jpg"];
// A tiny (16px) inline thumbnail of the first hero, blurred + scaled up as a
// "blur-up" placeholder. Inlined so it paints on first frame with no network
// round-trip, filling the panel with the photo's own colors until the full
// image decodes. The opaque hero images cover it once loaded.
const HERO_BLUR =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QB0RXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAABIAAAAAQAAAEgAAAABAAKgAgAEAAAAAQAAABCgAwAEAAAAAQAAAAkAAAAA/+0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv/iAmRJQ0NfUFJPRklMRQABAQAAAlRsY21zBDAAAG1udHJSR0IgWFlaIAfqAAcAFAAKAAAACGFjc3BBUFBMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD21gABAAAAANMtbGNtcwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC2Rlc2MAAAEIAAAAPmNwcnQAAAFIAAAATHd0cHQAAAGUAAAAFGNoYWQAAAGoAAAALHJYWVoAAAHUAAAAFGJYWVoAAAHoAAAAFGdYWVoAAAH8AAAAFHJUUkMAAAIQAAAAIGdUUkMAAAIQAAAAIGJUUkMAAAIQAAAAIGNocm0AAAIwAAAAJG1sdWMAAAAAAAAAAQAAAAxlblVTAAAAIgAAABwAcwBSAEcAQgAgAEkARQBDADYAMQA5ADYANgAtADIALgAxAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABvoAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c/8AAEQgACQAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAFhYWFhYWJhYWJjYmJiY2STY2NjZJXElJSUlJXG9cXFxcXFxvb29vb29vb4aGhoaGhpycnJycr6+vr6+vr6+vr//bAEMBGx0dLSktTCkpTLd8Zny3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t//dAAQAAf/aAAwDAQACEQMRAD8Ax3nklURnhUUAAnj/APXVd7iRXZW5/HNUh1oPWgD/2Q==";

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

  // Returning users (extension/nsec) land where they intended (home, or ?next=) —
  // no forced /activate wizard. An unscored-but-following account is scored in the
  // background (the post-login auto-score effect); a no-follows user gets the
  // contextual "follow → switch on scores" nudge on the home page. Brand-new in-app
  // accounts go through CreateAccountModal → /welcome instead.
  const routeAfterLogin = () => {
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
    <div className="flex min-h-screen w-full bg-[#F8FAFC] dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans lg:overflow-hidden" data-testid="page-login">
      {/* Left column — editorial value panel */}
      <div className="hidden lg:flex w-[45%] flex-col relative bg-gradient-to-br from-brand-deep via-slate-950 to-slate-950 text-white overflow-hidden p-12 justify-between">
        <div className="absolute inset-0 z-0" aria-hidden="true">
          {/* Blur-up placeholder over the violet→ink gradient base: the panel
              shows the hero's own colours instantly (no network round-trip),
              then the full photo fades in on top and covers it. */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${HERO_BLUR}")`, filter: "blur(24px)", transform: "scale(1.1)" }}
          />
          {HERO_IMAGES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              draggable={false}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "low"}
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-1000 ease-in-out ${
                i === heroIndex ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
          {/* Ink scrim for legibility + a faint Aurora tint at the top. */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/25" />
          <div className="absolute inset-0 bg-brand-primary/10 mix-blend-overlay" />
          {/* Brand Nodes constellation (guidelines p10) — glows over the scrim,
              behind the z-10 copy. */}
          <NodesOverlay preset="login" opacity={0.6} idSuffix="login" />
        </div>

        <div className="relative z-10">
          {/* Brand panel (marketing context) → the handwritten wordmark, white
              variant for the dark photography. */}
          <div className="flex items-center gap-2" data-testid="brand-login">
            <Wordmark height={26} variant="white" />
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-semibold mb-6 leading-tight text-white/95">
            Trust is earned. <br />
            <span className="text-white">Now it's visible.</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            Brainstorm maps the relationships that matter. See who your friends trust,
            build your reputation, and navigate your network with confidence.
          </p>
        </div>
      </div>

      {/* Right column — sign-in focus */}
      <main className="flex-1 flex flex-col px-5 py-8 sm:p-8">
        <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
        <div className="w-full max-w-[420px] flex flex-col animate-fade-up">
          {/* Mobile brand header (hidden on desktop) — the handwritten wordmark
              (gradient on light, white on dark), no B mark or text lockup. */}
          <div className="flex lg:hidden items-center justify-center mb-8">
            <Wordmark height={34} className="dark:hidden" />
            <Wordmark height={34} variant="white" className="hidden dark:block" />
          </div>

          <div className="mb-10 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2.5 mb-4">
              <span className="text-[11px] font-mono font-semibold tracking-[0.25em] text-brand-accent uppercase">
                Welcome back
              </span>
              <div className="h-px w-12 bg-brand-accent/40" />
            </div>
            <h2
              className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.1] mb-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Sign in to your <span className="text-brand-link">Brainstorm</span> account
            </h2>
            <p className="text-base text-slate-500 dark:text-slate-400 leading-relaxed">
              Pick up where you left off and keep building your web of trust.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-3 mb-4" data-testid="text-login-error">
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={onLogin}
              disabled={loading}
              className="group w-full inline-flex items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-semibold text-white dark:text-slate-900 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 shadow-sm dark:shadow-lg dark:shadow-black/30 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
              className="w-full inline-flex justify-center items-center gap-2 py-3 text-sm font-semibold text-brand-primary dark:text-brand-link hover:text-brand-primary dark:hover:text-brand-link hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10 rounded-xl transition-colors"
              data-testid="link-use-nsec"
            >
              <KeyRound className="h-4 w-4" /> Use your key?
            </button>
          </div>

          <div className="my-8 flex items-center gap-4" aria-hidden="true">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              New to Brainstorm?
            </span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="group w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all active:scale-[0.99]"
              data-testid="link-create-identity"
            >
              Create your account
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Free, takes a minute — no email required
            </p>
          </div>

          <div className="mt-8 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-300 text-center leading-relaxed">
            <p className="mb-2" data-testid="text-anon-note">
              <span className="font-semibold text-slate-800 dark:text-slate-200">Not your device?</span> Keep your identity private — you can browse Brainstorm anonymously without signing in.
            </p>
            <button
              type="button"
              onClick={() => navigate("/personalization")}
              className="font-semibold text-brand-primary dark:text-brand-link hover:text-brand-primary dark:hover:text-brand-link transition-colors inline-flex items-center gap-1"
              data-testid="link-learn-anon"
            >
              Learn about anonymous browsing
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

        </div>
        </div>

        {/* Footer */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 text-xs font-medium text-slate-500 dark:text-slate-400">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-slate-200 transition-colors px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            data-testid="button-login-language"
          >
            English (United States) <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-6">
            <button type="button" onClick={() => navigate("/faq")} className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors" data-testid="link-login-help">Help</button>
            <button type="button" onClick={() => navigate("/privacy")} className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors" data-testid="link-login-privacy">Privacy</button>
            <button type="button" onClick={() => navigate("/terms")} className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors" data-testid="link-login-terms">Terms</button>
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
          // Every new account goes through the guided onboarding wizard (profile
          // photo/banner/bio → follow → backup) — including invitees, who used to
          // skip it. If they came from a value gate / invite link with ?next=, we
          // thread it so onboarding returns them there (e.g. the inviter's profile,
          // now connected) when it finishes. Onboarding is skippable.
          const dest = nextPath !== "/" ? `/setup?next=${encodeURIComponent(nextPath)}` : "/setup";
          navigate(dest, { replace: true });
        }}
      />
    </div>
  );
}
