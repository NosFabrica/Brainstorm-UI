import { useLocation } from "wouter";
import { Copy, HelpCircle, Home, LogOut, Search, Settings as SettingsIcon, Shield, Users } from "lucide-react";
import { AdminBadge } from "@/components/AdminBadge";
import { AgentIcon } from "@/components/AgentIcon";
import { BrainLogo } from "@/components/BrainLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AccountDisplay } from "@/accounts/display";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";

/** The Agent Suite's own dark nav: brand, the app's sections, and the account menu. */
export function AgentSuiteNav({
  widthClassName,
  user,
  calcDone,
  handleLogout,
}: {
  /** The page's wide column (the page owns its width, lib/pageWidth). */
  widthClassName: string;
  user: AccountDisplay;
  calcDone: boolean;
  handleLogout: () => void;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950" data-testid="nav-agentsuite">
      <div className={widthClassName}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <button
              type="button"
              className="flex min-w-0 items-center gap-3 lg:hidden"
              onClick={() => navigate("/dashboard")}
              data-testid="button-agentsuite-mobile-brand"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.8)]">
                <BrainLogo size={20} className="text-brand-link" />
              </div>
              <div className="min-w-0 text-left leading-tight">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-link">Brainstorm</p>
                <p
                  className="bg-gradient-to-r from-brand-accent to-brand-primary bg-clip-text text-sm font-bold text-transparent"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Agent Suite
                </p>
              </div>
            </button>

            <button
              type="button"
              className="hidden items-center gap-2 lg:flex"
              onClick={() => navigate("/dashboard")}
              data-testid="button-desktop-brand"
            >
              <BrainLogo size={28} className="text-brand-primary" />
              <span
                className="text-lg font-bold tracking-tight text-white sm:text-xl"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="text-logo"
              >
                Brainstorm
              </span>
            </button>

            <div className="hidden gap-1 lg:flex" data-testid="nav-agentsuite-tabs">
              <Button
                variant="ghost"
                size="sm"
                className="no-default-hover-elevate no-default-active-elevate gap-2 rounded-md text-slate-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
                onClick={() => navigate("/dashboard")}
                data-testid="button-nav-dashboard"
              >
                <Home className="h-4 w-4" /> Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="no-default-hover-elevate no-default-active-elevate gap-2 rounded-md text-slate-400 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
                onClick={() => navigate("/")}
                data-testid="button-nav-search"
              >
                <Search className="h-4 w-4" /> Search
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`no-default-hover-elevate no-default-active-elevate gap-2 rounded-md transition-all duration-200 ${calcDone ? "text-slate-400 hover:bg-white/[0.06] hover:text-white" : "cursor-not-allowed text-slate-600 opacity-40"}`}
                onClick={() => calcDone && navigate("/network")}
                disabled={!calcDone}
                data-testid="button-nav-network"
              >
                <Users className="h-4 w-4" /> Network
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="no-default-hover-elevate no-default-active-elevate gap-2 rounded-md text-white transition-all duration-200"
                data-testid="button-nav-agentsuite"
              >
                <AgentIcon className="h-4 w-4" />{" "}
                <span className="bg-gradient-to-r from-brand-accent to-brand-primary bg-clip-text text-transparent">
                  Agent Suite
                </span>
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {user?.isAdmin && <AdminBadge />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  className="flex cursor-pointer items-center gap-3 rounded-full p-1 transition-opacity hover:bg-white/5 hover:opacity-80"
                  data-testid="button-agentsuite-profile-menu"
                >
                  <div className="relative shrink-0">
                    <Avatar
                      className="h-9 w-9 border-2 border-white shadow-md ring-2 ring-white/20"
                      data-testid="img-agentsuite-avatar"
                    >
                      {user.picture ? (
                        <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="bg-brand-primary/15 font-bold text-brand-primary">
                        {user.displayName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="mr-2 hidden flex-col items-start md:flex">
                    <span
                      className="mb-0.5 text-sm font-bold leading-none text-white"
                      data-testid="text-agentsuite-profile-name"
                    >
                      {user.displayName || "Anon"}
                    </span>
                    <span
                      className="font-mono text-[10px] leading-none text-brand-link"
                      data-testid="text-agentsuite-profile-npub"
                    >
                      {user.npub.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-72 border-brand-primary/20 bg-white/95 backdrop-blur-xl dark:bg-slate-900/95"
              >
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none text-slate-900 dark:text-slate-100">
                      {user.displayName || "Anon"}
                    </p>
                    <button
                      className="flex items-center gap-1 text-xs leading-none text-slate-500 transition-colors hover:text-brand-primary dark:text-slate-400"
                      onClick={() => {
                        copyToClipboard(user.npub);
                        toast({ title: "Copied!", description: "npub copied to clipboard" });
                      }}
                      data-testid="button-copy-npub"
                    >
                      <span>{user.npub.slice(0, 16)}...</span>
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-brand-primary/15" />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => navigate("/faq")}
                  data-testid="dropdown-faq"
                >
                  <HelpCircle className="mr-2 h-4 w-4" /> <span>FAQ</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => navigate("/settings")}
                  data-testid="dropdown-settings"
                >
                  <SettingsIcon className="mr-2 h-4 w-4" /> <span>Settings</span>
                </DropdownMenuItem>
                {user?.isAdmin && (
                  <DropdownMenuItem
                    className="cursor-pointer text-amber-700 focus:bg-amber-50 focus:text-amber-800"
                    onClick={() => navigate("/admin")}
                    data-testid="dropdown-admin"
                  >
                    <Shield className="mr-2 h-4 w-4" /> <span>Admin Dashboard</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-brand-primary/15" />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                  onClick={handleLogout}
                  data-testid="dropdown-signout"
                >
                  <LogOut className="mr-2 h-4 w-4" /> <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
