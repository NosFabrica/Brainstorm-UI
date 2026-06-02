import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Menu,
  LogOut,
  Settings as SettingsIcon,
  HelpCircle,
  Shield,
  Copy,
} from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { openMobileMenu } from "@/lib/mobileMenuStore";
import { PovBadge } from "@/components/PovBadge";
import { AdminBadge } from "@/components/AdminBadge";
import { AppsLauncher, type AppKey } from "@/components/AppsLauncher";
import { isAdminPubkey } from "@/config/adminAccess";
import { useToast } from "@/hooks/use-toast";
import type { NostrUser } from "@/services/nostr";

interface AppHeaderProps {
  user: NostrUser;
  onLogout: () => void;
  calcDone?: boolean;
  active?: AppKey;
}

/**
 * Single shared top navigation used by every authenticated page. Replaces the
 * per-page hand-rolled <nav> tab bars. Desktop navigation is driven by the
 * Google-style apps launcher (waffle); mobile uses the hamburger -> MobileMenu.
 */
export function AppHeader({ user, onLogout, calcDone = false, active }: AppHeaderProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isAdmin = isAdminPubkey(user?.pubkey);

  return (
    <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-app-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="lg:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={openMobileMenu}
                className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                data-testid="button-open-mobile-menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            <button
              type="button"
              className="flex items-center gap-2 min-w-0"
              onClick={() => navigate("/")}
              data-testid="button-app-brand"
            >
              <BrainLogo size={28} className="text-indigo-500 shrink-0" />
              <span
                className="text-lg sm:text-xl font-bold tracking-tight text-white"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-logo"
              >
                Brainstorm
              </span>
            </button>

            <div className="hidden lg:flex items-center pl-1">
              <AppsLauncher user={user} calcDone={calcDone} active={active} />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {isAdmin && <AdminBadge />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5"
                  data-testid="button-user-menu"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md" data-testid="img-user-avatar">
                      {user.picture ? (
                        <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                        {user.displayName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <PovBadge user={user} />
                  </div>
                  <div className="hidden md:flex flex-col items-start mr-2" data-testid="text-user-meta">
                    <span className="text-sm font-bold text-white leading-none mb-0.5" data-testid="text-user-name">
                      {user.displayName || "Anon"}
                    </span>
                    <span className="text-[10px] text-indigo-300 font-mono leading-none" data-testid="text-user-npub">
                      {user.npub.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 bg-white/95 backdrop-blur-xl border-indigo-500/20" data-testid="menu-user">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none text-slate-900" data-testid="text-menu-name">
                      {user.displayName || "Anonymous"}
                    </p>
                    <button
                      className="flex items-center gap-1 text-xs leading-none text-slate-500 hover:text-indigo-600 transition-colors"
                      onClick={() => {
                        navigator.clipboard.writeText(user.npub);
                        toast({ title: "Copied!", description: "npub copied to clipboard" });
                      }}
                      data-testid="button-copy-npub"
                    >
                      <span data-testid="text-menu-npub">{user.npub.slice(0, 16)}...</span>
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-indigo-100" />
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/faq")} data-testid="dropdown-faq">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  <span>FAQ</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem
                    className="cursor-pointer text-amber-700 focus:bg-amber-50 focus:text-amber-800"
                    onClick={() => navigate("/admin")}
                    data-testid="dropdown-admin"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    <span>Admin Dashboard</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-indigo-100" />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                  onClick={onLogout}
                  data-testid="dropdown-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
