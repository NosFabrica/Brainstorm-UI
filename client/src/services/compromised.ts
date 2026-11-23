import { replacesFromServer, statusFromServer, type CompromisedStatus } from "@/lib/compromised";
import { getBrainstormApi } from "@/services/api/core";

/**
 * Which accounts are Compromised, for every surface that shows a person.
 *
 * The server's public `/compromised` check answers up to 500 keys a request,
 * so lookups made within a short window go out together and each key is asked
 * once a session — the same shape as services/trustSignals.
 *
 * Three answers, kept apart: a status (compromised), `null` (asked, not
 * marked) and `undefined` (not answered yet). A failed request reads as
 * `null`: an outage must never paint an account as compromised.
 *
 * The server is the only record: an account it hasn't been told about reads
 * as not compromised here too.
 */
const BATCH_WINDOW_MS = 50;
const MAX_BATCH = 500;
const TIMEOUT_MS = 8000;
const HEX_PUBKEY = /^[0-9a-f]{64}$/i;

const cache = new Map<string, Promise<CompromisedStatus | null>>();
const settled = new Map<string, CompromisedStatus | null>();
/** An owner's new account → the Compromised account it replaces (the server's `replaces`). */
const replacing = new Map<string, CompromisedStatus>();
/**
 * A successor → the first landed record naming it. `replacedCompromised` is a
 * render-time snapshot for every mounted mark, so it reads this rather than
 * scanning every record on each batch.
 */
const bySuccessor = new Map<string, CompromisedStatus>();
let queued = new Map<string, (status: CompromisedStatus | null) => void>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
/** The server answered that it has no such check (an older deploy): stop asking. */
let serverLacksCheck = false;
let generation = 0;

const listeners = new Set<() => void>();
let version = 0;

/** For useSyncExternalStore: a landed record can change another account's reading (its successor's). */
export function subscribeCompromised(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function compromisedVersion(): number {
  return version;
}

function announce(): void {
  version++;
  for (const listener of [...listeners]) listener();
}

async function ask(pubkeys: string[]): Promise<Map<string, CompromisedStatus>> {
  const out = new Map<string, CompromisedStatus>();
  if (serverLacksCheck) return out;
  try {
    const response = await fetch(`${getBrainstormApi()}/compromised`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkeys }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 405) serverLacksCheck = true;
    if (!response.ok) return out;
    const json = (await response.json()) as { data?: { results?: unknown[] } };
    for (const row of json.data?.results ?? []) {
      const status = statusFromServer(row);
      if (status) out.set(status.pubkey, status);
      const replaced = replacesFromServer(row);
      const asked = (row as { pubkey?: unknown })?.pubkey;
      if (replaced && typeof asked === "string") replacing.set(asked.toLowerCase(), replaced);
    }
  } catch {
    // not marked, as far as this session can tell
  }
  return out;
}

function flush(): void {
  flushTimer = undefined;
  const batch = [...queued];
  queued = new Map();
  const gen = generation;
  for (let i = 0; i < batch.length; i += MAX_BATCH) {
    const chunk = batch.slice(i, i + MAX_BATCH);
    void ask(chunk.map(([pubkey]) => pubkey)).then((found) => {
      if (gen !== generation) return;
      for (const [pubkey, resolve] of chunk) {
        const status = found.get(pubkey) ?? null;
        settled.set(pubkey, status);
        const successor = status?.successorPubkey;
        if (successor && !bySuccessor.has(successor)) bySuccessor.set(successor, status);
        resolve(status);
      }
      announce();
    });
  }
}

export function lookupCompromised(rawPubkey: string): Promise<CompromisedStatus | null> {
  const pubkey = rawPubkey.toLowerCase();
  if (!HEX_PUBKEY.test(pubkey)) return Promise.resolve(null);
  let p = cache.get(pubkey);
  if (!p) {
    p = new Promise((resolve) => queued.set(pubkey, resolve));
    cache.set(pubkey, p);
    if (!flushTimer) flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
  }
  return p;
}

/**
 * What we know right now: a status, `null` once asked and not marked, `undefined` before that.
 * The same object until the key is answered again, so it serves as a useSyncExternalStore snapshot.
 */
export function settledCompromised(rawPubkey: string): CompromisedStatus | null | undefined {
  const pubkey = rawPubkey.toLowerCase();
  return settled.get(pubkey);
}

/**
 * The Compromised account this one replaces, when `pubkey` is an owner's new
 * account: the server's `replaces` once this key has been asked about, or any
 * record landed this session that names it as the successor.
 */
export function replacedCompromised(rawPubkey: string): CompromisedStatus | null {
  const pubkey = rawPubkey.toLowerCase();
  return replacing.get(pubkey) ?? bySuccessor.get(pubkey) ?? null;
}

export function hasSettledCompromised(pubkey: string): boolean {
  return settled.has(pubkey.toLowerCase());
}

/** Test seam. */
export function __resetCompromised(): void {
  generation++;
  clearTimeout(flushTimer);
  flushTimer = undefined;
  queued = new Map();
  cache.clear();
  settled.clear();
  replacing.clear();
  bySuccessor.clear();
  serverLacksCheck = false;
}
