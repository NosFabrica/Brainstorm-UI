import { useLocation } from "wouter";
import { closeMobileMenu } from "@/lib/mobileMenuStore";

function SignInIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M11.6799 14.62L14.2399 12.06L11.6799 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 12.0596H14.17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 4C16.42 4 20 7 20 12C20 17 16.42 20 12 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      <SignInIcon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
