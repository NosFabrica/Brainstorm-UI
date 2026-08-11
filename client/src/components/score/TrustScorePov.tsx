import { UserRound, Globe, Lock, AlertCircle, ArrowRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useActivePerspective } from "@/hooks/useActivePerspective";
import { VerificationCoin } from "@/components/score/VerificationCoin";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { cn } from "@/lib/utils";
import { activeHasSession } from "@/accounts/session";

/**
 * The sitewide "whose view is this score?" system (team feedback):
 *  - personalized ("For you")  — the viewer's own trust graph. Styled warm/indigo,
 *    the inviting premium view.
 *  - global ("Everyone")       — Brainstorm's network-wide (house) view. Neutral.
 * Icon + fill together (never color alone) so the distinction is recognizable at
 * a glance. Tier colors (green/amber/…) stay on the NUMBER; POV styles the
 * CONTAINER — two independent visual channels.
 *
 * One source of truth: the existing `useActivePerspective` store ("mywot"/"nosfabrica"),
 * shared with the account-menu "Trust perspective" switcher. The shared
 * TrustScoreModal explains the score, states the current view, and holds the
 * toggle — every score surface opens the same modal.
 */
export type ScorePov = "personalized" | "global";

/** Effective POV for score display: personalized only when signed in AND the store says "mywot". */
export function useScorePov(): { pov: ScorePov; loggedIn: boolean; setPersonalized: (on: boolean) => void } {
  const [activePov, setActivePerspective] = useActivePerspective();
  const loggedIn = activeHasSession();
  const pov: ScorePov = loggedIn && activePov === "mywot" ? "personalized" : "global";
  return { pov, loggedIn, setPersonalized: (on) => setActivePerspective(on ? "mywot" : "nosfabrica") };
}

/** Container chrome for a score chip/card. Personalized = soft indigo fill; global = neutral outline. */
export function povChrome(pov: ScorePov): string {
  return pov === "personalized"
    ? "border-brand-primary/20 dark:border-brand-primary/25 bg-brand-primary/10 dark:bg-brand-primary/10"
    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900";
}

export function PovIcon({ pov, className = "h-3 w-3" }: { pov: ScorePov; className?: string }) {
  return pov === "personalized" ? (
    <UserRound className={`${className} text-brand-primary`} />
  ) : (
    <Globe className={`${className} text-slate-400 dark:text-slate-500`} />
  );
}

/** Tiny inline tag naming the view — pairs the icon with a one-word label. */
export function PovTag({ pov }: { pov: ScorePov }) {
  return pov === "personalized" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/15 dark:bg-brand-primary/15 border border-brand-primary/20 dark:border-brand-primary/[0.3] px-1.5 py-0.5 text-[10px] font-semibold text-brand-primary dark:text-brand-link" data-testid="pov-tag">
      <UserRound className="h-2.5 w-2.5" /> Personalized
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400" data-testid="pov-tag">
      <Globe className="h-2.5 w-2.5" /> Global
    </span>
  );
}

/**
 * Compact segmented POV control for list / collection surfaces (followers,
 * following, muters, reporters) where every row's score — and the tier filters
 * that bucket them — are POV-dependent, so the active lens must stay VISIBLE
 * while scanning, not hidden behind a filter popover. It drives the SAME sitewide
 * store as the score modal and the account-menu switcher, so flipping it reframes
 * the whole app (one source of truth), and the surrounding list re-queries on its
 * own. When the viewer has no personal Web of Trust yet (`canPersonalize` false)
 * there's only one perspective — we state it honestly with a static Global tag
 * instead of a dead switch.
 */
export function PovToggle({ canPersonalize, avatarUrl, className }: { canPersonalize: boolean; avatarUrl?: string; className?: string }) {
  const { pov, loggedIn, setPersonalized } = useScorePov();
  const [location] = useLocation();

  // Mirror the homepage POV pill (landing.tsx): a quiet NEUTRAL segmented control
  // — the active segment is a plain white chip, no gradient / no wordmark image
  // (guidelines p16/p17). Brainstorm side = a Globe glyph, personal side = the
  // viewer's own avatar. One calm control everywhere POV is switched.
  const wrap = "inline-flex items-center rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 p-0.5";
  const seg = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40";
  const activeSeg = "bg-white dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-100 shadow-sm";
  const idleSeg = "font-medium text-slate-500 dark:text-slate-400 hover:text-brand-deep dark:hover:text-white";

  // Logged OUT → keep the "My perspective" affordance the homepage offers, but as
  // an HONEST sign-in hook: a locked segment that routes to /login (returning here
  // after), so a list becomes a contextual "see this through your own Web of Trust"
  // conversion moment. Matches the locked-Personalized option in the score modal.
  if (!canPersonalize && !loggedIn) {
    const loginHref = `/login?next=${encodeURIComponent(location)}`;
    return (
      <span role="group" aria-label="Trust perspective" className={cn(wrap, className)} data-testid="pov-toggle-signin">
        <span className={cn(seg, activeSeg)} data-testid="pov-toggle-global">
          <Globe className="h-3 w-3 text-brand-primary" /> Brainstorm
        </span>
        <Link
          href={loginHref}
          className={cn(seg, idleSeg)}
          aria-label="Sign in to see this through your own Web of Trust"
          data-testid="pov-toggle-signin-link"
        >
          <Lock className="h-3 w-3" /> My perspective
        </Link>
      </span>
    );
  }

  // Signed in but no personal Web of Trust yet (scores still calculating) →
  // Brainstorm's view is the only perspective; state it as a single active
  // branded chip instead of a dead two-way switch or a wrong "sign in" prompt.
  if (!canPersonalize) {
    return (
      <span className={cn(wrap, className)} data-testid="pov-toggle-static">
        <span className={cn(seg, activeSeg)}>
          <Globe className="h-3 w-3 text-brand-primary" /> Brainstorm
        </span>
      </span>
    );
  }

  const personalized = pov === "personalized";
  return (
    <div role="group" aria-label="Trust perspective" className={cn(wrap, className)} data-testid="pov-toggle">
      <button
        type="button"
        onClick={() => setPersonalized(false)}
        aria-pressed={!personalized}
        className={cn(seg, !personalized ? activeSeg : idleSeg)}
        data-testid="pov-toggle-global"
      >
        <Globe className={cn("h-3 w-3", !personalized && "text-brand-primary")} /> Brainstorm
      </button>
      <button
        type="button"
        onClick={() => setPersonalized(true)}
        aria-pressed={personalized}
        className={cn(seg, personalized ? activeSeg : idleSeg)}
        data-testid="pov-toggle-personalized"
      >
        <Avatar className="h-4 w-4 shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden"><DefaultAvatarImg /></AvatarFallback>
        </Avatar>
        My perspective
      </button>
    </div>
  );
}

/**
 * The shared Verification Score explainer + view switcher. Three jobs (per team
 * feedback): explain what the score means, state whose view is shown NOW, and
 * toggle personalized ↔ global (app-wide, via the shared store). When a surface
 * can't serve both views, pass `unsupportedNote` — the toggle hides and an
 * honest amber note shows instead. Logged out, personalized is a locked
 * sign-in prompt (soft conversion).
 */
export function TrustScoreModal({
  open,
  onOpenChange,
  unsupportedNote,
  scores,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  unsupportedNote?: string;
  /**
   * This profile's score (0–1 influence) in each view, for the compare-both
   * display. Optional — omitted on surfaces that just explain/toggle. A coin
   * renders beside each option so the two perspectives sit side by side.
   */
  scores?: { personalized: number | null; global: number | null };
}) {
  const { pov, loggedIn, setPersonalized } = useScorePov();

  const option = (target: ScorePov) => {
    const active = pov === target;
    const locked = target === "personalized" && !loggedIn;
    const base = "w-full rounded-xl border p-3 text-left transition-colors";
    const cls = active
      ? target === "personalized"
        ? `${base} border-brand-primary/25 dark:border-brand-primary/[0.4] bg-brand-primary/10 dark:bg-brand-primary/10 ring-1 ring-brand-primary/20 dark:ring-brand-primary/25`
        : `${base} border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800`
      : `${base} border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800`;
    return { cls, active, locked };
  };
  const p = option("personalized");
  const g = option("global");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="trust-score-modal">
        <DialogHeader>
          <DialogTitle>Verification Score</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            A Verification Score (0–100) measures how verified an account is, based on real
            people's follows, mutes and reports — not an algorithm. The same account can score
            differently depending on <span className="font-semibold text-slate-700 dark:text-slate-200">whose network</span>{" "}
            you look through.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {/* Personalized */}
          {p.locked ? (
            <Link
              href="/login"
              className={`${p.cls} flex items-start gap-2.5 opacity-90`}
              data-testid="pov-option-personalized-locked"
            >
              <Lock className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <UserRound className="h-3.5 w-3.5 text-brand-primary" /> Personalized — for you
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Scores through <span className="font-medium">your own</span> network. Sign in free to unlock it{" "}
                  <ArrowRight className="inline h-3 w-3" />
                </span>
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setPersonalized(true)}
              disabled={!!unsupportedNote}
              className={`${p.cls} flex items-start gap-2.5 disabled:opacity-60`}
              data-testid="pov-option-personalized"
            >
              <UserRound className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Personalized — for you
                  {p.active && <span className="text-[10px] font-bold uppercase tracking-wide text-brand-primary dark:text-brand-link">Current view</span>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Seen through <span className="font-medium">your own</span> network — the people you trust, and who they trust.
                </span>
              </span>
              {scores && (
                <VerificationCoin score01={scores.personalized} pov="personalized" size={34} ring={false} className="shrink-0 self-center" />
              )}
            </button>
          )}

          {/* Global */}
          <button
            type="button"
            onClick={() => setPersonalized(false)}
            disabled={!!unsupportedNote}
            className={`${g.cls} flex items-start gap-2.5 disabled:opacity-60`}
            data-testid="pov-option-global"
          >
            <Globe className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Global — everyone
                {g.active && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Current view</span>}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Brainstorm's network-wide view — the same number every visitor sees.
              </span>
            </span>
            {scores && (
              <VerificationCoin score01={scores.global} pov="global" size={34} ring={false} className="shrink-0 self-center" />
            )}
          </button>
        </div>

        {unsupportedNote && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {unsupportedNote}
          </p>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
          Switching applies everywhere in Brainstorm until you switch back.
        </p>
      </DialogContent>
    </Dialog>
  );
}
