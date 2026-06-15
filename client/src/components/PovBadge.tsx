import { useEffect } from "react";
import { useLocation } from "wouter";
import { Check, Telescope, AlertCircle, ArrowRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useActivePov, hasStoredPov, type ActivePov } from "@/hooks/useActivePov";
import { useHasMywot } from "@/hooks/useHasMywot";
import nosFabricaLogo from "@assets/a3d51408e84ca674b5892761fb366072479d962e245602bbc47568acba7c6b_1774042041592.jpg";

interface PovUser {
  displayName?: string;
  picture?: string;
  pubkey?: string;
}

interface PovMenuSectionProps {
  user: PovUser | null;
  /**
   * "global"             — POV change actually drives data on this page (e.g. Search).
   * "page-not-supported" — POV is informational; scores on this page always reflect
   *                        the logged-in user's personalized graph because the
   *                        backend endpoints used here don't accept a POV parameter
   *                        yet. Surfaces an honest amber warning.
   */
  scope?: "global" | "page-not-supported";
}

export function PovMenuSection({ user, scope = "global" }: PovMenuSectionProps) {
  const [pov, setPov] = useActivePov();
  const { hasMywot } = useHasMywot();
  const [, navigate] = useLocation();

  const effective: ActivePov = pov === "mywot" && !hasMywot ? "nosfabrica" : pov;

  return (
    <>
      <DropdownMenuLabel
        className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5 pt-2"
        data-testid="label-pov-section"
      >
        <Telescope className="h-3 w-3" /> Trust perspective
      </DropdownMenuLabel>
      <DropdownMenuItem
        className={
          "flex items-start gap-2 px-2.5 py-2 cursor-pointer " +
          (effective === "nosfabrica" ? "bg-indigo-50/60" : "")
        }
        onClick={() => setPov("nosfabrica")}
        data-testid="menu-pov-option-nosfabrica"
      >
        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
          <AvatarImage src={nosFabricaLogo} alt="Brainstorm" className="object-cover" />
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-slate-800">Brainstorm</span>
            {effective === "nosfabrica" && <Check className="h-3 w-3 text-indigo-500" />}
          </div>
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
            The "house" view from Brainstorm's curated trust graph.
          </p>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem
        className={
          "flex items-start gap-2 px-2.5 py-2 cursor-pointer " +
          (effective === "mywot" ? "bg-emerald-50/60" : "") +
          (!hasMywot ? " opacity-60" : "")
        }
        onClick={(e) => {
          if (!hasMywot) {
            e.preventDefault();
            return;
          }
          setPov("mywot");
        }}
        data-testid="menu-pov-option-mywot"
      >
        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
          {user?.picture ? (
            <AvatarImage src={user.picture} alt={user.displayName || "You"} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px] font-bold">
            {user?.displayName?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-slate-800 truncate">
              {user?.displayName || "My WoT"}
            </span>
            {effective === "mywot" && <Check className="h-3 w-3 text-emerald-600" />}
            {!hasMywot && (
              <span className="ml-auto text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                Coming soon
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
            {hasMywot
              ? "Personalized scores using your own trust graph."
              : "Calculate your trust network in Settings to enable."}
          </p>
          {!hasMywot && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/settings");
              }}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
              data-testid="link-calculate-yours"
            >
              Calculate yours <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </DropdownMenuItem>
      {scope === "page-not-supported" && (
        <div className="mx-1 my-1 px-2.5 py-2 flex items-start gap-1.5 rounded text-[10px] text-amber-800 bg-amber-50 border border-amber-100">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="leading-snug">
            Scores on this page always reflect your personalized view. House-perspective scores
            aren't supported by the backend here yet.
          </span>
        </div>
      )}
      <DropdownMenuSeparator className="bg-indigo-100" />
    </>
  );
}

/**
 * Single global effect: if the user has never picked a POV and they
 * already have a calculated trust graph, default to "My WoT". Mount once
 * inside App.tsx so this runs regardless of which page is active.
 */
export function PovAutoDefault() {
  const [, setPov] = useActivePov();
  const { hasMywot } = useHasMywot();
  useEffect(() => {
    if (!hasStoredPov() && hasMywot) {
      setPov("mywot");
    }
  }, [hasMywot, setPov]);
  return null;
}
