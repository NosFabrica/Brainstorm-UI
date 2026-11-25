import { leaseSideSearchRelay } from "@/lib/searchRelay";
import { searchOnce } from "@/lib/searchOnce";
import { NO_PERSON_CONTENT, categoriesOf, personContentFilters, type PersonContent } from "@/lib/personContent";
import { capSettledMemo } from "@/lib/boundedMap";

/**
 * What a person publishes, asked once per session.
 *
 * One REQ on the search relay carrying six limit-1 filters (probed
 * 2026-09-24: ~100ms per person; the relay's corpus is the widest we have,
 * so no outbox lookup), on its shared side socket (lib/searchRelay): the
 * typeahead asks this for every person it suggests, between keystrokes, and on
 * the search's own socket each ask was a turn in the relay's queue in front of
 * the next suggestion. Every caller for the same person shares the one ask;
 * the answer is kept for the session. A refusal, a broken stream or the
 * deadline rejects and is forgotten, so the next mount asks again. No relay
 * configured: nothing to say, and that is remembered too.
 */
export const PERSON_CONTENT_TIMEOUT_MS = 4000;

/**
 * A day's worth of answers lives in local storage too, so a returning
 * searcher's recents wear their chips at once instead of a beat late on
 * every visit (Benjamin, 2026-09-24). First-party, functional, tiny.
 */
const STORE_KEY = "brainstorm_person_content:v1";
export const PERSON_CONTENT_TTL_MS = 24 * 60 * 60 * 1000;
type Stored = Record<string, { at: number; chips: PersonContent["chips"] }>;

/**
 * The store as last read, parsed once. Every row of a typeahead or a People page peeks it per
 * render, and parsing the whole map for each of them was the cost; this copy is what they read,
 * kept in step by `remember`, and read again when another tab writes the store.
 */
let parsedStore: Stored | null = null;

function readStore(): Stored {
  if (parsedStore) return parsedStore;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    parsedStore = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Stored) : {};
  } catch {
    parsedStore = {};
  }
  return parsedStore;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORE_KEY || e.key === null) parsedStore = null;
  });
}

function remember(key: string, content: PersonContent): void {
  const store = readStore();
  const now = Date.now();
  // Forgotten as they age out, so the store never grows past a day of people.
  for (const [k, v] of Object.entries(store)) if (!v || now - v.at > PERSON_CONTENT_TTL_MS) delete store[k];
  store[key] = { at: now, chips: content.chips };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // no storage: the session memory still serves
  }
}

function recall(key: string): PersonContent | undefined {
  const entry = readStore()[key];
  if (!entry || typeof entry.at !== "number" || !Array.isArray(entry.chips)) return undefined;
  if (Date.now() - entry.at > PERSON_CONTENT_TTL_MS) return undefined;
  return { chips: entry.chips };
}

/** In flight and settled alike: the one promise per person. */
const asked = new Map<string, Promise<PersonContent>>();
/** Settled answers, for a synchronous first paint. */
const settled = new Map<string, PersonContent>();
/** People remembered at most, oldest answered first (one still being asked is never dropped). */
const MAX_PEOPLE = 2000;

const keyOf = (pubkey: string) => pubkey.toLowerCase();

/** The remembered answer — this session's, or a day-old one from the store. */
export function peekPersonContent(pubkey: string): PersonContent | undefined {
  const key = keyOf(pubkey);
  const known = settled.get(key);
  if (known) return known;
  const stored = recall(key);
  if (stored) settled.set(key, stored);
  return stored;
}

/** Test seam: forget every ask — and, unless told to keep it, the store too. */
export function __resetPersonContent(opts: { keepStored?: boolean } = {}): void {
  asked.clear();
  settled.clear();
  parsedStore = null;
  if (!opts.keepStored) {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      // no storage
    }
  }
}

/**
 * One question on the side socket, through the store (lib/searchOnce): a chip
 * comes only from the person's own events that the store kept. Rejects unless
 * the relay finished (EOSE), so the next mount asks again.
 */
async function ask(pubkey: string, timeoutMs: number): Promise<PersonContent> {
  const lease = leaseSideSearchRelay();
  if (!lease) return NO_PERSON_CONTENT;
  const { relay, release } = lease;
  try {
    const { events, answered } = await searchOnce(personContentFilters(pubkey), { relay, timeoutMs });
    if (!answered) throw new Error("person content: no answer");
    return { chips: categoriesOf(events.filter((e) => e.pubkey === pubkey)) };
  } finally {
    release();
  }
}

export function fetchPersonContent(pubkey: string, timeoutMs = PERSON_CONTENT_TIMEOUT_MS): Promise<PersonContent> {
  const key = keyOf(pubkey);
  const known = asked.get(key);
  if (known) return known;
  const remembered = peekPersonContent(pubkey);
  if (remembered) {
    const p = Promise.resolve(remembered);
    asked.set(key, p);
    return p;
  }
  const p: Promise<PersonContent> = ask(pubkey, timeoutMs).then(
    (content) => {
      settled.set(key, content);
      capSettledMemo(asked, settled, MAX_PEOPLE);
      remember(key, content);
      return content;
    },
    (err) => {
      if (asked.get(key) === p) asked.delete(key);
      throw err;
    },
  );
  asked.set(key, p);
  return p;
}
