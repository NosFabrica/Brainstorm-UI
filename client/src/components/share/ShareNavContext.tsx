import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, UserRound, Search } from "lucide-react";

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
}

const ShareNavContext = createContext<(intent: NavIntent) => void>(() => {});

export function useShareNav() {
  return useContext(ShareNavContext);
}

export function ShareNavProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [intent, setIntent] = useState<NavIntent | null>(null);

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
              <div className="h-10 w-10 rounded-xl bg-[#7c86ff]/10 border border-[#7c86ff]/20 flex items-center justify-center text-[#333286] mb-3">
                {isProfile ? <UserRound className="h-5 w-5" /> : <Search className="h-5 w-5" />}
              </div>
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 leading-tight tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {isProfile ? "View this profile on Brainstorm?" : "Explore on Brainstorm?"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                {isProfile
                  ? <>You'll see <span className="font-semibold text-slate-700">{intent?.label}</span>'s profile and Web-of-Trust score.</>
                  : <>Search the Brainstorm network for people related to <span className="font-semibold text-slate-700">{intent?.label}</span>.</>}
              </DialogDescription>
            </DialogHeader>
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
