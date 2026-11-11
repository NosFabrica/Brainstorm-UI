import { useCallback, useEffect, useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";
import { canSignSilently } from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { SCHEDULE_D, SCHEDULE_KIND } from "@/lib/frontPage/observerSchedule";
import { readTask, type ScheduledTask, type TaskTags } from "@/lib/scheduledTasks";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { decryptSchedule, loadObserverSchedule } from "@/services/observerSchedule";

export type ObserverScheduleState =
  | { status: "loading" }
  /** Asked, and there is no event: no device has set up the morning paper. */
  | { status: "none" }
  /** There is one, but reading it would raise the unlock prompt: wait for the user to ask. */
  | { status: "locked" }
  | { status: "ready"; doc: TaskTags; schedule: ScheduledTask }
  /** There is one and this Account can't read it. */
  | { status: "unreadable" };

/**
 * The Active Account's synced morning schedule, live from the store: a save shows as
 * soon as a relay takes it. Decrypting never raises the unlock prompt by itself; a
 * Locked local key that can't open silently reports `locked`, and `reveal()` decrypts
 * at the user's request.
 */
export function useObserverSchedule(): ObserverScheduleState & { reveal: () => void } {
  const account = useActiveAccount() as BrainstormAccount | undefined;
  const pubkey = account?.pubkey;
  const held = useStoreReplaceable(SCHEDULE_KIND, pubkey, () => loadObserverSchedule(pubkey!), {
    identifier: SCHEDULE_D,
  });
  const event = held.event;
  const [asks, setAsks] = useState({ pubkey, n: 0 });
  const askCount = asks.pubkey === pubkey ? asks.n : 0;
  const [state, setState] = useState<{ pubkey: string | undefined; value: ObserverScheduleState }>({
    pubkey,
    value: { status: "loading" },
  });

  useEffect(() => {
    const set = (value: ObserverScheduleState) => setState({ pubkey, value });
    if (!account || !event || event.pubkey !== account.pubkey) {
      set(held.settled ? { status: "none" } : { status: "loading" });
      return;
    }
    let live = true;
    void (async () => {
      if (askCount === 0 && !(await canSignSilently(account))) {
        if (live) set({ status: "locked" });
        return;
      }
      try {
        const doc = await decryptSchedule(account, event);
        if (live) set(doc ? { status: "ready", doc, schedule: readTask(doc) } : { status: "unreadable" });
      } catch {
        // They declined to unlock: still locked, not unreadable.
        if (live) set({ status: "locked" });
      }
    })();
    return () => {
      live = false;
    };
  }, [account, event?.id, held.settled, askCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = useCallback(() => setAsks((a) => ({ pubkey, n: (a.pubkey === pubkey ? a.n : 0) + 1 })), [pubkey]);
  const value = state.pubkey === pubkey ? state.value : { status: "loading" as const };
  return { ...value, reveal };
}
