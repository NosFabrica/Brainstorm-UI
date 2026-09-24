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

/** In flight and settled alike: the one promise per person. */
const asked = new Map<string, Promise<PersonContent>>();
/** Settled answers, for a synchronous first paint. */
const settled = new Map<string, PersonContent>();

const keyOf = (pubkey: string) => pubkey.toLowerCase();

/** The remembered answer, if the ask has already come back. */
export function peekPersonContent(pubkey: string): PersonContent | undefined {
  return settled.get(keyOf(pubkey));
}

/** Test seam: forget every ask. */
export function __resetPersonContent(): void {
  asked.clear();
  settled.clear();
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
  const p: Promise<PersonContent> = ask(pubkey, timeoutMs).then(
    (content) => {
      settled.set(key, content);
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
