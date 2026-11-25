import { useEffect } from "react";
import { useActivePerspective, hasStoredPerspective } from "@/hooks/useActivePerspective";
import { useHasMywot } from "@/hooks/useHasMywot";

/**
 * Single global effect: if the user has never picked a POV and they
 * already have a calculated trust graph, default to "My WoT". Mount once
 * inside App.tsx so this runs regardless of which page is active.
 */
export function PovAutoDefault() {
  const [, setPov] = useActivePerspective();
  const { hasMywot } = useHasMywot();
  useEffect(() => {
    if (!hasStoredPerspective() && hasMywot) {
      setPov("mywot");
    }
  }, [hasMywot, setPov]);
  return null;
}
