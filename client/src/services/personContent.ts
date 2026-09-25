import type { NostrEvent } from "nostr-tools";
import { searchRelay } from "@/lib/searchRelay";
import { NO_PERSON_CONTENT, categoriesOf, personContentFilters, type PersonContent } from "@/lib/personContent";

/**
 * What a person publishes, asked once per session.
 *
 * One REQ on the search relay carrying six limit-1 filters (probed
 * 2026-09-24: ~100ms per person; the relay's corpus is the widest we have,
 * so no outbox lookup). Every caller for the same person shares the one ask;
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

function readStore(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function remember(key: string, content: PersonContent): void {
  try {
    const store = readStore();
    const now = Date.now();
    // Forgotten as they age out, so the store never grows past a day of people.
    for (const [k, v] of Object.entries(store)) if (!v || now - v.at > PERSON_CONTENT_TTL_MS) delete store[k];
    store[key] = { at: now, chips: content.chips };
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
  if (!opts.keepStored) {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      // no storage
    }
  }
}

function ask(pubkey: string, timeoutMs: number): Promise<PersonContent> {
  const relay = searchRelay();
  if (!relay) return Promise.resolve(NO_PERSON_CONTENT);
  return new Promise((resolve, reject) => {
    const events: NostrEvent[] = [];
    let done = false;
    let sub: { unsubscribe: () => void } | undefined;
    const timer = setTimeout(() => finish(false), timeoutMs);
    function finish(ok: boolean) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub?.unsubscribe();
      if (ok) resolve({ chips: categoriesOf(events) });
      else reject(new Error("person content: no answer"));
    }
    sub = relay.req(personContentFilters(pubkey)).subscribe({
      next: (msg: { type: string; event?: NostrEvent }) => {
        if (msg.type === "EVENT" && msg.event) events.push(msg.event);
        else if (msg.type === "EOSE") finish(true);
        else if (msg.type === "CLOSED") finish(false);
      },
      error: () => finish(false),
    });
    // A stream that answered synchronously has already finished; the
    // subscription it left behind is closed here.
    if (done) sub.unsubscribe();
  });
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
