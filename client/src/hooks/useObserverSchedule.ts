import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";
import { canSignUnasked } from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { SCHEDULE_D, SCHEDULE_KIND } from "@/lib/frontPage/observerSchedule";
import { readTask, type ScheduledTask, type TaskTags } from "@/lib/scheduledTasks";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";
import { onAppResume } from "@/lib/appResume";
import {
  heldSchedule,
  loadObserverSchedule,
  readSchedule,
  scheduleCheckedAt,
  type ScheduleRead,
} from "@/services/observerSchedule";

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
  /** Ask the relays again (a morning come due, the page shown again after a minute away), at most once a minute. */
  refresh: () => void;
  /**
   * When most of the write relays last answered for it (ms; `scheduleCheckedAt`); null
   * before they have. A read that timed out doesn't move it. What a missed-run warning may
   * rest on.
   */
  checkedAt: number | null;
};

/** The states with nothing in them, shared so the hook's answer keeps its identity. */
const LOADING: ObserverScheduleState = { status: "loading" };
const NONE: ObserverScheduleState = { status: "none" };

/** No more than one re-ask a minute, however often the page is shown again. */
const REFRESH_MIN_MS = 60_000;
/** Away at least this long, the page shown again asks again: a quick tab switch doesn't. */
const RESUME_AWAY_MS = 60_000;
/**
 * After an Unlock, how long a newer event (a device's edit landing, the next read) is read
 * too while the page is on screen, without asking again. Past it, a newer event waits for
 * the next Unlock: an extension or bunker prompts for each decrypt, and nobody asked.
 */
const REVEAL_WINDOW_MS = 2 * 60_000;

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
 * request, and a Locked key report `locked` until `reveal()`. A reveal is for the event
 * it was given for, and for any newer one that lands within two minutes while the page is
 * shown; a newer event after that is `locked` again until the next reveal. Each event is
 * decrypted once (`readSchedule` joins a read already out), so the ask settling while a
 * decrypt is out doesn't start a second.
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
  // again. It is the account's ask, for the event on show: switching accounts doesn't carry
  // it to the next, and a newer event is covered only within the window (REVEAL_WINDOW_MS).
  const [asks, setAsks] = useState<{ pubkey: string | undefined; n: number; eventId?: string; at: number }>({
    pubkey,
    n: 0,
    at: 0,
  });
  const askCount = asks.pubkey === pubkey ? asks.n : 0;
  const eventRef = useRef(eventId);
  eventRef.current = eventId;
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
    // Asked for: this event, or one landing just after the ask while they are looking.
    const asked =
      askCount > 0 &&
      (asks.eventId === eventId || (Date.now() - asks.at < REVEAL_WINDOW_MS && document.visibilityState !== "hidden"));
    void (async () => {
      if (!asked && !(await canSignUnasked(acct))) {
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
  }, [pubkey, eventId, askCount]); // eslint-disable-line react-hooks/exhaustive-deps -- `asks` changes with askCount

  // When the relays last answered, as the service recorded it: an ask that settled on a
  // timeout, or one settled minutes ago in askOnce's window, isn't a check made now.
  const [checked, setChecked] = useState<{ pubkey: string | undefined; at: number } | null>(null);
  const recordCheck = useCallback(() => {
    if (!pubkey) return;
    const at = scheduleCheckedAt(pubkey);
    if (at !== null) setChecked((c) => (c && c.pubkey === pubkey && c.at >= at ? c : { pubkey, at }));
  }, [pubkey]);
  useEffect(() => {
    if (held.settled) recordCheck();
  }, [held.settled, recordCheck]);

  const refreshing = useRef<{ pubkey: string; at: number } | null>(null);
  const refresh = useCallback(() => {
    if (!pubkey) return;
    const last = refreshing.current;
    if (last && last.pubkey === pubkey && Date.now() - last.at < REFRESH_MIN_MS) return;
    refreshing.current = { pubkey, at: Date.now() };
    loadObserverSchedule(pubkey).then(recordCheck, () => undefined);
  }, [pubkey, recordCheck]);

  // Shown again after a night away: ask before a stale `ran` reads as a missed morning. A
  // tab switch of a few seconds isn't a night away.
  useEffect(
    () =>
      onAppResume((away) => {
        if (away >= RESUME_AWAY_MS) refresh();
      }),
    [refresh],
  );

  const reveal = useCallback(
    () =>
      setAsks((a) => ({
        pubkey,
        n: (a.pubkey === pubkey ? a.n : 0) + 1,
        eventId: eventRef.current,
        at: Date.now(),
      })),
    [pubkey],
  );

  let value: ObserverScheduleState;
  if (!event) value = held.settled ? NONE : LOADING;
  else if (read && read.pubkey === pubkey) value = read.value;
  else value = LOADING;
  const checkedAt = checked && checked.pubkey === pubkey ? checked.at : null;
  // The same object until something in it changes: the page holds it and hands it to the
  // memoized card, which must not re-render on every streamed chunk of a print.
  return useMemo(() => ({ ...value, reveal, refresh, checkedAt }), [value, reveal, refresh, checkedAt]);
}
