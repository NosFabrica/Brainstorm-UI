import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  Loader2,
  ChevronDown,
  KeyRound,
  ArrowRight,
  Radio,
} from "lucide-react";
import { handleLogin, LoginError, type LoginErrorCode } from "@/accounts/login-flow";
import { RemoteSignerModal } from "@/components/RemoteSignerModal";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useLoginPicker } from "@/hooks/useLoginPicker";
import { LoginPicker } from "@/components/LoginPicker";
import { KeySignInModal } from "@/components/KeySignInModal";
import { CreateAccountModal } from "@/components/CreateAccountModal";
import { decodeShareId } from "@/lib/shareId";
import { Wordmark } from "@/components/Wordmark";
import { HeroSceneRotator } from "@/components/brand/HeroSceneRotator";
import { HERO_SOLO } from "@/lib/heroScenes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function getNextPath(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//") && next !== "/login")
      return next;
  } catch {}
  return "/";
}

/** `?key=1`, `?add=1` — how the rest of the app asks this page for something. */
function flagged(name: string): boolean {
  try {
    return new URLSearchParams(window.location.search).get(name) === "1";
  } catch {
    return false;
  }
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
  const [remoteOpen, setRemoteOpen] = useState(false);

  // Read once: `SUPPORTED` is settled at module load and can't change under us.

  const signedIn = useActiveAccountDisplay();
  const { identities, recheckExtension } = useLoginPicker();
  const switchHint = (() => {
    try {
      return new URLSearchParams(window.location.search).get("switch") === "1";
    } catch {
      return false;
    }
  })();
  const hasAccounts = identities.length > 0;
  const nextPath = getNextPath();
  const inviterPubkey = getInviterPubkey();

  // `?key=1` asks for the key form directly — where someone arrives from the
  // Unlock modal's "sign in with your key", the account they can't open is still
  // the active one, so the signed-in bounce below has to stand aside.
  const keyRequested = useRef(flagged("key"));

  // `?add=1` is the switcher's "add another account", where the user is signed in
  // on purpose — the bounce below would send them straight back.
  const addRequested = useRef(flagged("add"));

  // Mount-only: signing in *here* routes through the handlers below (a new
  // account goes to the wizard, not to `next`), so this must not fire the moment
  // the created account becomes active.
  const signedInOnArrival = useRef(signedIn !== null);
  useEffect(() => {
    if (keyRequested.current) {
      openNsec();
      return;
    }
    if (signedInOnArrival.current && !addRequested.current) navigate(nextPath, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, nextPath]);

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
    <div className="flex min-h-screen w-full bg-background text-foreground font-sans lg:overflow-hidden" data-testid="page-login">
      {/* Left column — editorial value panel */}
      <div className="hidden lg:flex w-[45%] flex-col relative bg-gradient-to-br from-brand-deep via-slate-950 to-slate-950 text-white overflow-hidden p-12 justify-between">
        <div className="absolute inset-0 z-0" aria-hidden="true">
          {/* The panel is always dark editorial (violet→ink), so force the DARK
              (lit-constellation) scene variant regardless of app theme. The
              gradient base shows through until the first photo decodes. */}
          <HeroSceneRotator variant="dark" scenes={HERO_SOLO} />
          {/* Ink scrim for legibility + a faint Aurora tint at the top. */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/25" />
          <div className="absolute inset-0 bg-brand-primary/10 mix-blend-overlay" />
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
              className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight leading-[1.1] mb-3"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Sign in to your <span className="text-brand-link">Brainstorm</span> account
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Pick up where you left off and keep building your network.
            </p>
          </div>

          {/* Sent here from a payment that belongs to another account on this
              device: say which account to pick before they pick one. */}
          {switchHint && (
            <Alert className="mb-4" data-testid="login-switch-hint">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Sign in with the account that made the payment — it's waiting there.</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="mb-4" data-testid="text-login-error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <LoginPicker
            identities={identities}
            onSignedIn={routeAfterLogin}
            onUseKey={openNsec}
            onRecheckExtension={recheckExtension}
          />

          {/* With accounts on the device the sign-in options stop being the way in
              and become the way to add one more. */}
          {hasAccounts && (
            <div className="my-8 flex items-center gap-4" aria-hidden="true">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Add another account
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          <div className={hasAccounts ? "space-y-3" : "mt-6 space-y-3"}>
            <Button
              onClick={onLogin}
              disabled={loading}
              variant="neutral"
              size="lg"
              className="w-full"
              data-testid="button-signin-extension"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <svg
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
              <ArrowRight />
            </Button>

            {/* One row for every remote signer — nsec.app, Amber's bunker mode,
                Keycast, anything self-hosted. Their differences are absorbed at
                transport; giving each its own row would be a lie about how many
                choices there are. */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setRemoteOpen(true)}
              className="w-full"
              data-testid="button-signin-remote"
            >
              <Radio /> Sign in with a signer app
            </Button>

            {/* No NIP-55 row. It used to sit here, as the one option for Amber's
                offline build — networking removed, so NIP-46 is impossible and the
                alternative is a raw key. It came out because it does not work:
                applesauce returns Amber's answer through the clipboard, read on the
                next `visibilitychange`, and on Android Chrome that read needed the
                browser closed and reopened to fire at all. Sign-in got a pubkey and
                then dropped back to this screen, because the login challenge is a
                second request and one lost read undoes the first.

                Same-device Amber is already served: "Sign in with a signer app"
                opens Amber over NIP-46 and works, on this phone as well as another.
                What is genuinely lost is the offline build, and the way back is
                NIP-55's callback URL — Amber redirects to it with the result, which
                needs no visibility event, no clipboard permission and no race. That
                is a signer we would have to write; applesauce's carries no
                `callbackUrl` at all. See `.scratch/applesauce-accounts/issues`.

                `AmberAccount` stays registered in `accounts/manager.ts`: rows
                created before this still deserialise, restore and sign. */}

            <Button
              type="button"
              variant="ghost"
              onClick={openNsec}
              className="w-full text-brand-link hover:text-brand-link hover:bg-brand-primary/10"
              data-testid="link-use-nsec"
            >
              {/* Don't reword: every backup file ever downloaded tells its holder
                  to look for "Use your key". See buildAccountBackupFileContent. */}
              <KeyRound /> Use your key?
            </Button>
          </div>

          <div className="my-8 flex items-center gap-4" aria-hidden="true">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              New to Brainstorm?
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setCreateOpen(true)}
              className="w-full"
              data-testid="link-create-identity"
            >
              Create your account
              <ArrowRight />
            </Button>
            <p className="text-xs text-muted-foreground font-medium">
              Free, takes a minute — no email required
            </p>
          </div>

          <Card className="mt-8 p-5 text-sm text-muted-foreground text-center leading-relaxed">
            <p className="mb-2" data-testid="text-anon-note">
              <span className="font-semibold text-foreground">Not your device?</span> Keep your identity private — you can browse Brainstorm anonymously without signing in.
            </p>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => navigate("/personalization")}
              className="h-auto p-0"
              data-testid="link-learn-anon"
            >
              Learn about anonymous browsing
              <ArrowRight />
            </Button>
          </Card>

        </div>
        </div>

        {/* Footer */}
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 text-xs font-medium text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
            data-testid="button-login-language"
          >
            English (United States) <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-6">
            <button type="button" onClick={() => navigate("/faq")} className="hover:text-foreground transition-colors" data-testid="link-login-help">Help</button>
            <button type="button" onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors" data-testid="link-login-privacy">Privacy</button>
            <button type="button" onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors" data-testid="link-login-terms">Terms</button>
          </div>
        </div>
      </main>

      <KeySignInModal
        open={failureOpen}
        onOpenChange={setFailureOpen}
        errorCode={failureCode}
        errorMessage={failureMessage}
        onLoginSuccess={handleNsecLoginSuccess}
        onRetryExtension={handleRetryExtension}
      />

      <RemoteSignerModal
        open={remoteOpen}
        onOpenChange={setRemoteOpen}
        onSignedIn={() => {
          setRemoteOpen(false);
          routeAfterLogin();
        }}
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
