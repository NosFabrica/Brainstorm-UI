import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { AccountMenuBody, useAccountMenu } from "@/components/AccountMenuBody";
import { closeAccountSheet, setAccountSheet, useAccountSheetOpen } from "@/lib/accountSheetStore";
import type { AccountDisplay } from "@/accounts/display";

/** The account drawer, loaded the first time it opens — the tab bar itself is on every page. */
export function MobileAccountSheetBody({ user, onLogout }: { user: AccountDisplay; onLogout: () => void }) {
  const open = useAccountSheetOpen();
  const isAdmin = user.isAdmin;
  const { onNavigate, onInvite, onRequestLogout, onRequestRemove, modals } = useAccountMenu(
    user,
    onLogout,
    closeAccountSheet,
  );

  return (
    <>
      <Drawer open={open} onOpenChange={setAccountSheet}>
        {/* The home-indicator inset pads the drawer, not the list inside it: padding the
            scroll area put it below the last row, so "Sign out" sat on the indicator
            until the list was scrolled. */}
        <DrawerContent className="border-brand-accent/20 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95">
          <DrawerTitle className="sr-only">Your account</DrawerTitle>
          {/* Brand-tint wash to match the desktop menu's frosted surface. */}
          <div className="pointer-events-none absolute inset-0 rounded-t-[10px] bg-gradient-to-br from-brand-deep/[0.05] to-brand-accent/[0.07]" />
          <div className="relative max-h-[80vh] overflow-y-auto">
            <AccountMenuBody
              user={user}
              isAdmin={isAdmin}
              active={undefined}
              onNavigate={onNavigate}
              onInvite={onInvite}
              onRequestLogout={onRequestLogout}
              onRequestRemove={onRequestRemove}
              close={closeAccountSheet}
            />
          </div>
        </DrawerContent>
      </Drawer>
      {modals}
    </>
  );
}
