/**
 * One question asked of the search relay, answered once: every event it sends
 * goes through the EventStore, and what comes back is the store's copy.
 *
 * Every one-shot read of the search relay used to hand-roll the same REQ loop
 * (an author's profile, a face for a result, the reader's RSVP, what a person
 * publishes, an assertion footprint), and each trusted the relay in its own
 * way: one took `eventStore.add` throwing for a refusal (it returns null), one
 * kept a copy the store had refused, one counted EVENTs nobody verified. Here
 * an event counts only if it answers the filters asked and the store keeps it;
 * a replaceable the store already holds a newer version of comes back as that
 * newer version, so the caller never acts on a copy the store has replaced.
 *
 * `answered` is whether the relay finished (EOSE). A refusal (CLOSED), a broken
 * socket, the deadline or `stop` end it unanswered, keeping what arrived — so a
 * caller can tell "the relay has none" from "the relay didn't say".
 */
import type { NostrEvent } from "nostr-tools";
import type { Observable } from "rxjs";
import type { Filter } from "applesauce-core/helpers/filter";
import type { Relay } from "applesauce-relay";
import { eventStore } from "./eventStore";
import { answersFilters } from "./relayAnswers";
import { searchRelay } from "./searchRelay";

export interface SearchOnceResult {
  /** The store's copy of each event kept, in arrival order, one per id. */
  events: NostrEvent[];
  /** The relay sent EOSE: what it holds is all in `events`. */
  answered: boolean;
}

export interface SearchOnceOptions {
  timeoutMs: number;
  /** Ends the question early, keeping what arrived (`answered: false`). */
  stop?: Observable<unknown>;
  /** Each kept event as it lands — the store's copy. */
  onEvent?: (event: NostrEvent) => void;
  /** The socket to ask on: the search relay's by default; a side socket (lib/searchRelay) for a question beside a search. */
  relay?: Pick<Relay, "req"> | null;
}

type Message = { type: string; event?: NostrEvent };

export function searchOnce(filters: Filter | Filter[], opts: SearchOnceOptions): Promise<SearchOnceResult> {
  const asked = Array.isArray(filters) ? filters : [filters];
  let relay: Pick<Relay, "req"> | null;
  try {
    relay = opts.relay === undefined ? searchRelay() : opts.relay;
  } catch {
    relay = null;
  }
  if (!relay) return Promise.resolve({ events: [], answered: false });
  const socket = relay;

  return new Promise((resolve) => {
    const kept = new Map<string, NostrEvent>();
    let done = false;
    let sub: { unsubscribe: () => void } | undefined;
    let stopSub: { unsubscribe: () => void } | undefined;
    const timer = setTimeout(() => finish(false), opts.timeoutMs);
    function finish(answered: boolean) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub?.unsubscribe();
      stopSub?.unsubscribe();
      resolve({ events: [...kept.values()], answered });
    }
    function take(event: NostrEvent) {
      if (!answersFilters(asked, event)) return;
      let stored: NostrEvent | null;
      try {
        stored = eventStore.add(event) as NostrEvent | null;
      } catch {
        stored = null;
      }
      if (!stored || kept.has(stored.id)) return;
      kept.set(stored.id, stored);
      try {
        opts.onEvent?.(stored);
      } catch {
        /* one caller's failure is not the question's */
      }
    }
    stopSub = opts.stop?.subscribe(() => finish(false));
    if (done) {
      stopSub?.unsubscribe();
      return;
    }
    try {
      sub = (socket.req(asked) as unknown as Observable<Message>).subscribe({
        next: (msg) => {
          if (done) return;
          if (msg?.type === "EVENT" && msg.event) take(msg.event);
          else if (msg?.type === "EOSE") finish(true);
          else if (msg?.type === "CLOSED") finish(false);
        },
        error: () => finish(false),
        complete: () => finish(false),
      });
    } catch {
      finish(false);
    }
    // A stream that answered synchronously has already finished; the
    // subscription it left behind is closed here.
    if (done) sub?.unsubscribe();
  });
}
