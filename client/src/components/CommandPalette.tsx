import { Suspense, lazy, useEffect, useState } from "react";
import { OverlaySpinner } from "@/components/OverlaySpinner";

/** Fire from anywhere (e.g. a header button) to open the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

const CommandPaletteDialog = lazy(() =>
  import("@/components/CommandPaletteDialog").then((m) => ({ default: m.CommandPaletteDialog })),
);

/**
 * The ⌘K launcher's keyboard shortcut, mounted once at the app root. The
 * palette's own code arrives the first time someone opens it — nobody pays for
 * a list of destinations they never asked for.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const show = (next: boolean) => {
      if (next) setAsked(true);
      setOpen(next);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAsked(true);
        setOpen((o) => !o);
      }
    };
    const onOpen = () => show(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  if (!asked) return null;
  return (
    <Suspense fallback={open ? <OverlaySpinner /> : null}>
      <CommandPaletteDialog open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}
