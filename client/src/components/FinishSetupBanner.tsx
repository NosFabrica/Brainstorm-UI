import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { tone } from "@/lib/tones";
import { useFinishSetup } from "@/hooks/useFinishSetup";

/**
 * The header's "Finish setting up your account" pill — the one persistent,
 * app-wide reminder that setup isn't done. Counts only relay-CONFIDENT pending
 * steps (see useFinishSetup), so it can never nag a signer user whose follow
 * list or kind-10040 simply hasn't loaded yet; it self-hides on /setup (the
 * page it points at) and once nothing is left.
 *
 * Responsive like the rest of the header: the full sentence + count on
 * desktop, sentence only on tablet, just the ⚠ + "Finish setup" chip on
 * phones.
 */
export function FinishSetupBanner() {
  const [location, navigate] = useLocation();
  const { signedIn, remaining } = useFinishSetup();
  const amber = tone("amber");

  if (!signedIn || remaining === 0 || location.startsWith("/setup")) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/setup")}
      aria-label="Finish setting up your account"
      className={`inline-flex max-w-full items-center gap-2 sm:gap-2.5 rounded-full border py-1 pl-3 pr-1 animate-glow-amber transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20 ${amber.bg} ${amber.border}`}
      data-testid="banner-finish-setup"
    >
      <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${amber.icon}`} />
      <span className="hidden whitespace-nowrap text-[13px] font-bold text-amber-900 dark:text-amber-200 sm:block">
        Finish setting up your account
      </span>
      <span
        className={`hidden whitespace-nowrap text-xs font-semibold tabular-nums lg:block ${amber.text}`}
        data-testid="banner-finish-setup-count"
      >
        · {remaining} {remaining === 1 ? "step" : "steps"} left
      </span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white">
        Finish setup
        <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  );
}
