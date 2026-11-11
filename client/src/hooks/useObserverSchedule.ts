import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";
import { canSignUnasked } from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { SCHEDULE_D, SCHEDULE_KIND } from "@/lib/frontPage/observerSchedule";
import { readTask, type ScheduledTask, type TaskTags } from "@/lib/scheduledTasks";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { onAppResume } from "@/lib/appResume";
import { heldSchedule, loadObserverSchedule, readSchedule, type ScheduleRead } from "@/services/observerSchedule";

export type ObserverScheduleState =
  | { status: "loading" }
  /** Asked, and there is no event: no device has set up the morning paper. */
  | { status: "none" }
  /**
   * There is one, and reading it would ask the user: our unlock prompt for a Locked local
   * key, or the extension's or bunker's own for theirs. Waits for them to ask (`reveal`).
   */
  | { status: "locked" }
  /** The signer didn't decrypt it (a bunker timed out, an extension prompt was dismissed): `reveal` asks again. */
  | { status: "failed"; error: string }
  | { status: "ready"; doc: TaskTags; schedule: ScheduledTask; eventId: string; createdAt: number }
  /** There is one and this Account can't read it. */
  | { status: "unreadable" };

export type ObserverSchedule = ObserverScheduleState & {
  /** Decrypt at the user's request: Unlock, or Retry after a failure. */
  reveal: () => void;
  /** Ask the relays again (the page shown again, a morning come due), at most once a minute. */
  refresh: () => void;
  /** When the relays last answered for it (ms); null before they have. What a missed-run warning may rest on. */
  checkedAt: number | null;
};

/** No more than one re-ask a minute, however often the page is shown again. */
const REFRESH_MIN_MS = 60_000;

function fromRead(read: ScheduleRead, eventId: string, createdAt: number): ObserverScheduleState {
  if (read.status === "ready") {
    return { status: "ready", doc: read.tags, schedule: readTask(read.tags), eventId, createdAt };
  }
  return read.status === "failed" ? { status: "failed", error: read.error } : { status: "unreadable" };
}

/**
 * The Active Account's synced morning schedule, live from the store: a save shows as
 * soon as a relay takes it. Decrypting never asks the user by itself: only a key held here
 * that opens silently decrypts on load; an extension or bunker, which prompts for every
 * request, and a Locked key report `locked` until `reveal()`. Each event is decrypted
 * once (`readSchedule` joins a read already out), so the ask settling while a decrypt is
 * out doesn't start a second.
 */
export function useObserverSchedule(): ObserverSchedule {
  const account = useActiveAccount() as BrainstormAccount | undefined;
  const pubkey = account?.pubkey;
  // The decrypt keys on whose schedule and which event, not on the account object.
  const accountRef = useRef(account);
  accountRef.current = account;
  const held = useStoreReplaceable(SCHEDULE_KIND, pubkey, () => loadObserverSchedule(pubkey!), {
    identifier: SCHEDULE_D,
  });
  const event = held.event && held.event.pubkey === pubkey ? held.event : undefined;
  const eventId = event?.id;
  const createdAt = event?.created_at ?? 0;

  // Each reveal() is a fresh ask, so a declined unlock or a failed decrypt can be tried
  // again. It is the account's ask: switching accounts doesn't carry it to the next.
  const [asks, setAsks] = useState({ pubkey, n: 0 });
  const askCount = asks.pubkey === pubkey ? asks.n : 0;
  // Tagged with whose it is: after a switch the last account's never reads as this one's.
  // A newer event of the same account keeps the last one showing until it is read.
  const [read, setRead] = useState<{ pubkey: string; value: ObserverScheduleState } | null>(null);

  useEffect(() => {
    const acct = accountRef.current;
    if (!acct || !pubkey || !eventId || !event) return;
    let live = true;
    const set = (value: ObserverScheduleState) => {
      if (live) setRead({ pubkey, value });
    };
    const done = heldSchedule(eventId);
    if (done) {
      set(fromRead(done, eventId, createdAt));
      return;
    }
    void (async () => {
      if (askCount === 0 && !(await canSignUnasked(acct))) {
        set({ status: "locked" });
        return;
      }
      try {
        set(fromRead(await readSchedule(acct, event), eventId, createdAt));
      } catch {
        // They declined to unlock: still locked, not unreadable.
        set({ status: "locked" });
      }
    })();
    return () => {
      live = false;
    };
  }, [pubkey, eventId, askCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the relays last answered: the first ask settling, then each refresh.
  const [checked, setChecked] = useState<{ pubkey: string | undefined; at: number } | null>(null);
  useEffect(() => {
    if (held.settled) setChecked({ pubkey, at: Date.now() });
  }, [pubkey, held.settled]);

  const refreshing = useRef<{ pubkey: string; at: number } | null>(null);
  const refresh = useCallback(() => {
    if (!pubkey) return;
    const last = refreshing.current;
    if (last && last.pubkey === pubkey && Date.now() - last.at < REFRESH_MIN_MS) return;
    refreshing.current = { pubkey, at: Date.now() };
    loadObserverSchedule(pubkey).then(
      () => setChecked({ pubkey, at: Date.now() }),
      () => undefined,
    );
  }, [pubkey]);

  // Shown again after a night away: ask before a stale `ran` reads as a missed morning.
  useEffect(() => onAppResume(() => refresh()), [refresh]);

  const reveal = useCallback(() => setAsks((a) => ({ pubkey, n: (a.pubkey === pubkey ? a.n : 0) + 1 })), [pubkey]);

  let value: ObserverScheduleState;
  if (!event) value = held.settled ? { status: "none" } : { status: "loading" };
  else if (read && read.pubkey === pubkey) value = read.value;
  else value = { status: "loading" };
  const checkedAt = checked && checked.pubkey === pubkey ? checked.at : null;
  return { ...value, reveal, refresh, checkedAt };
}
