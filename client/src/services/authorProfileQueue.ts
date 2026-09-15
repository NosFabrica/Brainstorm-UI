import type { NostrEvent } from "nostr-tools";
import { searchRelay } from "@/lib/searchRelay";
import { eventStore } from "@/lib/eventStore";

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

type Listener = (profile: NostrEvent) => void;
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
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function release(lookup: Lookup): boolean {
  if (!open.delete(lookup)) return false;
  lookup.close();
  for (const a of lookup.authors) inFlight.delete(a);
  return true;
}

/** The relay finished: whoever it didn't answer has no profile there. */
function settle(lookup: Lookup, answered: Set<string>): void {
  if (!release(lookup)) return;
  for (const a of lookup.authors) {
    if (answered.has(a)) continue;
    noProfileUntil.set(a, Date.now() + NO_PROFILE_TTL_MS);
    listeners.delete(a);
  }
  flush();
}

/** Timed out or failed: authors still wanted get one more try. */
function abort(lookup: Lookup): void {
  if (!release(lookup)) return;
  for (const a of lookup.authors) {
    if (!listeners.has(a)) continue;
    if (retried.has(a)) {
      listeners.delete(a);
    } else {
      retried.add(a);
      queued.add(a);
    }
  }
  flush();
}

function send(authors: string[]): void {
  const relay = searchRelay();
  if (!relay) return;
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
          eventStore.add(profile);
          answered.add(profile.pubkey);
          listeners.get(profile.pubkey)?.forEach((l) => l(profile));
          listeners.delete(profile.pubkey);
        } else if (msg.type === "EOSE") {
          settle(lookup, answered);
        }
      },
      error: () => abort(lookup),
    });
  if (!open.has(lookup)) sub.unsubscribe();
}

function flush(): void {
  flushTimer = undefined;
  while (queued.size && open.size < MAX_OPEN) {
    const authors = [...queued].slice(0, MAX_AUTHORS_PER_REQ);
    authors.forEach((a) => queued.delete(a));
    send(authors);
  }
}

/**
 * Ask for an author's profile; `onProfile` fires once if the relay has one.
 * The returned function withdraws the ask, closing a lookup nobody waits on.
 */
export function wantProfile(pubkey: string, onProfile: Listener): () => void {
  if ((noProfileUntil.get(pubkey) ?? 0) > Date.now()) return () => {};
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
  for (const lookup of open) lookup.close();
  open.clear();
  inFlight.clear();
  queued.clear();
  listeners.clear();
  noProfileUntil.clear();
  retried.clear();
  clearTimeout(flushTimer);
  flushTimer = undefined;
}
