import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AccountMenuBody, useAccountMenu } from "@/components/AccountMenuBody";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AccountDisplay } from "@/accounts/display";
import type { AppKey } from "@/components/AppsLauncher";

interface AccountMenuProps {
  user: AccountDisplay;
  onLogout: () => void;
  /** Highlights the matching nav tile (Search/Dashboard/Network). */
  active?: AppKey;
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
  const { onNavigate, onInvite, onRequestLogout, onRequestRemove, modals } = useAccountMenu(user, onLogout, close);
  const isAdmin = user.isAdmin;

  // Phones use the bottom tab bar + sheet instead of a top-anchored popover.
  if (isMobile) return null;

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
                <AvatarFallback className="bg-white text-[#0A0E18] font-bold">
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
          <AccountMenuBody
            user={user}
            isAdmin={isAdmin}
            active={active}
            onNavigate={onNavigate}
            onInvite={onInvite}
            onRequestLogout={onRequestLogout}
            onRequestRemove={onRequestRemove}
            close={close}
          />
        </PopoverContent>
      </Popover>

      {modals}
    </>
  );
}
