import { useEffect } from "react";
import { useLocation } from "wouter";
import { Search, Home, Users, LogIn } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { AccountMenuBody, useAccountMenu } from "@/components/AccountMenuBody";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useIsMobile } from "@/hooks/use-mobile";
import { logout } from "@/services/nostr";
import type { AccountDisplay } from "@/accounts/display";
import { useAccountSheetOpen, openAccountSheet, closeAccountSheet, setAccountSheet } from "@/lib/accountSheetStore";
import { cn } from "@/lib/utils";

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

  // Reserve space so the fixed bar never covers page content or the site footer.
  //
  // Body padding only moves DOCUMENT FLOW. `position: fixed` elements are placed
  // against the viewport, so every floating bottom-anchored thing in the app — the
  // scoring status pill, the Share page's Customize button and sticky invite bar,
  // the back-to-top button — landed on top of this bar and covered the tab labels.
  // Publishing the occupied height as a CSS variable gives them all one number to
  // offset by, and it self-zeroes on desktop where this component renders nothing.
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.paddingBottom;
    const inset = "calc(4rem + env(safe-area-inset-bottom))";
    document.body.style.paddingBottom = inset;
    document.documentElement.style.setProperty("--bs-bottom-chrome", inset);
    return () => {
      document.body.style.paddingBottom = prev;
      document.documentElement.style.removeProperty("--bs-bottom-chrome");
    };
  }, [isMobile]);

  if (!isMobile) return null;

  const isActive = (path: string) => (path === "/" ? location === "/" : location.startsWith(path));
  const go = (path: string) => navigate(path);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl backdrop-saturate-150"
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
          transform: "translateZ(0)",
          WebkitBackfaceVisibility: "hidden",
        }}
        aria-label="Primary"
        data-testid="mobile-tab-bar"
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
          {user.picture ? <AvatarImage src={user.picture} alt="" className="object-cover" /> : null}
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
  const isAdmin = user.isAdmin;
  const { onNavigate, onInvite, onRequestLogout, onRequestRemove, modals } = useAccountMenu(user, onLogout, closeAccountSheet);

  return (
    <>
      <Drawer open={open} onOpenChange={setAccountSheet}>
        <DrawerContent className="border-brand-accent/20 dark:border-white/10 bg-white/90 dark:bg-slate-950/95 backdrop-blur-xl">
          <DrawerTitle className="sr-only">Your account</DrawerTitle>
          {/* Brand-tint wash to match the desktop menu's frosted surface. */}
          <div className="pointer-events-none absolute inset-0 rounded-t-[10px] bg-gradient-to-br from-brand-deep/[0.05] to-brand-accent/[0.07]" />
          <div className="relative max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <AccountMenuBody
              user={user}
              isAdmin={isAdmin}
              active={undefined}
              onNavigate={onNavigate}
              onInvite={onInvite}
              onRequestLogout={onRequestLogout}
              onRequestRemove={onRequestRemove}
              close={closeAccountSheet}
            />
          </div>
        </DrawerContent>
      </Drawer>
      {modals}
    </>
  );
}
