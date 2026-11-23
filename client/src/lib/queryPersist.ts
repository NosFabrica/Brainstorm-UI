/**
 * The signed-in reader's own slow reads, kept on this device between visits.
 *
 * An installed app's cold start used to paint skeletons and refetch the
 * dashboard from nothing: the reader's overview, stats, history, latest run,
 * network alerts and preset — several of them multi-second server queries
 * whose answers rarely move. Held here, they paint at once and are refreshed
 * behind the paint (every restored entry is marked stale, so the first screen
 * that reads one asks the server again).
 *
 * The rules, the same as the event cache's (lib/eventCache):
 *
 * - **Theirs only.** A whitelist of the active Account's own keys; nothing
 *   about anyone else, no token, no payment detail. One row, stamped with
 *   whose it is, and restored only into that Account's session.
 * - **Dropped with the Account.** Sign-out and every Account switch clear the
 *   query cache (accounts/login-flow, the cross-tab mirror), and clearing the
 *   cache drops this copy too (lib/queryClient).
 * - **Never authoritative.** A deploy can change what an answer means, so a
 *   copy from another build is discarded, as is anything older than a day.
 */
import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from "@tanstack/react-query";
import type { Observable } from "rxjs";

import { openDb, transact } from "./idb";

const DB_NAME = "brainstorm-queries";
const STORE = "own";
const ROW_ID = "own";

/** Past a day an answer is more misleading than a skeleton. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Writes gather for a moment: a dashboard visit lands six answers in a burst. */
const WRITE_DELAY_MS = 1000;

/** A deploy can change what an answer means; a copy from another build is dropped. */
export const BUILD_BUSTER = typeof __BUILD_ID__ === "undefined" ? "dev" : __BUILD_ID__;

export interface PersistedRow {
  id: typeof ROW_ID;
  pubkey: string;
  buster: string;
  savedAt: number;
  state: DehydratedState;
}

/** What this module needs of the device's storage. */
export interface PersistStore {
  get: () => Promise<PersistedRow | undefined>;
  put: (row: PersistedRow) => Promise<void>;
  clear: () => Promise<void>;
}

/**
 * Whether a query is one of the reader's own slow, stable reads. The keys are
 * the factories' (services/queries, hooks/useTrustPresetSync,
 * hooks/useNetworkAlerts, hooks/useBillingPlans), spelled out here so the
 * persistence layer imports nothing that talks to the server.
 */
export function isPersistedKey(key: readonly unknown[], me: string): boolean {
  const [base, who] = key;
  switch (base) {
    // The run and the plans name nobody: the run is read off the session, the plans are the catalogue.
    case "/user/graperankResult":
    case "billing-plans":
      return key.length === 1;
    case "/user/overview":
    case "/user/stats":
    case "/user/history":
    case "/networkAlerts":
    case "/user/graperank/preset":
      return typeof who === "string" && who.toLowerCase() === me;
    default:
      return false;
  }
}

let store: PersistStore | null | undefined;

function build(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
}

/** Opened versionless and repaired past a store-less database, as lib/eventCache explains. */
async function open(): Promise<IDBDatabase> {
  const db = await openDb(DB_NAME, undefined, build);
  if (db.objectStoreNames.contains(STORE)) return db;
  const version = db.version + 1;
  db.close();
  return openDb(DB_NAME, version, build);
}

function indexedDbStore(): PersistStore | null {
  if (typeof indexedDB === "undefined") return null;
  // Opened per call: this is touched once at boot and once per burst of
  // answers, not on every loader batch as the event cache is.
  const run = async <T>(mode: IDBTransactionMode, work: (s: IDBObjectStore, keep: (v: T) => void) => void) => {
    const db = await open();
    try {
      return await transact<T>(db, STORE, mode, work);
    } finally {
      db.close();
    }
  };
  return {
    get: () =>
      run<PersistedRow | undefined>("readonly", (s, keep) => {
        const req = s.get(ROW_ID);
        req.onsuccess = () => keep(req.result as PersistedRow | undefined);
      }),
    put: async (row) => {
      await run("readwrite", (s) => s.put(row));
    },
    clear: async () => {
      await run("readwrite", (s) => s.clear());
    },
  };
}

function storage(): PersistStore | null {
  if (store === undefined) store = indexedDbStore();
  return store;
}

/** Tests: a fake device (or null for none), and a fresh start. */
export function __setPersistStore(next: PersistStore | null | undefined): void {
  store = next;
  generation++;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
}

/**
 * Bumped by every drop: a restore or a write begun before a sign-out must not
 * land after it.
 */
let generation = 0;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

/** Forget the held copy — the query cache was just cleared. */
export function dropPersistedQueries(): void {
  generation++;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  void storage()
    ?.clear()
    .catch(() => undefined);
}

/** Put the reader's held answers back, if they are theirs, this build's and young enough. Returns how many. */
export async function restoreQueries(client: QueryClient, me: string, now: number = Date.now()): Promise<number> {
  const s = storage();
  if (!s) return 0;
  const startedAt = generation;
  let row: PersistedRow | undefined;
  try {
    row = await s.get();
  } catch {
    return 0;
  }
  if (!row || generation !== startedAt) return 0;
  if (row.pubkey !== me || row.buster !== BUILD_BUSTER || now - row.savedAt > MAX_AGE_MS) {
    // Someone else's, another build's, or too old: no use to anyone now.
    void s.clear().catch(() => undefined);
    return 0;
  }
  const queries = (row.state?.queries ?? []).filter(
    (q) =>
      Array.isArray(q.queryKey) &&
      isPersistedKey(q.queryKey, me) &&
      q.state?.status === "success" &&
      now - (q.state.dataUpdatedAt ?? 0) <= MAX_AGE_MS,
  );
  if (!queries.length) return 0;
  hydrate(client, { mutations: [], queries });
  // Shown at once, asked again behind the paint: each restored entry is stale,
  // so the first screen that reads it refetches; nothing fetches for its own sake.
  for (const q of queries) {
    void client.invalidateQueries({ queryKey: q.queryKey, exact: true, refetchType: "none" });
  }
  return queries.length;
}

/** Write the reader's own answers now. */
export async function saveQueries(client: QueryClient, me: string, now: number = Date.now()): Promise<void> {
  const s = storage();
  if (!s) return;
  const state = dehydrate(client, {
    shouldDehydrateQuery: (q: Query) => q.state.status === "success" && isPersistedKey(q.queryKey, me),
    shouldDehydrateMutation: () => false,
  });
  if (!state.queries.length) return;
  await s.put({ id: ROW_ID, pubkey: me, buster: BUILD_BUSTER, savedAt: now, state });
}

/** The part of the account manager this needs: who is active, and when that changes. */
export interface ActiveSource {
  active?: { pubkey: string } | undefined;
  active$: Observable<{ pubkey: string } | undefined>;
}

/**
 * Restore for whoever is active now, and keep their answers as they land.
 * Returns a stop function (tests).
 */
export function startQueryPersistence(client: QueryClient, accounts: ActiveSource): () => void {
  const activePubkey = () => accounts.active?.pubkey?.toLowerCase() ?? null;
  let restoredFor: string | null = null;
  const restoreFor = (pk: string | null) => {
    if (!pk || pk === restoredFor) return;
    restoredFor = pk;
    void restoreQueries(client, pk).catch(() => 0);
  };
  restoreFor(activePubkey());
  const accountSub = accounts.active$.subscribe((account) => restoreFor(account?.pubkey?.toLowerCase() ?? null));

  const flush = () => {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = null;
    const me = activePubkey();
    // A drop clears the timer and the cache together, so a write that does
    // run finds only what the current Account has fetched since.
    if (!me) return;
    void saveQueries(client, me).catch(() => undefined);
  };
  const cacheSub = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const me = activePubkey();
    if (!me || !isPersistedKey(event.query.queryKey, me)) return;
    if (writeTimer) return;
    writeTimer = setTimeout(flush, WRITE_DELAY_MS);
  });
  // A phone backgrounding the app may never run the timer.
  const onHide = () => {
    if (document.visibilityState === "hidden" && writeTimer) flush();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHide);

  return () => {
    accountSub.unsubscribe();
    cacheSub();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHide);
  };
}
