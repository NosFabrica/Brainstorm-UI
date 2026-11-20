/**
 * Blossom files this device keeps between visits, by sha256: the Observer site's
 * `editions.json` and the editions it serves.
 *
 * A hash names one file forever, so a held copy is never stale and is never
 * re-asked. It is checked against its hash on the way out anyway: IndexedDB is
 * writable by anything that runs script on this origin, and a page shown from a
 * swapped copy would be a page its author never published.
 *
 * Bounded (MAX_BLOBS, oldest-read evicted), and dropped on sign-out with the
 * event cache: whose papers were read here is a browsing trail.
 */
import { openDb, transact } from "./idb";

const DB_NAME = "brainstorm-blobs";
const STORE = "blobs";

/** A few weeks of daily editions plus their index: bounded so it can't grow until the browser evicts the lot. */
export const MAX_BLOBS = 40;

interface BlobRow {
  sha256: string;
  text: string;
  /** Last read or written — the eviction order. */
  at: number;
}

/** This session's copies: a day tab switched back to is not a disk read. */
const memory = new Map<string, string>();

let db: Promise<IDBDatabase | null> | null = null;

function device(): Promise<IDBDatabase | null> {
  if (!db) {
    db =
      typeof indexedDB === "undefined"
        ? Promise.resolve(null)
        : openDb(DB_NAME, 1, (d) => {
            if (!d.objectStoreNames.contains(STORE)) {
              d.createObjectStore(STORE, { keyPath: "sha256" }).createIndex("at", "at");
            }
          }).catch(() => null);
  }
  return db;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashOf(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** The held file for this hash, if its bytes still have that hash. */
export async function readBlob(sha256: string): Promise<string | null> {
  const want = sha256.toLowerCase();
  const held = memory.get(want);
  if (held !== undefined) return held;
  const d = await device();
  if (!d) return null;
  try {
    const row = await transact<BlobRow | undefined>(d, STORE, "readonly", (s, keep) => {
      const req = s.get(want);
      req.onsuccess = () => keep(req.result as BlobRow | undefined);
    });
    if (!row || typeof row.text !== "string" || (await hashOf(row.text)) !== want) return null;
    memory.set(want, row.text);
    // Touched, so a paper read often outlives one read once.
    void transact(d, STORE, "readwrite", (s) => {
      s.put({ ...row, at: Date.now() });
    }).catch(() => undefined);
    return row.text;
  } catch {
    return null;
  }
}

/** Keep `text` under `sha256` — only when that IS its hash. */
export async function writeBlob(sha256: string, text: string): Promise<void> {
  const want = sha256.toLowerCase();
  if ((await hashOf(text)) !== want) return;
  memory.set(want, text);
  const d = await device();
  if (!d) return;
  try {
    await transact(d, STORE, "readwrite", (s) => {
      s.put({ sha256: want, text, at: Date.now() } satisfies BlobRow);
    });
    const count =
      (await transact<number>(d, STORE, "readonly", (s, keep) => {
        const req = s.count();
        req.onsuccess = () => keep(req.result);
      })) ?? 0;
    const over = count - MAX_BLOBS;
    if (over <= 0) return;
    await transact(d, STORE, "readwrite", (s) => {
      let left = over;
      const req = s.index("at").openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || left <= 0) return;
        memory.delete((cursor.value as BlobRow).sha256);
        cursor.delete();
        left -= 1;
        cursor.continue();
      };
    });
  } catch {
    /* no room, no storage, no matter */
  }
}

/** Drop everything. Called on sign-out. */
export async function clearBlobCache(): Promise<void> {
  memory.clear();
  const d = await device();
  if (!d) return;
  try {
    await transact(d, STORE, "readwrite", (s) => {
      s.clear();
    });
  } catch {
    /* nothing to do */
  }
}

/** Test seam: forget the session's copies and the open database. */
export function __resetBlobCache(): void {
  memory.clear();
  db = null;
}
