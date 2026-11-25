/**
 * A draft of one replaceable list, kept honest about the version it was made
 * from (lib/replaceableDraft says what goes wrong without it).
 *
 *  - Edits are refused until the list is read: its newest version known, or a
 *    majority of its relays saying there is none. "Couldn't read it" is its own
 *    status, never an empty list.
 *  - The draft remembers its base, the version it was made from. Untouched, it
 *    follows the newest version as it arrives; touched, a newer arrival marks it
 *    `stale`, and publishing is refused with "A newer version arrived".
 *  - Publishing reads the list once more first, and stamps past the newest
 *    version, so the edit lands on top of it.
 *
 * `d` is the list's identifier for an addressable kind. While the draft has no
 * base (a list being created), `d` may change as it's typed: the read follows
 * it, waiting `probeDelayMs` for the typing to stop, and the draft stays.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type { NostrEvent } from "nostr-tools";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { eventStore } from "@/lib/eventStore";
import { beats } from "@/lib/relayRequest";
import {
  LIST_NOT_READ,
  NEWER_VERSION_ARRIVED,
  createdAtPast,
  newestVersion,
  probeReplaceable,
  type ListReadStatus,
  type ReplaceableProbe,
} from "@/lib/replaceableDraft";

export interface ListDraftOptions<T> {
  /** The value a version holds; `null` for a list that doesn't exist yet. */
  read: (event: NostrEvent | null) => T;
  /** A version the caller already holds (one it streamed in): weighed with the store's. */
  held?: NostrEvent | null;
  /** Where to read it from; the author's write relays by default. */
  relays?: string[];
  /** Wait this long after `d` changes before reading it. */
  probeDelayMs?: number;
}

/** What a publish is handed: build on `base`, sign with `createdAt`. */
export interface ListPublishContext {
  base: NostrEvent | null;
  createdAt: number;
}

export type ListPublishResult = { success: boolean; error?: string; cancelled?: boolean };

export interface ReplaceableListDraft<T> {
  status: ListReadStatus;
  /** The newest version seen. */
  latest: NostrEvent | null;
  /** The version the shown value was made from. */
  base: NostrEvent | null;
  value: T;
  /** There are edits not yet published. */
  dirty: boolean;
  /** A newer version than the draft's base has arrived: publishing is refused until `discard`. */
  stale: boolean;
  /** Edits are allowed: the list has been read and nothing is publishing. */
  canEdit: boolean;
  publishing: boolean;
  edit: (next: SetStateAction<T>) => void;
  /** Drop the edits and follow the newest version again. */
  discard: () => void;
  /** Read the list again (after `unreadable`). */
  retry: () => void;
  /**
   * Publish the draft through `send`, on top of the newest version. Refused,
   * with nothing sent, while the list isn't read or a newer version arrived.
   * On success the draft is dropped: the store's new version is the value.
   */
  publish: <R extends ListPublishResult>(
    send: (value: T, ctx: ListPublishContext) => Promise<R & { event?: NostrEvent }>,
    /** Publish this in place of the draft — a whole list chosen at once, as a "use suggested" does. */
    replaceWith?: T,
  ) => Promise<R | ListPublishResult>;
}

type Read = { key: string; probe: ReplaceableProbe | null };
type Draft<T> = { owner: string; base: NostrEvent | null; value: T };

const noAsk = () => Promise.resolve(undefined);

export function useReplaceableListDraft<T>(
  kind: number,
  pubkey: string | null | undefined,
  d: string | undefined,
  { read, held, relays, probeDelayMs = 0 }: ListDraftOptions<T>,
): ReplaceableListDraft<T> {
  const readKey = pubkey ? `${kind}:${pubkey}:${d ?? ""}` : "";
  const filters = useMemo(
    () => (pubkey ? [{ kinds: [kind], authors: [pubkey], ...(d !== undefined ? { "#d": [d] } : {}) }] : null),
    [kind, pubkey, d],
  );
  // The store, live: our own publishes and anything another read brings in. Nothing asked here.
  const stored = useStoreEvents(null, filters, noAsk).events;

  const [reading, setReading] = useState<Read>({ key: "", probe: null });
  const [attempt, setAttempt] = useState(0);
  const relaysKey = relays?.join(",") ?? "";
  useEffect(() => {
    if (!pubkey) return;
    let alive = true;
    setReading({ key: readKey, probe: null });
    const t = setTimeout(() => {
      void probeReplaceable(kind, pubkey, d, { relays }).then((probe) => {
        if (alive) setReading({ key: readKey, probe });
      });
    }, probeDelayMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // `readKey` is kind, pubkey and d; `relaysKey` is `relays`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readKey, relaysKey, attempt, probeDelayMs]);

  const probe = reading.key === readKey ? reading.probe : null;
  const latest = useMemo(
    () => (pubkey ? newestVersion([...stored, held, probe?.event], kind, pubkey, d) : null),
    [stored, held, probe, kind, pubkey, d],
  );
  const status: ListReadStatus = !pubkey || !probe ? "loading" : latest || probe.provenAbsent ? "ready" : "unreadable";

  // The draft belongs to one list's author; another author's list starts over.
  const owner = `${kind}:${pubkey ?? ""}`;
  const [draftState, setDraft] = useState<Draft<T> | null>(null);
  const draft = draftState?.owner === owner ? draftState : null;
  const [publishing, setPublishing] = useState(false);

  const readRef = useRef(read);
  readRef.current = read;
  const latestRef = useRef(latest);
  latestRef.current = latest;
  const statusRef = useRef(status);
  statusRef.current = status;

  // Untouched, the value follows the newest version.
  const value = useMemo(() => (draft ? draft.value : read(latest)), [draft, latest]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = draft ? draft.base : latest;
  const stale = !!draft && !!latest && latest.id !== draft.base?.id && beats(latest, draft.base ?? undefined);
  const canEdit = status === "ready" && !publishing;

  const edit = useCallback(
    (next: SetStateAction<T>) => {
      if (statusRef.current !== "ready") return;
      setDraft((cur) => {
        const mine = cur?.owner === owner ? cur : null;
        const from = mine ?? { owner, base: latestRef.current, value: readRef.current(latestRef.current) };
        const v = typeof next === "function" ? (next as (prev: T) => T)(from.value) : next;
        return { ...from, value: v };
      });
    },
    [owner],
  );
  const discard = useCallback(() => setDraft(null), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const publish = useCallback(
    async <R extends ListPublishResult>(
      send: (value: T, ctx: ListPublishContext) => Promise<R & { event?: NostrEvent }>,
      replaceWith?: T,
    ): Promise<R | ListPublishResult> => {
      if (!pubkey || statusRef.current !== "ready") return { success: false, error: LIST_NOT_READ };
      const replacing = replaceWith !== undefined;
      if (stale && !replacing) return { success: false, error: NEWER_VERSION_ARRIVED };
      setPublishing(true);
      try {
        // Once more from the relays: a version published elsewhere since the read.
        const now = await probeReplaceable(kind, pubkey, d, { relays });
        const newest = newestVersion([latestRef.current, now.event], kind, pubkey, d);
        if (!replacing && newest && newest.id !== base?.id && beats(newest, base ?? undefined)) {
          // Into the store: an untouched draft moves onto it, a touched one shows as stale.
          if (now.event) eventStore.add(now.event);
          return { success: false, error: NEWER_VERSION_ARRIVED };
        }
        const createdAt = createdAtPast(newest);
        const res = await send(replacing ? replaceWith : value, { base: newest, createdAt });
        if (res.success) {
          if (res.event) eventStore.add(res.event);
          setDraft(null);
        } else {
          // A sender that put its signed copy in the store before the relays
          // refused it: that copy is the draft's own, not a newer version.
          const own = eventStore.getReplaceable(kind, pubkey, d) as NostrEvent | undefined;
          if (own && own.created_at === createdAt) {
            const value = replacing ? replaceWith : undefined;
            setDraft((cur) =>
              cur?.owner === owner ? { ...cur, base: own } : { owner, base: own, value: value ?? readRef.current(own) },
            );
          }
        }
        return res;
      } finally {
        setPublishing(false);
      }
    },
    [pubkey, stale, kind, d, relays, base, value, owner],
  );

  return {
    status,
    latest,
    base,
    value,
    dirty: !!draft,
    stale,
    canEdit,
    publishing,
    edit,
    discard,
    retry,
    publish,
  };
}
