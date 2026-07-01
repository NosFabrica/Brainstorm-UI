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
  UserCircle,
  Share2,
  UserPlus,
} from "lucide-react";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { copyToClipboard } from "@/lib/clipboard";
import { BrainLogo } from "@/components/BrainLogo";
import { openMobileMenu } from "@/lib/mobileMenuStore";
import { AdminBadge } from "@/components/AdminBadge";
import { AppsLauncher, type AppKey } from "@/components/AppsLauncher";
import { isAdminPubkey } from "@/config/adminAccess";
import { useToast } from "@/hooks/use-toast";
import { hasPersistentKey, type NostrUser } from "@/services/nostr";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { type ReactNode, useState } from "react";

interface AppHeaderProps {
  user: NostrUser;
  onLogout: () => void;
  calcDone?: boolean;
  active?: AppKey;
  /**
   * Optional page-level controls (e.g. a Why/How mode toggle) rendered inline in
   * the header's right cluster on desktop. Hidden on mobile (`lg:` breakpoint) so
   * pages can surface the same control in a dedicated mobile row instead.
   */
  actions?: ReactNode;
  /**
   * Visual treatment. "dark" (default) is the sticky slate banner used by the
   * dense app pages. "light" is a transparent header for the airy search
   * experience (search-first home `/`) so it matches the signed-out look.
   */
  variant?: "dark" | "light";
}

/**
 * Single shared top navigation used by every authenticated page. Replaces the
 * per-page hand-rolled <nav> tab bars. Desktop navigation is driven by the
 * Google-style apps launcher (waffle); mobile uses the hamburger -> MobileMenu.
 */
export function AppHeader({ user, onLogout, calcDone = false, active, variant = "dark", actions }: AppHeaderProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const isAdmin = isAdminPubkey(user?.pubkey);
  const isLight = variant === "light";
  const inviteUrl = typeof window !== "undefined" && user?.npub ? `${window.location.origin}/p/${user.npub}` : "";

  // Your own house Web-of-Trust score for the invite card — fetched only when the
  // invite sheet opens (cached). Sharing your trust standing is a credible flex.
  const houseScoreQuery = useQuery({
    queryKey: ["self-house-influence", user?.pubkey],
    queryFn: () => (user?.pubkey ? apiClient.getHouseInfluence(user.pubkey) : null),
    enabled: !!user?.pubkey && inviteOpen,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // In-app accounts hold their key locally, so signing out without a backup means
  // the account is unrecoverable. Only intercept those (extension/nsec users keep
  // their key elsewhere). The backup flag is set by the post-signup backup flow.
  const backedUp = (() => {
    try { return !user?.pubkey || localStorage.getItem(`brainstorm_backup_done:${user.pubkey}`) === "true"; }
    catch { return true; }
  })();
  const needsBackupBeforeLogout = hasPersistentKey() && !backedUp;
  const requestLogout = () => {
    if (needsBackupBeforeLogout) setLogoutConfirmOpen(true);
    else onLogout();
  };

  return (
    <nav
      className={
        isLight
          ? "relative z-20"
          : "bg-slate-950 border-b border-white/10 sticky top-0 z-50"
      }
      data-testid="nav-app-header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="lg:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={openMobileMenu}
                className={
                  isLight
                    ? "text-slate-500 no-default-hover-elevate no-default-active-elevate hover:text-indigo-600 hover:bg-slate-900/5"
                    : "text-slate-400 no-default-hover-elevate no-default-active-elevate hover:text-white hover:bg-white/10"
                }
                data-testid="button-open-mobile-menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            {isLight ? (
              <button
                type="button"
                className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                onClick={() => navigate("/about")}
                data-testid="link-about"
              >
                About
              </button>
            ) : (
              <button
                type="button"
                className="flex items-center gap-2 min-w-0"
                onClick={() => navigate("/")}
                data-testid="button-app-brand"
              >
                <BrainLogo size={28} clickable className="text-indigo-500 shrink-0" />
                <span
                  className="font-brand text-lg sm:text-xl font-bold tracking-tight text-white"
                  data-testid="text-logo"
                >
                  Brainstorm
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {actions && <div className="hidden lg:flex items-center mr-1">{actions}</div>}
            {isAdmin && <AdminBadge />}
            <div className="hidden lg:flex items-center">
              <AppsLauncher user={user} calcDone={calcDone} active={active} variant={variant} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  className={
                    "group flex items-center gap-3 cursor-pointer transition-all p-1 rounded-full " +
                    (isLight ? "hover:bg-slate-900/5" : "hover:bg-white/5")
                  }
                  data-testid="button-user-menu"
                >
                  <div className="relative shrink-0">
                    <div className="rounded-full p-[2px] bg-gradient-to-tr from-[#333286] via-[#7c86ff] to-[#333286] shadow-[0_0_0_1px_rgba(99,102,241,0.15)] transition-all duration-300 group-hover:from-[#3730a3] group-hover:via-[#7c86ff] group-hover:to-[#3730a3] group-hover:shadow-[0_0_16px_2px_rgba(124,134,255,0.5)]">
                      <div className={"rounded-full p-[1.5px] " + (isLight ? "bg-[#F8FAFC]" : "bg-slate-950")}>
                        <Avatar className="h-9 w-9 shadow-sm" data-testid="img-user-avatar">
                          {user.picture ? (
                            <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" />
                          ) : null}
                          <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                            {user.displayName?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:flex flex-col items-start mr-2" data-testid="text-user-meta">
                    <span
                      className={
                        "text-sm font-bold leading-none mb-0.5 " +
                        (isLight ? "text-slate-900" : "text-white")
                      }
                      data-testid="text-user-name"
                    >
                      {user.displayName || "Anon"}
                    </span>
                    <span
                      className={
                        "text-[10px] font-mono leading-none " +
                        (isLight ? "text-indigo-500" : "text-indigo-300")
                      }
                      data-testid="text-user-npub"
                    >
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
                      onClick={async () => {
                        await copyToClipboard(user.npub);
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
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/profile/${user.npub}`)} data-testid="dropdown-view-profile">
                  <UserCircle className="mr-2 h-4 w-4" />
                  <span>View profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate(`/p/${user.npub}`)} data-testid="dropdown-share-profile">
                  <Share2 className="mr-2 h-4 w-4" />
                  <span>Share profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => setInviteOpen(true)} data-testid="dropdown-invite">
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span>Invite friends</span>
                </DropdownMenuItem>
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
                  onClick={requestLogout}
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

      <ShareProfileModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        invite
        npub={user.npub}
        displayName={user.displayName || "You"}
        picture={user.picture}
        nip05={user.profile?.nip05}
        canonicalUrl={inviteUrl}
        score01={typeof houseScoreQuery.data === "number" ? houseScoreQuery.data : null}
      />

      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent data-testid="logout-backup-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Save a backup before you sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              This account lives in this browser. Without a backup file you can't sign back in
              here or anywhere else — and it can't be recovered. It takes a few seconds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="text-red-600 hover:text-red-700"
              onClick={() => { setLogoutConfirmOpen(false); onLogout(); }}
              data-testid="logout-anyway"
            >
              Sign out anyway
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setLogoutConfirmOpen(false); navigate("/settings?tab=profile&focus=backup"); }}
              data-testid="logout-save-backup"
            >
              Save backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
