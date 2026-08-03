/**
 * The accounts blobs. One per storage area, holding whole serialised Accounts —
 * the envelope and the ncryptsec live *inside* `SerializedAccount.signer`, so a
 * blob is not an index pointing at keys, it **is** the keys. Nothing here may
 * ever drop an entry: what cannot be loaded is quarantined next to it, and the
 * blob as it was found is kept as a backup.
 */
import { AccountManager, BaseAccount, type IAccount } from "applesauce-accounts";
import { map, merge, of, startWith, switchMap, type Observable } from "rxjs";

import { LocalAccount } from "./local-account";
import { isRemembered, type AccountMetadata, type BrainstormAccount } from "./metadata";

export const ACCOUNTS_KEY = "brainstorm_accounts_v2";
export const QUARANTINE_KEY = `${ACCOUNTS_KEY}.quarantine`;
export const BACKUP_KEY = `${ACCOUNTS_KEY}.bak`;
export const ACTIVE_KEY = "brainstorm_active_account";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Remembered Accounts live in `device`, the rest in `tab`. Both encrypted. */
export type StorageSeam = { device: StorageLike; tab: StorageLike };

export function createMemoryStorage(): StorageLike {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}

/** localStorage/sessionStorage, degrading to memory where they throw (private browsing). */
export function browserStorage(): StorageSeam {
  const guard = (store: Storage | undefined): StorageLike => {
    if (!store) return createMemoryStorage();
    return {
      getItem: (key) => {
        try {
          return store.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          store.setItem(key, value);
        } catch (err) {
          console.error("accounts: could not write to storage", err);
        }
      },
      removeItem: (key) => {
        try {
          store.removeItem(key);
        } catch {
          /* already gone, or unreachable */
        }
      },
    };
  };

  const has = typeof window !== "undefined";
  return {
    device: guard(has ? window.localStorage : undefined),
    tab: guard(has ? window.sessionStorage : undefined),
  };
}

/**
 * Whether either blob already holds an Account.
 *
 * "Holds an Account", not "a blob exists": bootstrap writes an empty blob on
 * every anonymous visit, so existence alone would read as "v2 owns this browser"
 * for someone who has never signed in. An unreadable blob counts as holding one —
 * `load` quarantines it, and whatever is in there is an identity.
 */
export function hasStoredAccounts(storage: StorageSeam): boolean {
  const holds = (store: StorageLike) => {
    const raw = store.getItem(ACCOUNTS_KEY);
    if (raw === null) return false;
    try {
      const parsed: unknown = JSON.parse(raw);
      return !Array.isArray(parsed) || parsed.length > 0;
    } catch {
      return true;
    }
  };
  return holds(storage.device) || holds(storage.tab);
}

export type Persistence = {
  /** Restore Accounts and the Active Account. Quarantines whatever won't load. */
  load(): void;
  /** Write both blobs. Never touches a quarantine or a backup. */
  save(): void;
  /** Subscribe to accounts, their metadata, their key material and the Active Account. */
  start(): () => void;
  /**
   * Restore one Remembered Account by id, for a tab that started before it
   * existed. One entry, not the whole blob: re-loading everything would
   * duplicate what this tab already holds.
   */
  adopt(id: string): BrainstormAccount | null;
};

export function createPersistence(
  manager: AccountManager<AccountMetadata>,
  storage: StorageSeam,
): Persistence {
  /** The last form each Account serialised into, so a later failure can't lose it. */
  const lastGood = new Map<string, unknown>();
  const backupTaken = new Set<StorageLike>();

  function readJSON(store: StorageLike, key: string): unknown {
    const raw = store.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Park an entry we couldn't load, in the area it came from — a non-Remembered
   * entry must not be promoted into localStorage. Append-only, and deduped so
   * reloads don't pile up.
   */
  function quarantine(store: StorageLike, entry: unknown): void {
    const existing = readJSON(store, QUARANTINE_KEY);
    const parked = Array.isArray(existing) ? existing : [];
    const serialised = JSON.stringify(entry);
    if (parked.some((e) => JSON.stringify(e) === serialised)) return;
    parked.push(entry);
    store.setItem(QUARANTINE_KEY, JSON.stringify(parked));
  }

  /** Keep a blob as we first found it, before anything overwrites it. */
  function takeBackup(store: StorageLike): void {
    if (backupTaken.has(store)) return;
    backupTaken.add(store);
    if (store.getItem(BACKUP_KEY) !== null) return;
    const original = store.getItem(ACCOUNTS_KEY);
    if (original !== null) store.setItem(BACKUP_KEY, original);
  }

  /** Deserialise one entry into the manager, or park it. */
  function restore(store: StorageLike, entry: unknown, remembered: boolean): BrainstormAccount | null {
    try {
      const account = AccountManager.deserialize([...manager.types.values()], entry as any);
      // an entry that doesn't say takes `remembered` from where it was found
      account.metadata = { remembered, ...(account.metadata ?? {}) };
      manager.addAccount(account);
      lastGood.set(account.id, account.toJSON());
      return account as BrainstormAccount;
    } catch {
      quarantine(store, entry);
      return null;
    }
  }

  function loadFrom(store: StorageLike, remembered: boolean): void {
    takeBackup(store);
    const raw = store.getItem(ACCOUNTS_KEY);
    if (raw === null) return;

    let entries: unknown;
    try {
      entries = JSON.parse(raw);
    } catch {
      quarantine(store, raw);
      return;
    }
    if (!Array.isArray(entries)) {
      quarantine(store, entries);
      return;
    }

    // per entry, because one unknown type must not cost us the other identities
    for (const entry of entries) restore(store, entry, remembered);
  }

  function adopt(id: string): BrainstormAccount | null {
    const held = manager.getAccount(id);
    if (held) return held as BrainstormAccount;

    const entries = readJSON(storage.device, ACCOUNTS_KEY);
    if (!Array.isArray(entries)) return null;
    const entry = entries.find((e) => (e as { id?: string })?.id === id);
    return entry ? restore(storage.device, entry, true) : null;
  }

  function serialise(account: IAccount<any, any, AccountMetadata>): unknown {
    try {
      const json = account.toJSON();
      lastGood.set(account.id, json);
      return json;
    } catch (err) {
      console.error("accounts: could not serialise an account", err);
      return lastGood.get(account.id) ?? null;
    }
  }

  function save(): void {
    takeBackup(storage.device);
    takeBackup(storage.tab);
    const remembered: unknown[] = [];
    const perTab: unknown[] = [];
    for (const account of manager.accounts) {
      // A key with no at-rest form yet — it stays usable in this tab, but writing
      // it would park a row nothing can open *and* make the blob non-empty, which
      // is what tells migration this browser is already v2's.
      if (account instanceof LocalAccount && !account.persistable) continue;
      const json = serialise(account);
      if (json === null) continue;
      (isRemembered(account) ? remembered : perTab).push(json);
    }
    storage.device.setItem(ACCOUNTS_KEY, JSON.stringify(remembered));
    storage.tab.setItem(ACCOUNTS_KEY, JSON.stringify(perTab));
  }

  function saveActive(): void {
    const active = manager.active;
    if (active) storage.device.setItem(ACTIVE_KEY, active.id);
    else storage.device.removeItem(ACTIVE_KEY);
  }

  function load(): void {
    loadFrom(storage.device, true);
    loadFrom(storage.tab, false);

    const activeId = storage.device.getItem(ACTIVE_KEY);
    if (activeId && manager.getAccount(activeId)) manager.setActive(activeId);
  }

  /**
   * Everything about an Account that has to reach storage. `metadata$` covers the
   * Session and the display cache; `changed$` covers key material — a first unlock
   * mints an Unlock cache, and a stale one is discarded, neither of which touches
   * metadata. Saving off `accounts$` alone would silently miss both.
   */
  function changes(account: IAccount<any, any, AccountMetadata>): Observable<unknown>[] {
    const streams: Observable<unknown>[] = [
      (account as BaseAccount<any, any, AccountMetadata>).metadata$,
    ];
    const signer = account.signer as { changed$?: Observable<unknown> } | undefined;
    if (signer?.changed$) streams.push(signer.changed$);
    return streams;
  }

  function start(): () => void {
    const sub = manager.accounts$
      .pipe(
        switchMap((accounts) =>
          accounts.length
            ? merge(...accounts.flatMap(changes)).pipe(
                startWith(null),
                map(() => accounts),
              )
            : of(accounts),
        ),
      )
      .subscribe(() => save());

    sub.add(manager.active$.subscribe(() => saveActive()));
    return () => sub.unsubscribe();
  }

  return { load, save, start, adopt };
}
