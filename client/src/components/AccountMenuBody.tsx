import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  Home,
  Users,
  Copy,
  UserCircle,
  UserPlus,
  HelpCircle,
  BookOpen,
  Settings as SettingsIcon,
  Shield,
  LogOut,
  Plus,
  BadgeCheck,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PovToggle } from "@/components/score/TrustScorePov";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { hasPersistentKey, type NostrUser } from "@/services/nostr";
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

export const NAV_TILES: { key: AppKey; label: string; path: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "home", label: "Search", path: "/", icon: Search },
  { key: "dashboard", label: "Dashboard", path: "/dashboard", icon: Home },
  { key: "network", label: "Network", path: "/network", icon: Users },
];

/**
 * Shared account-menu logic + the modals that must live OUTSIDE the dismissable
 * container (a ShareProfileModal / AlertDialog rendered inside a Popover/Drawer
 * would unmount the moment it closes). Both the desktop popover and the mobile
 * bottom sheet consume this so they stay a single source of truth.
 *
 * `close` dismisses the host surface; navigations/invites fire after it.
 */
export function useAccountMenu(user: NostrUser, onLogout: () => void, close: () => void) {
  const [, navigate] = useLocation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

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

  const inviteUrl = typeof window !== "undefined" && user?.npub ? `${window.location.origin}/p/${user.npub}` : "";

  const onNavigate = (path: string) => { close(); navigate(path); };
  const onInvite = () => { close(); setInviteOpen(true); };
  const onRequestLogout = () => {
    close();
    if (needsBackupBeforeLogout) setLogoutConfirmOpen(true);
    else onLogout();
  };

  const modals: ReactNode = (
    <>
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

  return { onNavigate, onInvite, onRequestLogout, modals };
}

interface AccountMenuBodyProps {
  user: NostrUser;
  isAdmin: boolean;
  active?: AppKey;
  onNavigate: (path: string) => void;
  onInvite: () => void;
  onRequestLogout: () => void;
}

/**
 * The visible account-menu content — identity, primary-destination tiles,
 * grouped links, appearance, admin, and the account switcher. Presentation only;
 * the host (popover on desktop, bottom sheet on mobile) supplies the surface.
 */
export function AccountMenuBody({ user, isAdmin, active, onNavigate, onInvite, onRequestLogout }: AccountMenuBodyProps) {
  const { toast } = useToast();
  // Verified handle for the identity line. A "_@domain" nip05 is a bare-domain
  // identity — show just the domain rather than the placeholder underscore.
  const rawNip05 = user.profile?.nip05?.trim();
  const nip05 = rawNip05 ? rawNip05.replace(/^_@/, "") : "";
  // Same gate every other PovToggle uses: you need a finished calculation
  // before "my perspective" means anything. Without it the control renders as
  // an honest single Brainstorm chip rather than a switch that does nothing.
  const calcDone = (() => {
    try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; }
  })();
  const canPersonalize = !!user.pubkey && calcDone;

  return (
    <div className="relative">
      {/* Identity card */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-3">
          <span className="block rounded-full p-[2px] bg-gradient-to-tr from-brand-deep via-brand-accent to-brand-deep shrink-0">
            <Avatar className="h-11 w-11">
              {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" /> : null}
              <AvatarFallback className="bg-white text-[#0A0E18] font-bold">
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
          onClick={() => onNavigate(`/p/${user.npub}`)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-300/70 dark:border-white/15 bg-white/50 dark:bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-100 transition-colors hover:bg-white/80 dark:hover:bg-white/[0.12] hover:border-brand-accent/40"
          data-testid="dropdown-view-profile"
        >
          <UserCircle className="h-4 w-4" /> View profile
        </button>
      </div>

      {/* Trust perspective — a LENS, not a preference.

          It first shipped down beside Appearance, and that was the wrong shelf:
          a theme changes how the app looks, this changes what every number on
          screen MEANS. Sitting them together as two segmented rows told people
          they were the same kind of choice. It belongs with identity — "whose
          eyes am I looking through" — and above the destination tiles, because
          you pick the lens and then everything you navigate to obeys it.

          Presented exactly like the homepage pill, down to the "What is this?"
          link and the absence of a label. The team's actual confusion was not
          knowing whether the two controls were the same switch; identical
          treatment answers that on sight, and they ARE the same component over
          the same store, so they cannot disagree.

          Same placement on desktop and mobile. A bottom sheet rewards putting
          frequent actions low, but this is set-and-forget — discoverability
          beats reach, and one order means nothing to keep in sync. */}
      {canPersonalize && (
        <div
          className="px-3 pb-3"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <PovToggle canPersonalize avatarUrl={user.picture} className="w-full justify-center" />
          <button
            type="button"
            onClick={() => onNavigate("/personalization")}
            className="mt-1.5 block w-full rounded text-center text-[11px] text-brand-link transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid="menu-pov-learn-more"
          >
            What is this?
          </button>
        </div>
      )}

      {/* Primary destinations as tiles */}
      <div className="grid grid-cols-3 gap-2 px-3 pb-3">
        {NAV_TILES.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onNavigate(t.path)}
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
      </div>

      {/* 8%/10% read as a smudge rather than a rule on this frosted surface,
          especially on a phone where the panel sits over a bright wallpaper.
          ~16% is the point where the line looks deliberate in both themes without
          turning into a hard border. */}
      <div className="mx-3 border-t border-slate-900/[0.16] dark:border-white/[0.16]" />

      {/* Grouped actions — Settings sits under Help & FAQ */}
      <div className="p-1.5">
        <MenuRow icon={UserPlus} label="Invite friends" onClick={onInvite} testId="dropdown-invite" />
        <MenuRow icon={HelpCircle} label="Help & FAQ" onClick={() => onNavigate("/faq")} testId="dropdown-faq" />
        <MenuRow icon={BookOpen} label="What is WoT?" onClick={() => onNavigate("/what-is-wot")} testId="dropdown-wot" />
        <MenuRow icon={SettingsIcon} label="Settings" onClick={() => onNavigate("/settings")} testId="dropdown-settings" />
      </div>

      {/* Appearance — compact full-width segmented row */}
      <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Appearance</p>
        <ThemeToggle size="sm" className="w-full" />
      </div>

      {isAdmin && (
        <div className="px-3 pb-2 pt-1">
          <button
            type="button"
            onClick={() => onNavigate("/admin")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover"
            data-testid="dropdown-admin"
          >
            <Shield className="h-4 w-4" /> Admin Dashboard
          </button>
        </div>
      )}

      {/* 8%/10% read as a smudge rather than a rule on this frosted surface,
          especially on a phone where the panel sits over a bright wallpaper.
          ~16% is the point where the line looks deliberate in both themes without
          turning into a hard border. */}
      <div className="mx-3 border-t border-slate-900/[0.16] dark:border-white/[0.16]" />

      {/* Account switcher + sign out */}
      <div className="p-1.5">
        <MenuRow icon={Plus} label="Add another account" onClick={() => onNavigate("/login?add=1")} testId="dropdown-add-account" />
        <MenuRow icon={LogOut} label="Sign out" onClick={onRequestLogout} tone="danger" testId="dropdown-logout" />
      </div>
    </div>
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
  tone?: "default" | "danger";
  testId?: string;
}) {
  const toneCls =
    tone === "danger"
      ? "text-red-600 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/15"
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
