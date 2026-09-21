import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { AccountMenuBody, useAccountMenu } from "@/components/AccountMenuBody";
import { closeAccountSheet, setAccountSheet, useAccountSheetOpen } from "@/lib/accountSheetStore";
import type { AccountDisplay } from "@/accounts/display";

/** The account drawer, loaded the first time it opens — the tab bar itself is on every page. */
export function MobileAccountSheetBody({ user, onLogout }: { user: AccountDisplay; onLogout: () => void }) {
  const open = useAccountSheetOpen();
  const isAdmin = user.isAdmin;
  const { onNavigate, onInvite, onRequestLogout, onRequestRemove, modals } = useAccountMenu(user, onLogout, closeAccountSheet);

  return (
    <>
      <Drawer open={open} onOpenChange={setAccountSheet}>
        <DrawerContent className="border-brand-accent/20 dark:border-white/10 bg-white/90 dark:bg-slate-950/95 backdrop-blur-xl">
          <DrawerTitle className="sr-only">Your account</DrawerTitle>
          {/* Brand-tint wash to match the desktop menu's frosted surface. */}
          <div className="pointer-events-none absolute inset-0 rounded-t-[10px] bg-gradient-to-br from-brand-deep/[0.05] to-brand-accent/[0.07]" />
          <div className="relative max-h-[80vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
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
