import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BrainLogo } from "@/components/BrainLogo";
import {
  X,
  Home,
  Search,
  Users,
  HelpCircle,
  BookOpen,
  Settings as SettingsIcon,
  LogOut,
  Shield,
  LayoutDashboard,
} from "lucide-react";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  currentPath: string;
  navigate: (path: string) => void;
  calcDone?: boolean;
  user: {
    displayName?: string;
    npub: string;
    picture?: string;
    pubkey?: string;
  } | null;
  onLogout: () => void;
  isAdmin?: boolean;
}

const primaryNav = [
  { path: "/dashboard", label: "Dashboard", icon: Home },
  { path: "/search", label: "Search", icon: Search },
  { path: "/network", label: "Network", icon: Users },
  { path: "/panel", label: "My Panel", icon: LayoutDashboard },
];

const helpNav = [
  { path: "/faq", label: "FAQ", icon: HelpCircle },
  { path: "/what-is-wot", label: "What is WoT?", icon: BookOpen },
];

function NavButton({
  item,
  active,
  disabled,
  disabledTitle,
  onClose,
  navigate,
}: {
  item: { path: string; label: string; icon: React.ComponentType<{ className?: string }> };
  active: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  onClose: () => void;
  navigate: (path: string) => void;
}) {
  const Icon = item.icon;
  return (
    <Button
      variant="ghost"
      className={
        "w-full justify-start gap-3 text-[15px] rounded-2xl transition-colors no-default-hover-elevate no-default-active-elevate " +
        (disabled
          ? "font-medium text-slate-500 opacity-40 cursor-not-allowed border border-transparent"
          : active
            ? "font-semibold text-white bg-white/10 border border-white/10 shadow-[0_12px_26px_-18px_rgba(99,102,241,0.35)]"
            : "font-medium text-slate-200/90 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10")
      }
      onClick={() => {
        if (!disabled) {
          onClose();
          if (!active) navigate(item.path);
        }
      }}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      data-testid={`button-mobile-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Icon
        className={
          "h-5 w-5 " +
          (disabled ? "text-slate-500" : active ? "text-indigo-200" : "text-slate-200/80")
        }
      />
      {item.label}
    </Button>
  );
}

export function MobileMenu({
  open,
  onClose,
  currentPath,
  navigate,
  calcDone = true,
  user,
  onLogout,
  isAdmin = false,
}: MobileMenuProps) {
  if (!open) return null;

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." : "";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-50 lg:hidden backdrop-blur-sm"
        onClick={onClose}
        data-testid="overlay-mobile-menu"
      />
      <div
        className="fixed top-0 left-0 bottom-0 w-[84%] max-w-sm z-50 lg:hidden shadow-xl flex flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-950 to-indigo-950"
        data-testid="panel-mobile-menu"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-[#7c86ff]/20 blur-[90px]" />
          <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#333286]/18 blur-[110px]" />
        </div>

        <div className="relative p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)] flex items-center justify-center">
              <BrainLogo size={22} className="text-indigo-200" />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-semibold tracking-[0.22em] uppercase text-indigo-300/80" data-testid="text-mobile-menu-kicker">Brainstorm</p>
              <h2 className="text-lg font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }} data-testid="text-mobile-menu-title">Menu</h2>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-slate-200/80 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
            data-testid="button-close-mobile-menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative flex-1 flex flex-col overflow-y-auto py-4 px-3">
          {user && (
            <>
              <div className="space-y-1.5">
                <p className="px-3 pb-1 text-[10px] font-semibold text-indigo-300/60 uppercase tracking-[0.22em]" data-testid="text-mobile-menu-section-nav">Navigation</p>
                {primaryNav.map((item) => (
                  <NavButton
                    key={item.path}
                    item={item}
                    active={currentPath === item.path}
                    disabled={item.path === "/network" && !calcDone}
                    disabledTitle="Available after calculation completes"
                    onClose={onClose}
                    navigate={navigate}
                  />
                ))}
              </div>

              <div className="my-3 mx-3 border-t border-white/[0.06]" />
            </>
          )}

          <div className="space-y-1.5">
            <p className="px-3 pb-1 text-[10px] font-semibold text-indigo-300/60 uppercase tracking-[0.22em]" data-testid="text-mobile-menu-section-help">Help & Info</p>
            {helpNav.map((item) => (
              <NavButton
                key={item.path}
                item={item}
                active={currentPath === item.path}
                onClose={onClose}
                navigate={navigate}
              />
            ))}
          </div>

          {user && (
            <>
              <div className="my-3 mx-3 border-t border-white/[0.06]" />

              <div className="space-y-1.5 mt-auto">
                <p className="px-3 pb-1 text-[10px] font-semibold text-indigo-300/60 uppercase tracking-[0.22em]" data-testid="text-mobile-menu-section-account">Account</p>
                <NavButton
                  item={{ path: "/settings", label: "Settings", icon: SettingsIcon }}
                  active={currentPath === "/settings"}
                  onClose={onClose}
                  navigate={navigate}
                />
                {isAdmin && (
                  <NavButton
                    item={{ path: "/admin", label: "Admin", icon: Shield }}
                    active={currentPath === "/admin"}
                    onClose={onClose}
                    navigate={navigate}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {user && (
          <div className="relative p-4 border-t border-white/10 bg-white/[0.04]">
            <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
              <Avatar className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)]" data-testid="img-mobile-menu-avatar">
                {user.picture ? (
                  <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" />
                ) : null}
                <AvatarFallback className="rounded-2xl bg-white/5 text-white font-bold text-lg">
                  {(user.displayName?.slice(0, 1) || "U").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate" data-testid="text-mobile-menu-user-label">
                  {user.displayName || "Anonymous"}
                </p>
                <p className="text-xs text-slate-300/70 font-mono truncate" data-testid="text-mobile-menu-user-npub">
                  {truncatedNpub}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-center gap-2 text-red-200 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-red-500/10 border-red-500/30 bg-transparent rounded-2xl"
              onClick={() => {
                onClose();
                onLogout();
              }}
              data-testid="button-mobile-sign-out"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
