import { useState } from "react";
import { LogIn } from "lucide-react";
import { handleLogin, LoginError, type LoginErrorCode } from "@/services/nostr";
import { LoginFailureModal } from "@/components/LoginFailureModal";
import { USER_CHANGED_EVENT } from "@/lib/assistantStorage";

interface SignInButtonProps {
  /** Visual style. "primary" = filled indigo, "ghost" = subtle outline, "link" = inline text. */
  variant?: "primary" | "ghost" | "link";
  className?: string;
  label?: string;
  /**
   * Called after a successful sign in. If omitted, the component dispatches a
   * USER_CHANGED_EVENT so page-local headers (which read getCurrentUser) refresh
   * in place — no navigation, the visitor stays where they are.
   */
  onSuccess?: () => void;
  "data-testid"?: string;
}

const VARIANT_CLASSES: Record<NonNullable<SignInButtonProps["variant"]>, string> = {
  primary:
    "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
  ghost:
    "inline-flex items-center justify-center gap-2 px-3.5 py-1.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg transition-colors active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
  link: "inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors disabled:opacity-50 disabled:pointer-events-none",
};

export function SignInButton({
  variant = "primary",
  className = "",
  label = "Sign in",
  onSuccess,
  "data-testid": testId = "button-sign-in",
}: SignInButtonProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [failureOpen, setFailureOpen] = useState(false);
  const [failureCode, setFailureCode] = useState<LoginErrorCode | null>(null);
  const [failureMessage, setFailureMessage] = useState("");

  const notifySuccess = () => {
    if (onSuccess) {
      onSuccess();
    } else {
      try {
        window.dispatchEvent(new Event(USER_CHANGED_EVENT));
      } catch {}
    }
  };

  const onSignIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await handleLogin();
      setSigningIn(false);
      notifySuccess();
    } catch (err) {
      if (err instanceof LoginError) {
        setFailureCode(err.code);
        setFailureMessage(err.message);
      } else {
        setFailureCode("SERVER_ERROR");
        setFailureMessage(
          err instanceof Error ? err.message : "Failed to connect to Nostr.",
        );
      }
      setFailureOpen(true);
      setSigningIn(false);
    }
  };

  const handleNsecLoginSuccess = () => {
    setFailureOpen(false);
    notifySuccess();
  };

  const handleRetryExtension = () => {
    setFailureOpen(false);
    setTimeout(() => onSignIn(), 100);
  };

  return (
    <>
      <button
        type="button"
        onClick={onSignIn}
        disabled={signingIn}
        className={`${VARIANT_CLASSES[variant]} ${className}`}
        data-testid={testId}
      >
        <LogIn className="h-4 w-4" />
        <span>{signingIn ? "Signing in…" : label}</span>
      </button>

      <LoginFailureModal
        open={failureOpen}
        onOpenChange={setFailureOpen}
        errorCode={failureCode}
        errorMessage={failureMessage}
        onLoginSuccess={handleNsecLoginSuccess}
        onRetryExtension={handleRetryExtension}
      />
    </>
  );
}
