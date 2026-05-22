import { useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronDown, Check, Telescope, AlertCircle, ArrowRight } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActivePov, hasStoredPov, type ActivePov } from "@/hooks/useActivePov";
import { useHasMywot } from "@/hooks/useHasMywot";
import nosFabricaLogo from "@assets/a3d51408e84ca674b5892761fb366072479d962e245602bbc47568acba7c6b_1774042041592.jpg";

interface HeaderPovChipProps {
  user: { displayName?: string; picture?: string; pubkey?: string } | null;
  /**
   * "global"               — POV change actually drives data on this page (e.g. Search).
   * "page-not-supported"   — POV chip is informational; scores on this page are always
   *                          rendered from the logged-in user's personalized graph
   *                          because backend endpoints used here don't accept a POV
   *                          parameter yet. Surfaces an honest warning in the menu.
   */
  scope?: "global" | "page-not-supported";
}

const POV_LABEL: Record<ActivePov, string> = {
  nosfabrica: "NosFabrica",
  mywot: "My WoT",
};

export function HeaderPovChip({ user, scope = "global" }: HeaderPovChipProps) {
  const [pov, setPov] = useActivePov();
  const { hasMywot } = useHasMywot();
  const [, navigate] = useLocation();

  // Login default: if the user has never picked a perspective and they
  // already have their own trust graph calculated, default to "My WoT"
  // rather than the house view. Otherwise fall back to NosFabrica.
  useEffect(() => {
    if (!hasStoredPov() && hasMywot) {
      setPov("mywot");
    }
  }, [hasMywot, setPov]);

  // Defensive fallback: if user stored "mywot" but no longer has a trust
  // anchor (e.g. calc not done on this account), display NosFabrica instead.
  const effective: ActivePov = pov === "mywot" && !hasMywot ? "nosfabrica" : pov;
  const label = effective === "mywot" ? user?.displayName || POV_LABEL.mywot : POV_LABEL.nosfabrica;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden sm:inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition-colors focus:outline-none"
          title={`Trust perspective: ${label}`}
          data-testid="button-header-pov"
        >
          <div className="relative">
            <Avatar
              className={`h-6 w-6 border ${
                effective === "nosfabrica" ? "border-indigo-300/40" : "border-emerald-300/50"
              }`}
            >
              {effective === "nosfabrica" ? (
                <AvatarImage src={nosFabricaLogo} alt="NosFabrica" className="object-cover" />
              ) : (
                <>
                  {user?.picture ? (
                    <AvatarImage src={user.picture} alt={label} className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-emerald-500/20 text-emerald-200 text-[10px] font-bold">
                    {user?.displayName?.charAt(0) || "U"}
                  </AvatarFallback>
                </>
              )}
            </Avatar>
            <div
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-950 ${
                effective === "nosfabrica" ? "bg-indigo-400" : "bg-emerald-400"
              }`}
            />
          </div>
          <span
            className="hidden md:inline text-[11px] font-medium text-slate-200 max-w-[100px] truncate"
            data-testid="text-header-pov-label"
          >
            {label}
          </span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 bg-white border-slate-200/60"
        data-testid="menu-header-pov"
      >
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
          <Telescope className="h-3 w-3" /> Trust perspective
        </DropdownMenuLabel>
        <DropdownMenuItem
          className={`flex items-start gap-2 px-2.5 py-2 cursor-pointer ${
            effective === "nosfabrica" ? "bg-indigo-50/60" : ""
          }`}
          onClick={() => setPov("nosfabrica")}
          data-testid="header-pov-option-nosfabrica"
        >
          <Avatar className="h-7 w-7 shrink-0 mt-0.5">
            <AvatarImage src={nosFabricaLogo} alt="NosFabrica" className="object-cover" />
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-medium text-slate-800">NosFabrica</span>
              {effective === "nosfabrica" && <Check className="h-3 w-3 text-indigo-500" />}
            </div>
            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
              The "house" view from NosFabrica's curated trust graph.
            </p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className={`flex items-start gap-2 px-2.5 py-2 cursor-pointer ${
            effective === "mywot" ? "bg-emerald-50/60" : ""
          } ${!hasMywot ? "opacity-60" : ""}`}
          onClick={(e) => {
            if (!hasMywot) {
              e.preventDefault();
              return;
            }
            setPov("mywot");
          }}
          data-testid="header-pov-option-mywot"
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
          <>
            <DropdownMenuSeparator />
            <div className="mx-1 my-1 px-2.5 py-2 flex items-start gap-1.5 rounded text-[10px] text-amber-800 bg-amber-50 border border-amber-100">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="leading-snug">
                Scores on this page always reflect your personalized view. House-perspective
                scores aren't supported by the backend here yet.
              </span>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
