import { useSyncExternalStore } from "react";
import { Share, SquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { promptInstall, useInstallOffer, type InstallOffer } from "@/lib/installPrompt";

/**
 * "Install the app": the browser's own prompt where there is one, and on an
 * iPhone or iPad the Share-sheet steps, in a dialog mounted once at the app root
 * (the menus that offer it close as they're tapped).
 */
let open = false;
const listeners = new Set<() => void>();
const setOpen = (next: boolean) => {
  open = next;
  listeners.forEach((listener) => listener());
};

/** The offer this browser has, and the action that takes it up. */
export function useInstallApp(): { offer: InstallOffer; install: () => void } {
  const offer = useInstallOffer();
  return {
    offer,
    install: () => {
      if (offer === "prompt") void promptInstall();
      else if (offer === "ios") setOpen(true);
    },
  };
}

export function InstallAppDialog() {
  const isOpen = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => false,
  );
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm" data-testid="install-app-dialog">
        <DialogHeader>
          <DialogTitle>Add Brainstorm to your Home Screen</DialogTitle>
          <DialogDescription>
            It opens full screen like any app, keeps you signed in, and shows new messages on its icon.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
          <li className="flex items-center gap-3">
            <Step n={1} />
            <span>
              Tap <Share className="inline h-4 w-4 align-[-2px]" aria-label="Share" /> <b>Share</b> in Safari's toolbar
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} />
            <span>
              Choose <SquarePlus className="inline h-4 w-4 align-[-2px]" aria-hidden /> <b>Add to Home Screen</b>
            </span>
          </li>
          <li className="flex items-center gap-3">
            <Step n={3} />
            <span>
              Tap <b>Add</b>
            </span>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          The app keeps its own sign-in, separate from Safari's, so you'll sign in once more when you first open it.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">
      {n}
    </span>
  );
}
