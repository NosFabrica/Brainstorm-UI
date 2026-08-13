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
  Settings as SettingsIcon,
  Shield,
  LogOut,
  ChevronRight,
  BadgeCheck,
  Tag as TagIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PovToggle } from "@/components/score/TrustScorePov";
import { ShareProfileModal } from "@/components/ShareProfileModal";
import { AccountSwitcher } from "@/components/AccountSwitcherPane";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { removeAccountFromDevice } from "@/accounts/login-flow";
import { isUnbackedUp } from "@/accounts/picker";
import type { BrainstormAccount } from "@/accounts/metadata";
import type { AccountDisplay } from "@/accounts/display";
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

/**
 * Where "add another account" goes. Adding one is an errand, not a destination, so
 * the login page is told where to put them back — and `?add=1` is what stops it
 * bouncing a signed-in arrival straight home before they get there.
 */
function addAccountPath(): string {
  const here = typeof window === "undefined" ? "" : window.location.pathname + window.location.search;
  return here && !here.startsWith("/login")
    ? `/login?add=1&next=${encodeURIComponent(here)}`
    : "/login?add=1";
}

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
export function useAccountMenu(user: AccountDisplay, onLogout: () => void, close: () => void) {
  const [, navigate] = useLocation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<{ account: BrainstormAccount; isActive: boolean } | null>(null);

  // Own house Web-of-Trust score for the invite card — fetched lazily when the
  // invite sheet opens (cached). Sharing your standing is a credible flex.
  const houseScoreQuery = useQuery({
    queryKey: ["self-house-influence", user?.pubkey],
    queryFn: () => (user?.pubkey ? apiClient.getHouseInfluence(user.pubkey) : null),
    enabled: !!user?.pubkey && inviteOpen,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const inviteUrl = typeof window !== "undefined" && user?.npub ? `${window.location.origin}/p/${user.npub}` : "";

  const onNavigate = (path: string) => { close(); navigate(path); };
  const onInvite = () => { close(); setInviteOpen(true); };
  // Sign out no longer destroys anything, so it asks nothing — the wall it used to
  // put up has moved onto the act that still does (see the dialog below).
  const onRequestLogout = () => { close(); onLogout(); };
  const onRequestRemove = (account: BrainstormAccount, isActive: boolean) => { close(); setRemoving({ account, isActive }); };

  // Removing the Account that was signing leaves the app on a page belonging to an
  // identity this browser no longer holds.
  const remove = (account: BrainstormAccount) => {
    if (removeAccountFromDevice(account)) navigate("/");
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
        nip05={user.nip05}
        canonicalUrl={inviteUrl}
        score01={typeof houseScoreQuery.data === "number" ? houseScoreQuery.data : null}
      />

      {/* The wall decision 10 moved off sign-out and onto removal. Whether it says
          "you'll lose this" or "you can add it back" turns on the same question the
          switcher's rows answer: is there a Backup behind this key? */}
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent data-testid="remove-account-confirm">
          {/* "Save backup" is only honest for the Account that is signing: the
              Settings backup section acts on the Active Account, so offering it
              while removing a different one would back up the wrong key. */}
          {removing && isUnbackedUp(removing.account) && removing.isActive ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Save a backup before you remove this account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This account's key lives in this browser and nowhere else. Removing it deletes
                  the key — without a backup file it can't be recovered, here or anywhere. It
                  takes a few seconds.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  className="text-red-600 hover:text-red-700"
                  onClick={() => { const target = removing; setRemoving(null); if (target) remove(target.account); }}
                  data-testid="remove-anyway"
                >
                  Remove anyway
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { setRemoving(null); navigate("/settings?tab=profile&focus=backup"); }}
                  data-testid="remove-save-backup"
                >
                  Save backup
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this account from this device?</AlertDialogTitle>
                <AlertDialogDescription>
                  {removing && isUnbackedUp(removing.account)
                    ? "This account's key lives in this browser and nowhere else, and removing it deletes the key. Without a backup file it can't be recovered, here or anywhere."
                    : "Everything this browser holds for it goes, including its npub. Anyone holding the key elsewhere can add it again; nobody else can."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { const target = removing; setRemoving(null); if (target) remove(target.account); }}
                  data-testid="remove-account-confirm-button"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { onNavigate, onInvite, onRequestLogout, onRequestRemove, modals };
}

interface AccountMenuBodyProps {
  user: AccountDisplay;
  isAdmin: boolean;
  active?: AppKey;
  onNavigate: (path: string) => void;
  onInvite: () => void;
  onRequestLogout: () => void;
  onRequestRemove: (account: BrainstormAccount, isActive: boolean) => void;
  /** Dismiss the host surface — what switching to another Account does. */
  close: () => void;
}

/**
 * The visible account-menu content — identity, primary-destination tiles,
 * grouped links, appearance, admin, and sign out. Presentation only; the host
 * (popover on desktop, bottom sheet on mobile) supplies the surface.
 *
 * The identity card is also the way into the account switcher, which replaces
 * everything here rather than appearing beneath it: both hosts are already at
 * their height budget, and a list under the card would grow with the number of
 * Accounts a device holds.
 */
export function AccountMenuBody({
  user,
  isAdmin,
  active,
  onNavigate,
  onInvite,
  onRequestLogout,
  onRequestRemove,
  close,
}: AccountMenuBodyProps) {
  const { toast } = useToast();
  const [pane, setPane] = useState<"menu" | "switcher">("menu");
  // Verified handle for the identity line. A "_@domain" nip05 is a bare-domain
  // identity — show just the domain rather than the placeholder underscore.
  const rawNip05 = user.nip05?.trim();
  const nip05 = rawNip05 ? rawNip05.replace(/^_@/, "") : "";
  // Same gate every other PovToggle uses: you need a finished calculation
  // before "my perspective" means anything. Without it the control renders as
  // an honest single Brainstorm chip rather than a switch that does nothing.
  const calcDone = (() => {
    try { return localStorage.getItem("brainstorm_calc_completed") === "true"; } catch { return false; }
  })();
  const canPersonalize = !!user.pubkey && calcDone;

  if (pane === "switcher") {
    return (
      <AccountSwitcher
        onBack={() => setPane("menu")}
        onSwitched={() => { setPane("menu"); close(); }}
        onRequestRemove={(account, isActive) => { setPane("menu"); onRequestRemove(account, isActive); }}
        onAddAccount={() => { setPane("menu"); onNavigate(addAccountPath()); }}
      />
    );
  }

  return (
    <div className="relative">
      {/* Identity card — and the switcher's trigger */}
      <div className="px-3 pt-4 pb-3">
        <button
          type="button"
          onClick={() => setPane("switcher")}
          className="flex w-full items-center gap-3 rounded-xl px-1 py-1 -mx-1 text-left transition-colors hover:bg-white/60 dark:hover:bg-white/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
          data-testid="button-switch-account"
        >
          <span className="block rounded-full p-[2px] bg-gradient-to-tr from-brand-deep via-brand-accent to-brand-deep shrink-0">
            <Avatar className="h-11 w-11">
              {user.picture ? <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" /> : null}
              <AvatarFallback className="bg-white text-[#0A0E18] font-bold">
                {user.displayName?.charAt(0)?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100" data-testid="text-menu-name">
              {user.displayName || "Anonymous"}
            </span>
            {nip05 && (
              <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300" data-testid="text-menu-nip05">
                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-brand-link" />
                <span className="truncate">{nip05}</span>
              </span>
            )}
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Switch account</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
        </button>
        {/* Outside the trigger: a button inside a button is not a thing, and the
            npub is the one part of this card that isn't about switching. */}
        <button
          type="button"
          className="mt-1 ml-[3.75rem] flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 transition-colors hover:text-brand-deep dark:hover:text-brand-link"
          onClick={async () => {
            await copyToClipboard(user.npub);
            toast({ title: "Copied!", description: "npub copied to clipboard" });
          }}
          data-testid="button-copy-npub"
        >
          <span className="font-mono" data-testid="text-menu-npub">{user.npub.slice(0, 14)}…</span>
          <Copy className="h-3 w-3 shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate(`/p/${user.npub}`)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-300/70 dark:border-white/15 bg-white/50 dark:bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-100 transition-colors hover:bg-white/80 dark:hover:bg-white/[0.12] hover:border-brand-accent/40"
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

      {/* "Your tags" — a page ABOUT you, so it sits with identity rather than
          down in the Invite / Help / Settings utilities group where it started.

          It arrived as one half of a Profile | Your tags pair, and upstream
          dropped the other half because the identity card had become the link to
          your public profile. Here that card is the account switcher's trigger
          instead — multi-account needs a way in, and it is the obvious one — so
          "View profile" stays above and this sits beside it. */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => onNavigate("/tags/mine")}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-300/70 dark:border-white/15 bg-white/50 dark:bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-100 transition-colors hover:bg-white/80 dark:hover:bg-white/[0.12] hover:border-brand-accent/40"
          data-testid="dropdown-my-tags"
        >
          <TagIcon className="h-4 w-4 shrink-0" /> Your tags
        </button>
      </div>

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

      <MenuDivider />

      {/* Grouped actions — Settings sits under Help & FAQ.

          "What is WoT?" used to sit between them. It asked people to decode an
          acronym before they knew whether they cared, and a definition is not a
          thing you reach for from an account menu. The page is still there and
          still linked from where curiosity actually starts — About, the footer,
          onboarding, the tags explainer, the connection lists and the
          flagged-profile banner. Ten routes in; this was the worst of them. */}
      <div className="p-1.5">
        <MenuRow icon={UserPlus} label="Invite friends" onClick={onInvite} testId="dropdown-invite" />
        <MenuRow icon={HelpCircle} label="Help & FAQ" onClick={() => onNavigate("/faq")} testId="dropdown-faq" />
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

      <MenuDivider />

      {/* Sign out stays panel-level and acts on the Active Account — it's "me, now".
          Adding and removing Accounts are the switcher's job. */}
      <div className="p-1.5">
        <MenuRow icon={LogOut} label="Sign out" onClick={onRequestLogout} tone="danger" testId="dropdown-logout" />
      </div>
    </div>
  );
}

// 8%/10% read as a smudge rather than a rule on this frosted surface, especially
// over a bright wallpaper. ~16% looks deliberate in both themes without becoming
// a hard border.
function MenuDivider() {
  return <div className="mx-3 border-t border-slate-900/[0.16] dark:border-white/[0.16]" />;
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
