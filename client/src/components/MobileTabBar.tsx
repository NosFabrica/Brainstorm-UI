import { useEffect } from "react";
import { useLocation } from "wouter";
import { Search, Home, Users, LogIn } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { AccountMenuBody, useAccountMenu } from "@/components/AccountMenuBody";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsMobile } from "@/hooks/use-mobile";
import { isAdminPubkey } from "@/config/adminAccess";
import { logout, type NostrUser } from "@/services/nostr";
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
  const [user, setUser] = useCurrentUser();
  const [location, navigate] = useLocation();
  const sheetOpen = useAccountSheetOpen();

  // Reserve space so the fixed bar never covers page content or the site footer.
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "calc(4rem + env(safe-area-inset-bottom))";
    return () => { document.body.style.paddingBottom = prev; };
  }, [isMobile]);

  if (!isMobile) return null;

  const isActive = (path: string) => (path === "/" ? location === "/" : location.startsWith(path));
  const go = (path: string) => navigate(path);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 dark:border-white/10 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl backdrop-saturate-150"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
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
        <MobileAccountSheet user={user} onLogout={() => { logout(); setUser(null); navigate("/"); }} />
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

function YouTab({ user, active, onClick }: { user: NostrUser; active: boolean; onClick: () => void }) {
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
          <AvatarFallback className="bg-indigo-100 text-[10px] font-bold text-indigo-700">
            {user.displayName?.charAt(0)?.toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      </span>
      <span className="text-[10px] font-medium leading-none">You</span>
    </button>
  );
}

function MobileAccountSheet({ user, onLogout }: { user: NostrUser; onLogout: () => void }) {
  const open = useAccountSheetOpen();
  const isAdmin = isAdminPubkey(user.pubkey);
  const { onNavigate, onInvite, onRequestLogout, modals } = useAccountMenu(user, onLogout, closeAccountSheet);

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
            />
          </div>
        </DrawerContent>
      </Drawer>
      {modals}
    </>
  );
}
