/**
 * Fakes for the DM engine's parts' unit tests (deviceCache, wrapOpener, outbox,
 * inboxLink): a core on a clock the test runs by hand, a cache in memory, a
 * sealer that only marks what it sealed.
 */
import type { DmCacheBackend, DmState, Sealer, StoredWrap } from "@/lib/dm/cache";
import { makeClock } from "./clock";
import { DmCore } from "./core";

export const NOW = 1_800_000_000;

/** Timers the test fires by hand; nothing runs on its own. */
export function manualTimers() {
  let next = 0;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  return {
    pending,
    setTimer: (fn: () => void, ms: number) => {
      pending.set(++next, { fn, ms });
      return next;
    },
    clearTimer: (handle: unknown) => void pending.delete(handle as number),
    setRepeating: () => 0,
    clearRepeating: () => {},
    /** Fire every timer set so far (not those they set in turn). */
    flush() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, t] of due) t.fn();
    },
  };
}

export function coreFor(me: string, opts: { online?: boolean; now?: number } = {}) {
  const timers = manualTimers();
  let changes = 0;
  const core = new DmCore(
    me,
    makeClock({ ...timers, now: () => opts.now ?? NOW }),
    () => opts.online ?? true,
    () => void changes++,
  );
  return { core, timers, changes: () => changes };
}

export function memoryCache(): DmCacheBackend & {
  rows: Map<string, StoredWrap>;
  st: Map<string, DmState>;
  cleared: boolean;
} {
  const rows = new Map<string, StoredWrap>();
  const st = new Map<string, DmState>();
  let epoch = 0;
  const cache = {
    rows,
    st,
    cleared: false,
    wraps: async (owner: string) => [...rows.values()].filter((r) => r.owner === owner),
    wrapKeys: async (owner: string) => [...rows.values()].filter((r) => r.owner === owner).map((r) => r.key),
    wrapsPage: async (
      owner: string,
      { before, limit, oldestFirst }: { before?: { at: number; key: string }; limit: number; oldestFirst?: boolean },
    ) => {
      const mine = [...rows.values()]
        .filter((r) => r.owner === owner)
        .sort((a, b) => b.at - a.at || (b.key < a.key ? -1 : b.key > a.key ? 1 : 0));
      if (oldestFirst) mine.reverse();
      const from = before ? mine.filter((r) => r.at < before.at || (r.at === before.at && r.key < before.key)) : mine;
      return from.slice(0, limit);
    },
    putWraps: async (list: StoredWrap[]) => list.forEach((r) => rows.set(r.key, r)),
    deleteWraps: async (keys: string[]) => keys.forEach((k) => rows.delete(k)),
    state: async (owner: string) => st.get(owner),
    putState: async (s: DmState) => void st.set(s.owner, s),
    clear: async () => {
      epoch++;
      cache.cleared = true;
      rows.clear();
      st.clear();
    },
    guard: () => {
      const asked = epoch;
      return () => asked === epoch;
    },
  };
  return cache;
}

export const plainSealer: Sealer = {
  supported: () => true,
  seal: async (t) => `sealed:${t}`,
  open: async (e) => e.slice(7),
};

export const settle = () => new Promise((r) => setTimeout(r, 0));
