import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import { Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AccountDisplay } from "@/accounts/display";
import type { AppKey } from "@/components/AppsLauncher";
import { queryClient } from "@/lib/queryClient";
import { SUPPORT_QUERY_KEY, fetchSupport } from "@/services/support";

interface AccountMenuProps {
  user: AccountDisplay;
  onLogout: () => void;
  /** Highlights the matching nav tile (Search/Dashboard/Network). */
  active?: AppKey;
}

/**
 * The menu's contents and logic (AccountMenuBody, with the invite card, the
 * account switcher and the removal dialog behind it) are their own chunk:
 * every header carries this trigger, an anonymous visitor never sees it, and a
 * signed-in one rarely opens it in the first second. The chunk is asked for
 * once the page is idle and again on hover or focus, whichever comes first,
 * so by the time the menu opens it is normally here.
 *
 * Not React.lazy: a lazy component suspends on its first render even when its
 * chunk has arrived, and here the trigger has to stay mounted throughout (a
 * remount would drop the keyboard focus that warmed it). The module is held
 * once loaded and drawn from synchronously.
 */
type MenuModule = typeof import("@/components/AccountMenuBody");
type MenuHandlers = ReturnType<MenuModule["useAccountMenu"]>;

let loaded: MenuModule | null = null;
let loading: Promise<MenuModule> | null = null;
const listeners = new Set<() => void>();

function warmMenu(): void {
  loading ??= import("@/components/AccountMenuBody").then(
    (m) => {
      loaded = m;
      for (const l of listeners) l();
      return m;
    },
    () => {
      // Forgotten, so the next hover or opening asks again.
      loading = null;
      return null as unknown as MenuModule;
    },
  );
}

/**
 * A hand on the trigger: the body's chunk, and the support tickets whose unread
 * dot the menu draws, so it opens with the dot rather than gaining it a round
 * trip later. Not on idle like the chunk: that would ask the API for tickets on
 * every page load of every signed-in reader, most of whom never open the menu.
 * Same entry and freshness AccountMenuBody reads it with.
 */
function warmMenuAndSupport(): void {
  warmMenu();
  void queryClient.prefetchQuery({ queryKey: SUPPORT_QUERY_KEY, queryFn: fetchSupport, staleTime: 30_000 });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => loaded;

/** The menu's module, or null until it arrives; asked for once the page is idle while `wanted`. */
function useMenuModule(wanted: boolean): MenuModule | null {
  const mod = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (mod || !wanted) return;
    const w = window as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warmMenu, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(warmMenu, 2000);
    return () => window.clearTimeout(t);
  }, [mod, wanted]);
  return mod;
}

/**
 * Desktop account panel (avatar → frosted-glass dropdown) used by every header.
 * On phones this renders nothing — the mobile bottom tab bar + account bottom
 * sheet ({@link MobileTabBar}) own the account surface there. The menu contents
 * are the shared {@link AccountMenuBody}, so both stay in lockstep.
 */
export function AccountMenu({ user, onLogout, active }: AccountMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const mod = useMenuModule(!isMobile);
  // The handlers live with the modals (MenuModals), which stay mounted outside the popover.
  const handlers = useRef<MenuHandlers | null>(null);
  const isAdmin = user.isAdmin;

  // Phones use the bottom tab bar + sheet instead of a top-anchored popover.
  if (isMobile) return null;

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) warmMenu();
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="group shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/50"
            data-testid="button-user-menu"
            onPointerEnter={warmMenuAndSupport}
            onFocus={warmMenuAndSupport}
          >
            <span className="block rounded-full bg-gradient-to-tr from-brand-deep via-brand-accent to-brand-deep p-[2px] shadow-[0_0_0_1px_rgb(var(--brand-primary)/0.15)] transition-all duration-300 group-hover:from-brand-link group-hover:via-brand-accent group-hover:to-brand-link group-hover:shadow-[0_0_16px_2px_rgb(var(--brand-accent)/0.5)]">
              <Avatar className="h-9 w-9" data-testid="img-user-avatar">
                {/* Mounted even with no picture: Radix keeps the loaded status on
                    the Root, so unmounting the image after it loaded suppresses the
                    fallback and leaves an empty circle. A falsy src reads as an
                    error, which is what lets the letter come back. */}
                <AvatarImage src={user.picture} alt={user.displayName || "User"} className="object-cover" />
                <AvatarFallback className="bg-white font-bold text-[#0A0E18]">
                  {user.displayName?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          className="relative w-[360px] overflow-hidden rounded-2xl border border-brand-accent/25 bg-white/[0.82] p-0 shadow-[0_16px_50px_rgba(20,18,45,0.22)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/[0.85] dark:shadow-[0_16px_50px_rgba(0,0,0,0.55)]"
          data-testid="menu-user"
        >
          {/* Soft brand-tint wash over the frosted surface (deep → cyan). */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-deep/[0.05] to-brand-accent/[0.07]" />
          {mod ? (
            <mod.AccountMenuBody
              user={user}
              isAdmin={isAdmin}
              active={active}
              onNavigate={(path) => handlers.current?.onNavigate(path)}
              onInvite={() => handlers.current?.onInvite()}
              onRequestLogout={() => handlers.current?.onRequestLogout()}
              onRequestRemove={(account, isActive) => handlers.current?.onRequestRemove(account, isActive)}
              close={close}
            />
          ) : (
            <p
              className="relative flex items-center justify-center gap-2 px-3 py-10 text-sm text-slate-500 dark:text-slate-400"
              data-testid="menu-user-loading"
            >
              <Loader2 className="h-4 w-4 animate-spin" /> Opening your menu…
            </p>
          )}
        </PopoverContent>
      </Popover>

      {mod && <MenuModals mod={mod} user={user} onLogout={onLogout} close={close} handlers={handlers} />}
    </>
  );
}

/**
 * The menu's logic and the modals it opens (useAccountMenu), which must live
 * outside the popover: an invite card or a removal dialog inside it would
 * unmount the moment it closes. Its handlers reach the menu body through
 * `handlers`, read only when a row is clicked, after this has committed.
 */
function MenuModals({
  mod,
  user,
  onLogout,
  close,
  handlers,
}: {
  mod: MenuModule;
  user: AccountDisplay;
  onLogout: () => void;
  close: () => void;
  handlers: MutableRefObject<MenuHandlers | null>;
}) {
  const menu = mod.useAccountMenu(user, onLogout, close);
  useLayoutEffect(() => {
    handlers.current = menu;
  });
  return <>{menu.modals}</>;
}
