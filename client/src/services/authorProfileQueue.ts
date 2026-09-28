import type { NostrEvent } from "nostr-tools";
import { searchRelay } from "@/lib/searchRelay";
import { eventStore } from "@/lib/eventStore";
import { PROFILE_FRESH_MS, claimRefresh, readProfileRows } from "@/lib/eventCache";
import { loadReplaceable } from "@/lib/loaders";

/**
 * One queue of author kind-0 lookups on the search relay, shared by every
 * search stream: asked once however many sections show the author, held open
 * until the relay answers, and only a few open at a time.
 */

const FLUSH_MS = 150;
const MAX_OPEN = 4;
const MAX_AUTHORS_PER_REQ = 200;
/** A half-open socket never sends EOSE; don't let it hold a slot forever. */
const LOOKUP_DEADLINE_MS = 10_000;
const NO_PROFILE_TTL_MS = 5 * 60_000;

/** Called with the profile, or with null once it is known there isn't one. */
type Listener = (profile: NostrEvent | null) => void;
interface Lookup {
  authors: string[];
  close: () => void;
}

const listeners = new Map<string, Set<Listener>>();
const queued = new Set<string>();
const inFlight = new Map<string, Lookup>();
const open = new Set<Lookup>();
/** Relay answered without a profile: don't ask again until then. */
const noProfileUntil = new Map<string, number>();
/** Authors already given their one retry after an unfinished lookup. */
const retried = new Set<string>();
/** Authors shown from an old device copy and being asked after it. */
const refreshing = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function release(lookup: Lookup): boolean {
  if (!open.delete(lookup)) return false;
  lookup.close();
  for (const a of lookup.authors) inFlight.delete(a);
  return true;
}

/**
 * An old device copy the search relay could not refresh: ask the profile
 * relays instead. The search relay does not index everyone, and a copy is
 * shown however old it is (lib/eventCache) — without this, the name of
 * someone it never indexed would never be corrected. Whatever arrives lands
 * in the store, where every page following it picks it up.
 */
function refreshElsewhere(pubkey: string): void {
  if (!refreshing.delete(pubkey)) return;
  void loadReplaceable(0, pubkey, { fromRelays: true }).catch(() => undefined);
}

/** The relay finished: whoever it didn't answer has no profile there. */
function settle(lookup: Lookup, answered: Set<string>): void {
  if (!release(lookup)) return;
  for (const a of lookup.authors) {
    if (answered.has(a)) {
      refreshing.delete(a);
      continue;
    }
    // A held copy says they do have a profile — just not one this relay has.
    if (refreshing.has(a)) {
      refreshElsewhere(a);
      continue;
    }
    noProfileUntil.set(a, Date.now() + NO_PROFILE_TTL_MS);
    tell(a, null);
  }
  flush();
}

/** Timed out or failed: authors still wanted get one more try. */
function abort(lookup: Lookup): void {
  if (!release(lookup)) return;
  for (const a of lookup.authors) {
    if (!listeners.has(a)) {
      refreshElsewhere(a);
      continue;
    }
    if (retried.has(a)) {
      tell(a, null);
    } else {
      retried.add(a);
      queued.add(a);
    }
  }
  flush();
}

function send(authors: string[]): void {
  const relay = searchRelay();
  if (!relay) {
    for (const a of authors) {
      refreshElsewhere(a);
      tell(a, null);
    }
    return;
  }
  const answered = new Set<string>();
  let sub: { unsubscribe: () => void } | undefined;
  const deadline = setTimeout(() => abort(lookup), LOOKUP_DEADLINE_MS);
  const lookup: Lookup = {
    authors,
    close: () => {
      clearTimeout(deadline);
      sub?.unsubscribe();
    },
  };
  open.add(lookup);
  for (const a of authors) inFlight.set(a, lookup);
  sub = relay
    .req({ kinds: [0], authors, search: "include:spam", limit: authors.length })
    .subscribe({
      next: (msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event?.kind === 0) {
          const profile = msg.event;
          answered.add(profile.pubkey);
          deliver(profile);
        } else if (msg.type === "EOSE") {
          settle(lookup, answered);
        }
      },
      error: () => abort(lookup),
    });
  if (!open.has(lookup)) sub.unsubscribe();
}

/** Tell whoever is waiting: the profile, or null for "there isn't one". */
function tell(pubkey: string, profile: NostrEvent | null): void {
  const waiting = listeners.get(pubkey);
  listeners.delete(pubkey);
  waiting?.forEach((l) => {
    try {
      l(profile);
    } catch {
      /* one caller's failure is not the batch's */
    }
  });
}

function deliver(profile: NostrEvent): void {
  try {
    eventStore.add(profile);
  } catch {
    return; // not a real event
  }
  tell(profile.pubkey, profile);
}

/** Batches being looked up on the device, which are about to hold a slot. */
let reading = 0;
/** A blocked IndexedDB open never settles; it must not hold a slot for good. */
const READ_DEADLINE_MS = 1500;

/**
 * People this device already knows are answered from its own copy
 * (lib/eventCache) and only the rest cost a REQ — except a copy old enough
 * to have changed, which is shown AND asked after, so the next visit is right.
 */
async function ask(authors: string[]): Promise<void> {
  // Held here across the read, so a second caller joins this batch instead of
  // starting another: between flush() and send() they are in neither queue.
  const reservation: Lookup = { authors, close: () => {} };
  for (const a of authors) inFlight.set(a, reservation);
  let missing = authors;
  let refresh: string[] = [];
  try {
    const held = await Promise.race([
      readProfileRows(authors),
      new Promise<Awaited<ReturnType<typeof readProfileRows>>>((resolve) =>
        setTimeout(() => resolve(new Map()), READ_DEADLINE_MS),
      ),
    ]);
    if (held.size > 0) {
      const old = Date.now() - PROFILE_FRESH_MS;
      missing = authors.filter((a) => !held.has(a));
      // Claimed, so a copy the loader is already refreshing isn't asked twice.
      refresh = [...held.values()].filter((row) => row.at < old && claimRefresh(`0:${row.event.pubkey}:`, 0)).map((row) => row.event.pubkey);
      refresh.forEach((a) => refreshing.add(a));
      for (const row of held.values()) deliver(row.event);
    }
  } catch {
    /* no copy to read — ask the relay for all of them */
  } finally {
    reading -= 1;
    for (const a of authors) if (inFlight.get(a) === reservation) inFlight.delete(a);
  }
  // Nobody is listening for a refresh — it is for the next visit, not this one.
  const wanted = [...missing.filter((a) => listeners.has(a)), ...refresh];
  if (wanted.length > 0) send(wanted);
  else flush();
}

function flush(): void {
  flushTimer = undefined;
  while (queued.size && open.size + reading < MAX_OPEN) {
    const authors = [...queued].slice(0, MAX_AUTHORS_PER_REQ);
    authors.forEach((a) => queued.delete(a));
    reading += 1;
    void ask(authors);
  }
}

/**
 * Ask for an author's profile; `onProfile` fires once if the relay has one.
 * The returned function withdraws the ask, closing a lookup nobody waits on.
 */
export function wantProfile(pubkey: string, onProfile: Listener): () => void {
  // Asked recently and the relay had nobody: say so now rather than wait again.
  if ((noProfileUntil.get(pubkey) ?? 0) > Date.now()) {
    onProfile(null);
    return () => {};
  }
  noProfileUntil.delete(pubkey);
  let set = listeners.get(pubkey);
  if (!set) listeners.set(pubkey, (set = new Set()));
  set.add(onProfile);
  if (!inFlight.has(pubkey)) {
    queued.add(pubkey);
    flushTimer ??= setTimeout(flush, FLUSH_MS);
  }
  return () => {
    const waiting = listeners.get(pubkey);
    waiting?.delete(onProfile);
    if (waiting?.size) return;
    listeners.delete(pubkey);
    queued.delete(pubkey);
    const lookup = inFlight.get(pubkey);
    if (lookup && lookup.authors.every((a) => !listeners.has(a)) && release(lookup)) flush();
  };
}

/** Test seam. */
export function __resetAuthorProfileQueue(): void {
  reading = 0;
  for (const lookup of open) lookup.close();
  open.clear();
  inFlight.clear();
  queued.clear();
  listeners.clear();
  noProfileUntil.clear();
  retried.clear();
  refreshing.clear();
  clearTimeout(flushTimer);
  flushTimer = undefined;
}
