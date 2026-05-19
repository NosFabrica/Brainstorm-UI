import { useState } from "react";
import { useLocation } from "wouter";
import {
  Menu,
  Home,
  Search,
  Users,
  HelpCircle,
  Settings as SettingsIcon,
  LogOut,
  Shield,
  Copy,
  ArrowLeft,
  Sparkles,
  Receipt,
} from "lucide-react";
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
import { logout, type NostrUser } from "@/services/nostr";
import { useToast } from "@/hooks/use-toast";
import { isAdminPubkey } from "@/config/adminAccess";
import { AdminBadge } from "@/components/AdminBadge";
import { BrainLogo } from "@/components/BrainLogo";
import { MobileMenu } from "@/components/MobileMenu";

interface CommerceNavProps {
  user: NostrUser | null;
  pageTitle: string;
}

export function CommerceNav({ user, pageTitle }: CommerceNavProps) {
  const [location, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { toast } = useToast();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <>
      <nav className="bg-slate-950 border-b border-white/10 sticky top-0 z-50" data-testid="nav-commerce">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <div className="lg:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(true)}
                  className="text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                  data-testid="button-open-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>

              <button
                type="button"
                className="flex items-center gap-2 min-w-0"
                onClick={() => navigate(user ? "/dashboard" : "/")}
                data-testid="button-commerce-brand"
              >
                <BrainLogo size={28} className="text-indigo-500" />
                <span
                  className="text-lg sm:text-xl font-bold tracking-tight text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                  data-testid="text-logo"
                >
                  Brainstorm
                </span>
              </button>

              {pageTitle && (
                <span
                  className="hidden sm:inline-flex items-center text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80 border-l border-white/10 pl-3 sm:pl-4"
                  data-testid="text-commerce-page-title"
                >
                  {pageTitle}
                </span>
              )}

              {user && (
                <div className="hidden lg:flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06]"
                    onClick={() => navigate("/dashboard")}
                    data-testid="button-nav-dashboard"
                  >
                    <Home className="h-4 w-4" />
                    Dashboard
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06]"
                    onClick={() => navigate("/search")}
                    data-testid="button-nav-search"
                  >
                    <Search className="h-4 w-4" />
                    Search
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-slate-400 rounded-md no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/[0.06]"
                    onClick={() => navigate("/network")}
                    data-testid="button-nav-network"
                  >
                    <Users className="h-4 w-4" />
                    Network
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {user && isAdminPubkey(user?.pubkey) && <AdminBadge />}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div
                      className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity p-1 rounded-full hover:bg-white/5"
                      data-testid="button-user-menu"
                    >
                      <Avatar className="h-9 w-9 border-2 border-white ring-2 ring-white/20 shadow-md">
                        {user.picture ? (
                          <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" />
                        ) : null}
                        <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                          {user.displayName?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="hidden md:flex flex-col items-start mr-2">
                        <span className="text-sm font-bold text-white leading-none mb-0.5">
                          {user.displayName || "Anon"}
                        </span>
                        <span className="text-[10px] text-indigo-300 font-mono leading-none">
                          {user.npub.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-56 bg-white/95 backdrop-blur-xl border-[#7c86ff]/20"
                  >
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none text-slate-900">
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
                          <span>{user.npub.slice(0, 16)}...</span>
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/pricing")} data-testid="dropdown-pricing">
                      <Sparkles className="mr-2 h-4 w-4" />
                      <span>Pricing</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/billing")} data-testid="dropdown-billing">
                      <Receipt className="mr-2 h-4 w-4" />
                      <span>Billing</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/faq")} data-testid="dropdown-faq">
                      <HelpCircle className="mr-2 h-4 w-4" />
                      <span>FAQ</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/settings")} data-testid="dropdown-settings">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                    {isAdminPubkey(user?.pubkey) && (
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
                      onClick={handleLogout}
                      data-testid="dropdown-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-slate-300 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                      data-testid="button-unauth-menu"
                    >
                      <Menu className="h-4 w-4" />
                      Menu
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-52 bg-white/95 backdrop-blur-xl border-[#7c86ff]/20"
                  >
                    <DropdownMenuLabel className="text-xs text-slate-500">Browse</DropdownMenuLabel>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/pricing")} data-testid="dropdown-pricing-unauth">
                      <Sparkles className="mr-2 h-4 w-4" />
                      <span>Pricing</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/faq")} data-testid="dropdown-faq-unauth">
                      <HelpCircle className="mr-2 h-4 w-4" />
                      <span>FAQ</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-indigo-100" />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/")} data-testid="dropdown-back-home">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      <span>Back to home</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>
      </nav>

      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        currentPath={location}
        navigate={navigate}
        user={user}
        onLogout={handleLogout}
        isAdmin={isAdminPubkey(user?.pubkey)}
      />
    </>
  );
}
