import { LogIn } from "lucide-react";
import { useLocation } from "wouter";
import { closeMobileMenu } from "@/lib/mobileMenuStore";

interface SignInButtonProps {
  /** Visual style. "primary" = filled indigo, "ghost" = subtle outline, "link" = inline text. */
  variant?: "primary" | "ghost" | "link";
  className?: string;
  label?: string;
  /**
   * Kept for backwards compatibility. The button now navigates to the dedicated
   * /login page (Google-style), so post-sign-in routing is handled there. If
   * provided, this runs before navigation (e.g. to close a menu).
   */
  onSuccess?: () => void;
  "data-testid"?: string;
}

const VARIANT_CLASSES: Record<NonNullable<SignInButtonProps["variant"]>, string> = {
  primary:
    "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors active:scale-[0.98]",
  ghost:
    "inline-flex items-center justify-center gap-2 px-3.5 py-1.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg transition-colors active:scale-[0.98]",
  link: "inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors",
};

export function SignInButton({
  variant = "primary",
  className = "",
  label = "Sign in",
  onSuccess,
  "data-testid": testId = "button-sign-in",
}: SignInButtonProps) {
  const [location, navigate] = useLocation();

  const onClick = () => {
    closeMobileMenu();
    onSuccess?.();
    const next =
      location && location.startsWith("/") && location !== "/login"
        ? `?next=${encodeURIComponent(location)}`
        : "";
    navigate(`/login${next}`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${VARIANT_CLASSES[variant]} ${className}`}
      data-testid={testId}
    >
      <LogIn className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
