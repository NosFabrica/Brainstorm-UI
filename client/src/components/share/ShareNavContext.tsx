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

  // Hashtags go straight to their trust-ranked content feed (no confirm — it's an
  // internal navigation). Profile mentions still show the confirm dialog below.
  const requestNav = (i: NavIntent) => {
    if (i.kind === "hashtag") {
      const tag = i.target.replace(/^#/, "").toLowerCase().trim();
      if (tag) navigate(`/t/${encodeURIComponent(tag)}`);
      return;
    }
    setIntent(i);
  };

  const confirm = () => {
    if (!intent) return;
    navigate(`/p/${intent.target}`);
    setIntent(null);
  };

  const isProfile = intent?.kind === "profile";

  return (
    <ShareNavContext.Provider value={requestNav}>
      {children}
      <Dialog open={!!intent} onOpenChange={(o) => !o && setIntent(null)}>
        <DialogContent
          className="sm:max-w-[400px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/5 p-0 overflow-hidden [&>button]:text-slate-400 dark:[&>button]:text-slate-500 [&>button]:hover:text-slate-700 dark:[&>button]:hover:text-slate-200 [&>button]:opacity-100 [&>button]:hover:bg-slate-100 dark:[&>button]:hover:bg-slate-800 [&>button]:rounded-md [&>button]:p-1"
          data-testid="modal-share-nav-confirm"
        >
          <div className="px-5 sm:px-6 pt-5 pb-2">
            {/* One left axis, and the avatar shares the title's row.
                DialogHeader defaults to `text-center sm:text-left`, so on a phone
                the copy centred while the block-level avatar stayed hard-left —
                two competing alignments in a 3-line dialog. Forcing text-left and
                setting the avatar beside the text fixes the axis AND reclaims the
                row the avatar used to own, which is most of the excess height. */}
            <DialogHeader className="space-y-0 text-left">
              <div className="flex items-start gap-3">
                {isProfile && intent?.picture ? (
                  <Avatar className="h-10 w-10 shrink-0 rounded-xl border border-brand-accent/20">
                    <AvatarImage src={intent.picture} alt={intent.label} className="object-cover" />
                    <AvatarFallback className="overflow-hidden rounded-xl"><DefaultAvatarImg /></AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/10 text-brand-deep">
                    {isProfile ? <UserRound className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                    {isProfile ? "View this profile on Brainstorm?" : "Explore on Brainstorm?"}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {isProfile
                      ? <>You'll see <span className="font-semibold text-slate-700 dark:text-slate-200">{intent?.label}</span>'s full profile and connections.</>
                      : <>Search the Brainstorm network for people related to <span className="font-semibold text-slate-700 dark:text-slate-200">{intent?.label}</span>.</>}
                  </DialogDescription>
                </div>
              </div>
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
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{povCaption}</div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[3.25rem] rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                )}
              </div>
            )}
          </div>
          {/* Equal-width actions. The primary was flex-1 against a fixed-width
              Cancel, so the pair sat lopsided; emphasis now comes from colour
              alone, which is the stronger signal anyway, and both are full-size
              thumb targets on a phone. */}
          <div className="flex gap-2.5 px-5 sm:px-6 pb-5 pt-3">
            <button
              type="button"
              onClick={confirm}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-primary text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
              data-testid="button-share-nav-continue"
            >
              {isProfile ? "View profile" : "Search Brainstorm"} <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIntent(null)}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
