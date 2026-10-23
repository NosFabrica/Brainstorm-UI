import { useState } from "react";
import { LogOut } from "lucide-react";
import { apiClient } from "@/services/api";
import { BusyConfirmDialog } from "@/components/BusyConfirmDialog";

/** Settings → Account: revoke every session, this device's included, then sign out here. */
export function SignOutEverywhereRow({ onSignedOut }: { onSignedOut: () => void }) {
  const [open, setOpen] = useState(false);

  async function signOutEverywhere() {
    await apiClient.revokeOwnSessions();
    setOpen(false);
    onSignedOut();
  }

  return (
    <div className="border-t border-slate-100 pt-4 dark:border-slate-800/60">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400"
        data-testid="button-account-logout-everywhere"
      >
        <LogOut className="h-4 w-4" /> Sign out everywhere
      </button>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Signs you out on every device, this one included.
      </p>
      <BusyConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign out everywhere?"
        description="Every device signed in as you, this one included, is signed out. Your account and keys stay where they are; signing back in works as usual."
        confirmLabel="Sign out everywhere"
        onConfirm={signOutEverywhere}
        testId="logout-everywhere-confirm"
      />
    </div>
  );
}
