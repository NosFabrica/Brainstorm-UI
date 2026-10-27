import { useEffect, useState } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useHasMywot } from "@/hooks/useHasMywot";
import {
  ASSISTANT_UPDATED_EVENT,
  dropMismatchedAssistant,
  readPublishedAssistant,
  type PublishedAssistantState,
} from "@/lib/assistantStorage";

/**
 * The reader's Brainstorm Assistant on this deployment: the server's
 * `ta_pubkey`, and what this browser has cached of its publish.
 *
 * `published` is the cache, only once `ta_pubkey` has confirmed it: no
 * Session, no answer yet, or a cache naming another key all read as none. A
 * mismatched cache is dropped, not shown (#269).
 */
export function useBrainstormAssistant(): { taPubkey: string | null; published: PublishedAssistantState | null } {
  const { taPubkey } = useHasMywot();
  const owner = useActiveAccountDisplay()?.pubkey;
  const [stored, setStored] = useState(() => readPublishedAssistant());

  useEffect(() => {
    const refresh = () => setStored(readPublishedAssistant());
    // Other tabs arrive as `storage` events on the same per-owner prefix.
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("brainstorm_assistant:")) refresh();
    };
    // The storage is namespaced per owner, so a switch re-reads it.
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(ASSISTANT_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ASSISTANT_UPDATED_EVENT, refresh);
    };
  }, [owner]);

  useEffect(() => {
    if (taPubkey) dropMismatchedAssistant(taPubkey);
  }, [taPubkey, stored]);

  const published = taPubkey && stored?.pubkey === taPubkey ? stored : null;
  return { taPubkey, published };
}
