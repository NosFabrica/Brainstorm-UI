/**
 * The Brainstorm / My perspective control — the one lens switch on the
 * search page. Two seats, one component: the centered pill under the box on
 * the pristine landing (`full`), and a compact version in the results tab row
 * so the results start higher (labels hide on phones; the icons carry it).
 *
 * Quiet neutral segmented control — active segment a plain white chip, no
 * gradient / no wordmark image (guidelines p16/p17).
 */
import { useLocation } from "wouter";
import { ArrowRight, Globe, Info, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import type { SearchPov } from "@/services/search";

export function PerspectiveToggle({
  pov,
  user,
  hasMywot,
  isSearchObserver,
  onChange,
  compact = false,
}: {
  /** The EFFECTIVE perspective (already fallen back to the house view). */
  pov: SearchPov;
  user: { picture?: string | null } | null;
  hasMywot: boolean;
  isSearchObserver: boolean;
  onChange: (next: SearchPov) => void;
  compact?: boolean;
}) {
  const [, setLocation] = useLocation();
  const canUseMywot = hasMywot && isSearchObserver;

  // The results row shows the lens only when it can switch. A visitor's
  // door to their own perspective is one quiet line inside Filters; the
  // pristine landing keeps the full pill as the invitation.
  if (compact && !user) return null;

  const pad = compact ? "px-2 sm:px-2.5 py-1" : "px-3.5 py-1";
  const segment = (active: boolean, disabled = false) =>
    `inline-flex items-center gap-1.5 rounded-full ${pad} text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ` +
    (active
      ? "bg-white dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-100 shadow-sm"
      : "font-medium text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white") +
    (disabled ? " opacity-50 cursor-not-allowed" : "");
  // Compact seats hide the words on phones — the globe and the avatar say it.
  const label = (text: string) => <span className={compact ? "hidden sm:inline" : undefined}>{text}</span>;

  const learnMore = compact ? (
    <button
      type="button"
      onClick={() => setLocation("/personalization")}
      aria-label="What is this?"
      title="What is this?"
      className="hidden sm:inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-brand-deep dark:text-slate-500 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid="link-home-learn-more"
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setLocation("/personalization")}
      className="text-xs text-brand-link hover:underline transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid="link-home-learn-more"
    >
      What is this?
    </button>
  );

  const pill = !user ? (
    <div role="group" aria-label="Trust perspective" className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 p-0.5">
      <span className={segment(true)} data-testid="text-home-pov-label">
        <Globe className="h-3 w-3 text-brand-primary" /> {label("Brainstorm")}
      </span>
      <button
        type="button"
        onClick={() => setLocation("/login")}
        aria-label="My perspective — sign in"
        title="Sign in to search through the people you trust"
        className={segment(false)}
        data-testid="toggle-home-pov-signin"
      >
        <UserRound className="h-3 w-3" /> {label("My perspective")}
      </button>
    </div>
  ) : (
    <div role="group" aria-label="Trust perspective" className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 p-0.5" data-testid="toggle-home-pov">
      <button
        type="button"
        onClick={() => onChange("nosfabrica")}
        aria-pressed={pov === "nosfabrica"}
        aria-label="Brainstorm"
        className={segment(pov === "nosfabrica")}
        data-testid="toggle-home-pov-nosfabrica"
      >
        <Globe className={`h-3 w-3 ${pov === "nosfabrica" ? "text-brand-primary" : ""}`} /> {label("Brainstorm")}
      </button>
      <button
        type="button"
        onClick={() => {
          if (canUseMywot) onChange("mywot");
          // No graph yet: the segment is the door to calculating one.
          else if (!hasMywot) setLocation("/settings");
        }}
        // A graph exists but this account may not observe yet — nothing to do.
        disabled={hasMywot && !isSearchObserver}
        aria-pressed={pov === "mywot"}
        aria-label="My perspective"
        title={
          !hasMywot
            ? "Calculate your trust network to search from your own perspective"
            : !isSearchObserver
              ? "Personalized search isn't available for your account yet"
              : undefined
        }
        className={segment(pov === "mywot", hasMywot && !isSearchObserver)}
        data-testid="toggle-home-pov-mywot"
      >
        <Avatar className="h-4 w-4 shrink-0">
          {user.picture ? <AvatarImage src={user.picture} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
        </Avatar>{" "}
        {label("My perspective")}
      </button>
    </div>
  );

  if (compact) {
    return (
      <div className="inline-flex items-center gap-0.5" data-testid="text-home-hint">
        {pill}
        {learnMore}
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs rounded-2xl backdrop-blur-[2px]" data-testid="text-home-hint">
      {pill}
      {user && !hasMywot && (
        <button
          type="button"
          onClick={() => setLocation("/settings")}
          className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid="link-home-calculate-yours"
        >
          Calculate yours <ArrowRight className="h-3 w-3" />
        </button>
      )}
      {user && <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">·</span>}
      {learnMore}
    </div>
  );
}
