import { useEffect } from "react";
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
  UserCircle,
} from "lucide-react";
import { AgentIcon } from "@/components/AgentIcon";
import { PricingIcon } from "@/components/PricingIcon";
import { SignInButton } from "@/components/SignInButton";
import { FEATURES } from "@/config/featureFlags";

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
  { path: "/", label: "Search", icon: Search },
  { path: "/dashboard", label: "Dashboard", icon: Home },
  { path: "/network", label: "Network", icon: Users },
  ...(FEATURES.agentSuite
    ? [{ path: "/agentsuite", label: "Agent Suite", icon: AgentIcon, special: true }]
    : []),
];

// Help / commerce links shown in the mobile menu's secondary section.
const helpNav = [
  { path: "/pricing", label: "Pricing", icon: PricingIcon },
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
  item: { path: string; label: string; icon: React.ComponentType<{ className?: string }>; special?: boolean };
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
          ? "font-medium text-slate-400 opacity-50 cursor-not-allowed border border-transparent"
          : active
            ? "font-semibold text-[#3730a3] bg-indigo-50 border border-indigo-100"
            : "font-medium text-slate-700 hover:text-[#3730a3] hover:bg-slate-50 border border-transparent")
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
          (disabled ? "text-slate-300" : active ? "text-[#6366f1]" : "text-slate-400")
        }
      />
      {item.special ? (
        <span className="bg-gradient-to-r from-[#6366f1] to-[#7c86ff] bg-clip-text font-semibold text-transparent">{item.label}</span>
      ) : item.label}
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
  // Lock body scroll while open (prevents iOS Safari scroll stutter behind the
  // drawer) and close on Escape. The drawer stays mounted and slides via a
  // GPU-composited transform so Safari never repaints layout on open/close.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const truncatedNpub = user ? user.npub.slice(0, 12) + "..." : "";

  return (
    <>
      <div
        className={
          "fixed inset-0 z-50 bg-slate-900/40 transition-opacity duration-300 lg:hidden " +
          (open ? "opacity-100" : "pointer-events-none opacity-0")
        }
        onClick={onClose}
        aria-hidden="true"
        data-testid="overlay-mobile-menu"
      />
      <div
        className={
          "fixed left-0 top-0 bottom-0 z-50 flex w-[86%] max-w-xs flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl shadow-slate-900/10 [transition:transform_300ms_cubic-bezier(0.4,0,0.2,1)] [will-change:transform] lg:hidden " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        data-testid="panel-mobile-menu"
      >
        {/* Soft light gloss wash — matches the app's glossy-light language. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(460px 460px at 115% -8%, rgba(99,102,241,0.08), transparent 62%), radial-gradient(520px 520px at -12% 112%, rgba(124,134,255,0.07), transparent 62%)",
          }}
        />

        <div
          className="relative flex items-center justify-between border-b border-slate-200/70 px-4 pb-4"
          style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-indigo-50">
              <BrainLogo size={22} className="text-indigo-500" />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.22em] text-slate-400" data-testid="text-mobile-menu-kicker">Menu</p>
              <h2 className="font-brand text-lg font-bold tracking-tight text-indigo-500" data-testid="text-mobile-menu-title">Brainstorm</h2>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:bg-slate-100 hover:text-slate-700"
            data-testid="button-close-mobile-menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative flex flex-1 flex-col overflow-y-auto px-3 py-4">
          {!user && (
            <>
              <div className="space-y-1.5">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400" data-testid="text-mobile-menu-section-nav-public">Navigation</p>
                <NavButton
                  item={{ path: "/", label: "Search", icon: Search }}
                  active={currentPath === "/"}
                  onClose={onClose}
                  navigate={navigate}
                />
              </div>

              <div className="my-3 mx-3 border-t border-slate-200/70" />
            </>
          )}

          {user && (
            <>
              <div className="space-y-1.5">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400" data-testid="text-mobile-menu-section-nav">Navigation</p>
                {primaryNav.map((item) => (
                  <NavButton
                    key={item.path}
                    item={item}
                    active={currentPath === item.path}
                    onClose={onClose}
                    navigate={navigate}
                  />
                ))}
              </div>

              <div className="my-3 mx-3 border-t border-slate-200/70" />
            </>
          )}

          <div className="space-y-1.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400" data-testid="text-mobile-menu-section-help">Help & Info</p>
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
              <div className="my-3 mx-3 border-t border-slate-200/70" />

              <div className="space-y-1.5 mt-auto">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400" data-testid="text-mobile-menu-section-account">Account</p>
                <NavButton
                  item={{ path: `/profile/${user.npub}`, label: "View profile", icon: UserCircle }}
                  active={false}
                  onClose={onClose}
                  navigate={navigate}
                />
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
          <div
            className="relative border-t border-slate-200 bg-slate-50/70 px-4 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center gap-3 mb-4" data-testid="row-mobile-menu-user">
              <Avatar className="h-10 w-10 rounded-2xl border border-slate-200 bg-white" data-testid="img-mobile-menu-avatar">
                {user.picture ? (
                  <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" />
                ) : null}
                <AvatarFallback className="rounded-2xl bg-indigo-50 text-[#6366f1] font-bold text-lg">
                  {(user.displayName?.slice(0, 1) || "U").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate" data-testid="text-mobile-menu-user-label">
                  {user.displayName || "Anonymous"}
                </p>
                <p className="text-xs text-slate-400 font-mono truncate" data-testid="text-mobile-menu-user-npub">
                  {truncatedNpub}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-center gap-2 rounded-2xl border-red-200 bg-white text-red-600 no-default-hover-elevate no-default-active-elevate hover:border-red-300 hover:bg-red-50 hover:text-red-700"
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

        {!user && (
          <div
            className="relative border-t border-slate-200 bg-slate-50/70 px-4 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <p className="text-xs text-slate-500 mb-3 leading-relaxed" data-testid="text-mobile-menu-signin-hint">
              Sign in with your Nostr extension to unlock your personalized Web of Trust and account tools.
            </p>
            <SignInButton
              variant="primary"
              className="w-full"
              onSuccess={onClose}
              data-testid="button-mobile-sign-in"
            />
          </div>
        )}
      </div>
    </>
  );
}
