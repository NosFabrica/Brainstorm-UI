import { useState } from "react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  Home,
  Users,
  Copy,
  UserCircle,
  UserPlus,
  HelpCircle,
  Settings as SettingsIcon,
  Shield,
  LogOut,
  Plus,
  LayoutGrid,
  BadgeCheck,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { isAdminPubkey } from "@/config/adminAccess";
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
import type { AppKey } from "@/components/AppsLauncher";

interface AccountMenuProps {
  user: NostrUser;
  onLogout: () => void;
  /** Highlights the matching nav tile (Search/Dashboard/Network). */
  active?: AppKey;
}

const NAV_TILES: { key: AppKey; label: string; path: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "home", label: "Search", path: "/", icon: Search },
  { key: "dashboard", label: "Dashboard", path: "/dashboard", icon: Home },
  { key: "network", label: "Network", path: "/network", icon: Users },
];

/**
 * Shared account panel (avatar → dropdown) used by every header. Google-style:
 * an identity card, the primary destinations as a tile row, then grouped
 * actions, appearance, and an account switcher. Structured to hold multiple
 * signed-in identities later — for now it lists the current account plus an
 * "Add another account" entry.
 */
export function AccountMenu({ user, onLogout, active }: AccountMenuProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const isAdmin = isAdminPubkey(user?.pubkey);
  const inviteUrl = typeof window !== "undefined" && user?.npub ? `${window.location.origin}/p/${user.npub}` : "";
  // Verified handle for the identity line. A "_@domain" nip05 is a bare-domain
  // identity — show just the domain rather than the placeholder underscore.
  const rawNip05 = user.profile?.nip05?.trim();
  const nip05 = rawNip05 ? rawNip05.replace(/^_@/, "") : "";

  // Own house Web-of-Trust score for the invite card — fetched lazily when the
  // invite sheet opens (cached). Sharing your standing is a credible flex.
  const houseScoreQuery = useQuery({
    queryKey: ["self-house-influence", user?.pubkey],
    queryFn: () => (user?.pubkey ? apiClient.getHouseInfluence(user.pubkey) : null),
    enabled: !!user?.pubkey && inviteOpen,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // In-app accounts hold their key locally; signing out without a backup makes
  // the account unrecoverable. Only intercept those (extension/nsec users keep
  // their key elsewhere).
  const backedUp = (() => {
    try { return !user?.pubkey || localStorage.getItem(`brainstorm_backup_done:${user.pubkey}`) === "true"; }
    catch { return true; }
  })();
  const needsBackupBeforeLogout = hasPersistentKey() && !backedUp;
  const requestLogout = () => {
    setOpen(false);
    if (needsBackupBeforeLogout) setLogoutConfirmOpen(true);
    else onLogout();
  };

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="group shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
            data-testid="button-user-menu"
          >
            <span className="block rounded-full p-[2px] bg-gradient-to-tr from-brand-deep via-brand-accent to-brand-deep shadow-[0_0_0_1px_rgb(var(--brand-primary)/0.15)] transition-all duration-300 group-hover:from-brand-link group-hover:via-brand-accent group-hover:to-brand-link group-hover:shadow-[0_0_16px_2px_rgb(var(--brand-accent)/0.5)]">
              <Avatar className="h-9 w-9" data-testid="img-user-avatar">
                {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" /> : null}
                <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                  {user.displayName?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="relative w-[360px] p-0 overflow-hidden rounded-2xl border border-brand-accent/25 dark:border-white/10 bg-white/[0.82] dark:bg-slate-950/[0.85] backdrop-blur-xl backdrop-saturate-150 shadow-[0_16px_50px_rgba(20,18,45,0.22)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.55)]"
          data-testid="menu-user"
        >
          {/* Soft brand-tint wash over the frosted surface (deep → cyan). */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-deep/[0.05] to-brand-accent/[0.07]" />

          <div className="relative">
            {/* Identity card */}
            <div className="p-4 pb-3">
              <div className="flex items-center gap-3">
                <span className="block rounded-full p-[2px] bg-gradient-to-tr from-brand-deep via-brand-accent to-brand-deep shrink-0">
                  <Avatar className="h-11 w-11">
                    {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" /> : null}
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                      {user.displayName?.charAt(0)?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100" data-testid="text-menu-name">
                    {user.displayName || "Anonymous"}
                  </p>
                  {nip05 && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300" data-testid="text-menu-nip05">
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-brand-link" />
                      <span className="truncate">{nip05}</span>
                    </p>
                  )}
                  <button
                    type="button"
                    className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 transition-colors hover:text-brand-deep dark:hover:text-brand-link"
                    onClick={async () => {
                      await copyToClipboard(user.npub);
                      toast({ title: "Copied!", description: "npub copied to clipboard" });
                    }}
                    data-testid="button-copy-npub"
                  >
                    <span className="font-mono" data-testid="text-menu-npub">{user.npub.slice(0, 14)}…</span>
                    <Copy className="h-3 w-3 shrink-0" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => go(`/p/${user.npub}`)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-300/70 dark:border-white/15 bg-white/50 dark:bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-100 transition-colors hover:bg-white/80 dark:hover:bg-white/[0.12] hover:border-brand-accent/40"
                data-testid="dropdown-view-profile"
              >
                <UserCircle className="h-4 w-4" /> View profile
              </button>
            </div>

            {/* Primary destinations as tiles + a teased "Apps" slot */}
            <div className="grid grid-cols-4 gap-2 px-3 pb-3">
              {NAV_TILES.map((t) => {
                const Icon = t.icon;
                const isActive = active === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => go(t.path)}
                    className={
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50 " +
                      (isActive
                        ? "border-brand-accent/40 bg-brand-primary/[0.10] dark:bg-brand-primary/25 ring-1 ring-inset ring-brand-primary/25"
                        : "border-white/60 dark:border-white/10 bg-white/[0.55] dark:bg-white/[0.06] hover:bg-white/80 dark:hover:bg-white/[0.12]")
                    }
                    data-testid={`account-nav-${t.key}`}
                  >
                    <Icon className={"h-5 w-5 " + (isActive ? "text-brand-primary dark:text-brand-link" : "text-slate-500 dark:text-slate-300")} />
                    <span className={"text-[11px] font-medium leading-none " + (isActive ? "text-brand-deep dark:text-brand-link" : "text-slate-600 dark:text-slate-200")}>
                      {t.label}
                    </span>
                  </button>
                );
              })}

              {/* Apps — teased (product apps aren't live yet). Non-interactive; a
                  "Soon" pill sets expectations without a dead-end click. */}
              <div
                className="relative flex cursor-default flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/60 dark:border-white/10 px-2 py-3 text-center"
                title="Brainstorm apps — coming soon"
                aria-disabled="true"
                data-testid="account-nav-apps"
              >
                <LayoutGrid className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                <span className="text-[11px] font-medium leading-none text-slate-400 dark:text-slate-500">Apps</span>
                <span className="absolute right-1 top-1 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase leading-none tracking-wide text-brand-deep dark:text-brand-link">
                  Soon
                </span>
              </div>
            </div>

            <div className="mx-3 border-t border-slate-900/[0.08] dark:border-white/10" />

            {/* Grouped actions */}
            <div className="p-1.5">
              <MenuRow icon={UserPlus} label="Invite friends" onClick={() => { setOpen(false); setInviteOpen(true); }} testId="dropdown-invite" />
              <MenuRow icon={SettingsIcon} label="Settings" onClick={() => go("/settings")} testId="dropdown-settings" />
              <MenuRow icon={HelpCircle} label="Help & FAQ" onClick={() => go("/faq")} testId="dropdown-faq" />
            </div>

            {/* Appearance — stacked tiles, selected one filled in brand color */}
            <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Appearance</p>
              <ThemeToggle layout="stack" />
            </div>

            {isAdmin && (
              <div className="px-3 pb-2 pt-1">
                <button
                  type="button"
                  onClick={() => go("/admin")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover"
                  data-testid="dropdown-admin"
                >
                  <Shield className="h-4 w-4" /> Admin Dashboard
                </button>
              </div>
            )}

            <div className="mx-3 border-t border-slate-900/[0.08] dark:border-white/10" />

            {/* Account switcher + sign out */}
            <div className="p-1.5">
              <MenuRow icon={Plus} label="Add another account" onClick={() => go("/login?add=1")} testId="dropdown-add-account" />
              <MenuRow icon={LogOut} label="Sign out" onClick={requestLogout} tone="danger" testId="dropdown-logout" />
            </div>
          </div>
        </PopoverContent>
      </Popover>

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
    </>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
  tone = "default",
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger" | "admin";
  testId?: string;
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-600 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/15"
      : tone === "admin"
        ? "text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 dark:hover:bg-amber-500/15"
        : "text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/[0.08]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 " + toneCls}
      data-testid={testId}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}
