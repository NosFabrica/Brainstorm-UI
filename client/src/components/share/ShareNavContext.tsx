import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, UserRound, Search } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { apiClient, hasSessionToken } from "@/services/api";
import { decodeShareId } from "@/lib/shareId";
import { tierForScore } from "@/components/share/TrustScoreBadge";
import { useActivePov } from "@/hooks/useActivePov";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";

/**
 * The share page is a teaser, not a full client — so clicking a @mention or
 * #hashtag inside a note doesn't silently behave like a feed. It asks first
 * ("continue to view this on Brainstorm?") and then navigates deliberately —
 * into the person's profile, or into search. Any note component can request a
 * navigation via {@link useShareNav}; this provider shows the confirm dialog.
 */
export interface NavIntent {
  kind: "profile" | "hashtag";
  /** npub/nprofile for a profile; the hashtag (with #) for a hashtag. */
  target: string;
  label: string;
  /** Profile picture (for the confirm dialog avatar). */
  picture?: string;
}

const ShareNavContext = createContext<(intent: NavIntent) => void>(() => {});

export function useShareNav() {
  return useContext(ShareNavContext);
}

export function ShareNavProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [intent, setIntent] = useState<NavIntent | null>(null);

  // Show the target's trust score in the viewer's current perspective: their own
  // Web of Trust when logged in + using the mywot POV, otherwise the house score.
  const [pov] = useActivePov();
  const { hasMywot } = useHasMywot();
  const { isSearchObserver } = useIsSearchObserver();
  const usePersonal = hasSessionToken() && hasMywot && isSearchObserver && pov === "mywot";

  const targetPubkey = useMemo(() => {
    if (intent?.kind !== "profile") return null;
    try {
      return decodeShareId(intent.target)?.pubkey ?? null;
    } catch {
      return null;
    }
  }, [intent]);

  const scoreQuery = useQuery({
    queryKey: ["nav-confirm-score", targetPubkey, usePersonal ? "mywot" : "house"],
    queryFn: async () => {
      if (!targetPubkey) return null;
      if (usePersonal) {
        const ov = (await apiClient.getUserOverview(targetPubkey)) as { data?: { influence?: unknown } };
        const inf = ov?.data?.influence;
        return typeof inf === "number" && Number.isFinite(inf) ? inf : null;
      }
      return await apiClient.getHouseInfluence(targetPubkey);
    },
    enabled: !!targetPubkey,
    staleTime: 60_000,
    retry: false,
  });
  const score01 = typeof scoreQuery.data === "number" ? scoreQuery.data : null;
  const tier = score01 != null ? tierForScore(score01) : null;
  const povCaption = usePersonal ? "Through your Web of Trust" : "Brainstorm network score";

  const confirm = () => {
    if (!intent) return;
    if (intent.kind === "profile") {
      navigate(`/p/${intent.target}`);
    } else {
      const q = intent.target.replace(/^#/, "");
      navigate(`/?q=${encodeURIComponent(q)}`);
    }
    setIntent(null);
  };

  const isProfile = intent?.kind === "profile";

  return (
    <ShareNavContext.Provider value={setIntent}>
      {children}
      <Dialog open={!!intent} onOpenChange={(o) => !o && setIntent(null)}>
        <DialogContent
          className="sm:max-w-[400px] rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 p-0 overflow-hidden [&>button]:text-slate-400 [&>button]:hover:text-slate-700 [&>button]:opacity-100 [&>button]:hover:bg-slate-100 [&>button]:rounded-md [&>button]:p-1"
          data-testid="modal-share-nav-confirm"
        >
          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
            <DialogHeader>
              {isProfile && intent?.picture ? (
                <Avatar className="h-10 w-10 rounded-xl border border-[#7c86ff]/20 mb-3">
                  <AvatarImage src={intent.picture} alt={intent.label} className="object-cover" />
                  <AvatarFallback className="overflow-hidden rounded-xl"><DefaultAvatarImg /></AvatarFallback>
                </Avatar>
              ) : (
                <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center text-[#333286] mb-3">
                  {isProfile ? <UserRound className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                </div>
              )}
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 leading-tight tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                {isProfile ? "View this profile on Brainstorm?" : "Explore on Brainstorm?"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                {isProfile
                  ? <>You'll see <span className="font-semibold text-slate-700">{intent?.label}</span>'s full profile and connections.</>
                  : <>Search the Brainstorm network for people related to <span className="font-semibold text-slate-700">{intent?.label}</span>.</>}
              </DialogDescription>
            </DialogHeader>
            {isProfile && (scoreQuery.isLoading || tier) && (
              <div className="mt-3">
                {tier ? (
                  <div
                    className="flex items-center gap-2.5 rounded-xl border p-2.5"
                    style={{ borderColor: `${tier.color}40`, backgroundColor: `${tier.color}0d` }}
                    data-testid="nav-confirm-score"
                  >
                    <span
                      className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold font-mono tabular-nums"
                      style={{ color: tier.color, backgroundColor: `${tier.color}1a` }}
                    >
                      {Math.round((score01 ?? 0) * 100)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold leading-tight" style={{ color: tier.color }}>{tier.name}</div>
                      <div className="text-[11px] text-slate-500">{povCaption}</div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[3.25rem] rounded-xl bg-slate-100 animate-pulse" />
                )}
              </div>
            )}
          </div>
          <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-2 flex gap-2.5">
            <button
              type="button"
              onClick={confirm}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold transition-colors"
              data-testid="button-share-nav-continue"
            >
              {isProfile ? "View profile" : "Search Brainstorm"} <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIntent(null)}
              className="h-11 px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold transition-colors"
              data-testid="button-share-nav-cancel"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </ShareNavContext.Provider>
  );
}
