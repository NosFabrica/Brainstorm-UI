/**
 * What this device keeps of an account's private messages between visits, so
 * a reload neither re-downloads the history nor asks the signer to open every
 * message again (two NIP-44 decrypts each — two approvals apiece on a remote
 * signer).
 *
 * Opened messages are never written in the clear. Each one is sealed with the
 * device's non-extractable AES-GCM key (lib/skVault, the same envelope the
 * Unlock cache uses), bound to the owning account by AAD — so another account
 * on this browser can't open them, and neither can anything that only reads
 * storage. When the vault is unavailable (some private windows, plain HTTP)
 * only the wrap ids and the paging state are kept, and messages are opened
 * again next time.
 *
 * Also kept, per account: how far the live subscription had caught up
 * (`lastSeen`) and the history cursors — together they let the next visit ask
 * only for what it missed (services/dm/engine).
 *
 * Dropped on sign-out, like the event cache: a shared device should not keep
 * anyone's conversations past their session.
 */
import { openDb, transact } from "@/lib/idb";
import { decryptSecret, encryptSecret, isVaultSupported } from "@/lib/skVault";
import type { CursorSnapshot } from "./cursors";

const DB_NAME = "brainstorm-dm";
const WRAPS = "wraps";
const STATE = "state";

/** Bounded per account; the oldest go first. */
export const MAX_CACHED_WRAPS = 30_000;

/** One wrap as kept: sealed contents, or a note that it could not be opened. */
export interface StoredWrap {
  key: string;
  owner: string;
  wrapId: string;
  /** The wrap's own (back-dated) time — what eviction and cursors run on. */
  at: number;
  envelope?: string;
  failed?: true;
  /**
   * Why it's kept unopened: "broken" (the payload can never open) or "skipped"
   * (opened, but not a message for the reader). A `failed` row without a
   * reason predates this field and may have been a signer hiccup — it is
   * opened again once.
   */
  reason?: "broken" | "skipped";
  /** The unwrap rules a failure was judged by (FAILED_RULES); one judged by older rules is opened again. */
  rules?: number;
}

/**
 * Bump when unwrapping starts accepting something it used to reject, so wraps this
 * device gave up on are opened again. 2: seals with tags (Amethyst's client tag).
 */
export const FAILED_RULES = 2;

export interface DmState {
  owner: string;
  /** When the live subscription last had every inbox relay caught up. */
  lastSeen?: number;
  cursors?: CursorSnapshot;
  /** How `cursors`/`lastSeen` were made; older ones are dropped and history fetched again. */
  syncVersion?: number;
  /** Sent messages not yet delivered everywhere, sealed (services/dm/engine's outbox). */
  outbox?: string;
}

export interface DmCacheBackend {
  wraps(owner: string): Promise<StoredWrap[]>;
  putWraps(rows: StoredWrap[]): Promise<void>;
  deleteWraps(keys: string[]): Promise<void>;
  state(owner: string): Promise<DmState | undefined>;
  putState(state: DmState): Promise<void>;
  clear(): Promise<void>;
  /** A check, taken now, that the cache hasn't been cleared since (sign-out). */
  guard?(): () => boolean;
}

/** How opened messages are sealed at rest. */
export interface Sealer {
  supported(): boolean;
  seal(plaintext: string, owner: string): Promise<string>;
  open(envelope: string, owner: string): Promise<string>;
}

export const deviceSealer: Sealer = {
  supported: isVaultSupported,
  seal: (plaintext, owner) => encryptSecret(new TextEncoder().encode(plaintext), owner),
  open: async (envelope, owner) => new TextDecoder().decode(await decryptSecret(envelope, owner)),
};

function build(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(WRAPS)) {
    const s = db.createObjectStore(WRAPS, { keyPath: "key" });
    s.createIndex("owner", "owner");
  }
  if (!db.objectStoreNames.contains(STATE)) db.createObjectStore(STATE, { keyPath: "owner" });
}

/**
 * Bumped by every clear. A write that was asked for before a sign-out but
 * reaches the database after it (the engine flushes as it stops) is dropped
 * rather than writing the departed account's messages back.
 */
let epoch = 0;

export function indexedDbBackend(): DmCacheBackend | null {
  if (typeof indexedDB === "undefined") return null;
  let connection: Promise<IDBDatabase> | null = null;
  const db = () => {
    connection ??= openDb(DB_NAME, 1, build).then((opened) => {
      opened.onclose = () => (connection = null);
      opened.onversionchange = () => {
        opened.close();
        connection = null;
      };
      return opened;
    });
    return connection.catch((error) => {
      connection = null;
      throw error;
    });
  };
  return {
    async wraps(owner) {
      const rows = await transact<StoredWrap[]>(await db(), WRAPS, "readonly", (store, keep) => {
        const req = store.index("owner").getAll(IDBKeyRange.only(owner));
        req.onsuccess = () => keep(req.result as StoredWrap[]);
      });
      return rows ?? [];
    },
    async putWraps(rows) {
      if (!rows.length) return;
      const asked = epoch;
      const opened = await db();
      if (asked !== epoch) return;
      await transact(opened, WRAPS, "readwrite", (store) => rows.forEach((r) => store.put(r)));
    },
    async deleteWraps(keys) {
      if (!keys.length) return;
      await transact(await db(), WRAPS, "readwrite", (store) => keys.forEach((k) => store.delete(k)));
    },
    async state(owner) {
      return transact<DmState>(await db(), STATE, "readonly", (store, keep) => {
        const req = store.get(owner);
        req.onsuccess = () => keep(req.result as DmState);
      });
    },
    async putState(state) {
      const asked = epoch;
      const opened = await db();
      if (asked !== epoch) return;
      await transact(opened, STATE, "readwrite", (store) => store.put(state));
    },
    guard() {
      const asked = epoch;
      return () => asked === epoch;
    },
    async clear() {
      epoch++;
      const opened = await db();
      await transact(opened, WRAPS, "readwrite", (store) => store.clear());
      await transact(opened, STATE, "readwrite", (store) => store.clear());
    },
  };
}

/** Test seam and lazy default: one backend for the app. */
let backend: DmCacheBackend | null | undefined;
export function dmCacheBackend(): DmCacheBackend | null {
  if (backend === undefined) backend = indexedDbBackend();
  return backend;
}
export function __useDmCacheBackend(fake: DmCacheBackend | null | undefined): void {
  backend = fake;
}

export const wrapKey = (owner: string, wrapId: string) => `${owner}:${wrapId}`;

/** What a sealed envelope holds: enough to rebuild the message without the signer. */
export interface CachedOpen {
  rumor: import("./giftWrap").Rumor;
  wrapId: string;
  wrapAt: number;
  relays: string[];
  sealAt?: number;
  /** NIP-40, wherever it was (rumor or wrap): the wrap's tags aren't kept. */
  expiresAt?: number;
}

/** Sign-out: every account's messages and paging state go. */
export async function clearDmCache(): Promise<void> {
  await dmCacheBackend()?.clear();
}
