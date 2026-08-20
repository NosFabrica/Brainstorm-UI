import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { keyAccessMessage } from "@/accounts/backup";
import { resumeSession } from "@/services/api";
import { useToast } from "@/hooks/use-toast";

/**
 * The one action behind both deferred-session surfaces: mint the Session, which
 * unlocks the key on the way through, then reload whatever failed for want of
 * it. Declining the password is a deliberate no and passes in silence.
 */
export function useResumeSession(): { resume: () => Promise<void>; busy: boolean } {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const resume = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resumeSession();
      // Nothing refetches on its own (`staleTime: Infinity`, no retry), so the
      // views that failed while the Session was gone need telling.
      await queryClient.invalidateQueries();
    } catch (err) {
      const message = keyAccessMessage(err);
      if (message) toast({ variant: "destructive", title: "Couldn't sign you back in", description: message });
    } finally {
      setBusy(false);
    }
  };

  return { resume, busy };
}
