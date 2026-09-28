import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { registerBottomChrome } from "@/lib/bottomChrome";
import { useLocation } from "wouter";
import { Search, Home, Users, LogIn } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEditingText } from "@/hooks/useEditingText";
import { logout } from "@/accounts/login-flow";
import type { AccountDisplay } from "@/accounts/display";
import { useAccountSheetOpen, openAccountSheet } from "@/lib/accountSheetStore";
import { cn } from "@/lib/utils";
import { OverlaySpinner } from "@/components/OverlaySpinner";

const MobileAccountSheetBody = lazy(() =>
  import("@/components/MobileAccountSheetBody").then((m) => ({ default: m.MobileAccountSheetBody })),
);

/**
 * Mobile bottom navigation — the thumb-level home base on phones, replacing the
 * top-right avatar popover (which is hidden on mobile). Signed in: Search /
 * Dashboard / Network / You, where "You" opens the account bottom sheet. Signed
 * out: Search / Sign in. Desktop renders nothing. The sheet reuses the shared
 * {@link AccountMenuBody}, so mobile and desktop menus never drift.
 */
export function MobileTabBar() {
  const isMobile = useIsMobile();
  const user = useActiveAccountDisplay();
  const [location, navigate] = useLocation();
  const sheetOpen = useAccountSheetOpen();
  // Out of the way while typing, as a native tab bar is under the keyboard. iOS Safari
  // shrinks its own toolbar when a field takes focus without telling the page, and this bar
  // stayed where the toolbar used to end, with results showing through the strip below it.
  const editing = useEditingText();
  const navRef = useRef<HTMLElement | null>(null);
  // Hidden is out of reach too: `inert` takes the buttons out of the tab order, which
  // aria-hidden alone does not (Tab reached invisible buttons, and Enter still navigated).
  // Set on the node: React 18's types do not know the attribute.
  useEffect(() => {
    navRef.current?.toggleAttribute("inert", editing);
  }, [editing]);

  // Reserve space so the fixed bar never covers page content or the site footer.
  //
  // Body padding only moves DOCUMENT FLOW. `position: fixed` elements are placed
  // against the viewport, so every floating bottom-anchored thing in the app — the
  // scoring status pill, the Share page's Customize button and sticky invite bar,
  // the back-to-top button — landed on top of this bar and covered the tab labels.
  // Publishing the occupied height as a CSS variable gives them all one number to
  // offset by, and it self-zeroes on desktop where this component renders nothing.
  //
  // Kept while the bar steps aside for typing: released, it changed the body's padding on
  // every focus and blur, which reflowed the page (a scroll at the bottom jumped) and dropped
  // the now-playing bar into the strip at once while this one was still fading.
  useEffect(() => {
    if (!isMobile) return;
    // The ledger (lib/bottomChrome) sums this with the now-playing bar's height.
    return registerBottomChrome("tabbar", "calc(4rem + env(safe-area-inset-bottom))");
  }, [isMobile]);

  if (!isMobile) return null;

  const isActive = (path: string) => (path === "/" ? location === "/" : location.startsWith(path));
  const go = (path: string) => navigate(path);

  return (
    <>
      <nav
        ref={navRef}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl backdrop-saturate-150 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
          // Faded as well as moved: Safari keeps drawing the page in the strip its toolbar
          // gave up, so a bar only slid down its own height was still there, untappable.
          editing && "pointer-events-none opacity-0",
        )}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          // iOS Safari (worst in a standalone PWA) mis-composites a `position:
          // fixed` element that also has a backdrop-filter: during momentum scroll
          // the bar can paint at a STALE scroll offset, leaving it stranded
          // mid-screen with page content torn through it. Forcing it onto its own
          // compositing layer makes WebKit repaint it against the viewport.
          //
          // Safe here: a transform on this element creates a containing block for
          // its DESCENDANTS only, and the nav's children are just the tab buttons —
          // the account sheet is a sibling, not a child.
          transform: editing ? "translate3d(0, 100%, 0)" : "translateZ(0)",
          WebkitBackfaceVisibility: "hidden",
        }}
        aria-label="Primary"
        aria-hidden={editing || undefined}
        data-testid="mobile-tab-bar"
        data-editing={editing ? "true" : undefined}
      >
        <div className="mx-auto flex max-w-lg items-stretch">
          {user ? (
            <>
              <TabButton label="Search" icon={Search} active={isActive("/")} onClick={() => go("/")} testId="tab-search" />
              <TabButton label="Dashboard" icon={Home} active={isActive("/dashboard")} onClick={() => go("/dashboard")} testId="tab-dashboard" />
              <TabButton label="Network" icon={Users} active={isActive("/network")} onClick={() => go("/network")} testId="tab-network" />
              <YouTab user={user} active={sheetOpen} onClick={openAccountSheet} />
            </>
          ) : (
            <>
              <TabButton label="Search" icon={Search} active={isActive("/")} onClick={() => go("/")} testId="tab-search" />
              <TabButton label="Sign in" icon={LogIn} active={isActive("/login")} onClick={() => go("/login")} testId="tab-signin" />
            </>
          )}
        </div>
      </nav>

      {user && (
        <MobileAccountSheet user={user} onLogout={() => { logout(); navigate("/"); }} />
      )}
    </>
  );
}

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
  testId,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 outline-none transition-colors",
        active ? "text-brand-primary dark:text-brand-link" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200",
      )}
      data-testid={testId}
    >
      <Icon className="h-[22px] w-[22px]" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

function YouTab({ user, active, onClick }: { user: AccountDisplay; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Account"
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 outline-none transition-colors",
        active ? "text-brand-primary dark:text-brand-link" : "text-slate-500 dark:text-slate-400",
      )}
      data-testid="tab-you"
    >
      <span className={cn("block rounded-full p-[1.5px] transition-colors", active ? "bg-gradient-to-tr from-brand-deep via-brand-accent to-brand-deep" : "bg-transparent")}>
        <Avatar className="h-[22px] w-[22px]">
          <AvatarImage src={user.picture} alt="" className="object-cover" />
          <AvatarFallback className="bg-white text-[10px] font-bold text-[#0A0E18]">
            {user.displayName?.charAt(0)?.toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      </span>
      <span className="text-[10px] font-medium leading-none">You</span>
    </button>
  );
}

function MobileAccountSheet({ user, onLogout }: { user: AccountDisplay; onLogout: () => void }) {
  const open = useAccountSheetOpen();
  const [asked, setAsked] = useState(open);
  useEffect(() => {
    if (open) setAsked(true);
  }, [open]);
  if (!asked) return null;
  return (
    <Suspense fallback={open ? <OverlaySpinner /> : null}>
      <MobileAccountSheetBody user={user} onLogout={onLogout} />
    </Suspense>
  );
}
