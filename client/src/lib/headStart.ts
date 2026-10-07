import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";

/**
 * What index.html's inline script asked the relay while the bundle was still
 * downloading (see the comment there). Top's is taken once, on the first
 * results render, and its socket is done. All's is followed: the app carries on
 * with the request already out instead of asking the same question again.
 */
interface HeadStart {
  query: string;
  /** Which page it asked for: Top's sections, or All's one search. */
  tab?: "top" | "all";
  events: NostrEvent[];
  eose: boolean;
  /** The relay said EOSE — one REQ, one EOSE, so every filter finished. */
  complete?: boolean;
  /** It ended without an answer (refused, no Perspective, the socket gone). */
  failed?: boolean;
  /** Told every frame of the head start's own REQ as it arrives. */
  listeners?: ((frame: unknown[]) => void)[];
  socket: { close: () => void } | null;
}

/** What the head start collected, and whether it finished collecting it. */
export interface HeadStartResult {
  events: NostrEvent[];
  complete: boolean;
}

/** A relay subscription's messages, as `searchStream` reads them from `relay.req`. */
export type PageMessage = { type: string; event?: NostrEvent };
export type PageObserver = { next: (msg: PageMessage) => void; error: (err: unknown) => void };
/** A first page to follow in place of asking: subscribe, and get what came and what comes. */
export type FirstPage = (observer: PageObserver) => { unsubscribe: () => void };

let taken = false;

function parked(): HeadStart | undefined {
  return (window as unknown as { __headStart?: HeadStart }).__headStart;
}

function release(head: HeadStart): void {
  // One handover, and the page keeps no copy of the wire data afterwards.
  delete (window as unknown as { __headStart?: HeadStart }).__headStart;
  try {
    head.socket?.close();
  } catch {
    /* already gone */
  }
}

/**
 * The events collected for `query`, or none — for a different question, a
 * second ask, or a page the head start never ran on. Everything handed over is
 * in the event store, so a clicked result renders from what we already hold.
 *
 * `complete` says the relay finished answering: only then can the page ask for
 * what has happened SINCE rather than for the whole page again.
 */
export function takeHeadStart(query: string, tab: "top" | "all" = "top"): HeadStartResult {
  const head = parked();
  if (!head || taken) return { events: [], complete: false };
  taken = true;
  // Whether or not the answer is wanted, nobody else is coming for it.
  release(head);
  if (head.query !== query || (head.tab ?? "top") !== tab) return { events: [], complete: false };
  // The store verifies signatures and throws on a bad one; the head start is
  // unverified wire data, so one bad event must not take the page with it.
  const good: NostrEvent[] = [];
  for (const event of head.events) {
    try {
      eventStore.add(event);
      good.push(event);
    } catch {
      /* not a real event — drop it */
    }
  }
  return { events: good, complete: !!head.complete };
}

/**
 * All's head start as a first page to follow: what arrived before the app did,
 * then each frame as it lands, then the end. Null — and the head start let go —
 * for a different question, a second ask, or one that already failed: the page
 * asks the relay itself. One that fails while followed errors, and the caller
 * asks the relay then (services/search). Its socket closes at its end.
 */
export function followHeadStart(query: string, tab: "top" | "all" = "all"): FirstPage | null {
  const head = parked();
  if (!head || taken) return null;
  if (head.query !== query || (head.tab ?? "top") !== tab || head.failed || !head.listeners) {
    taken = true;
    release(head);
    return null;
  }
  taken = true;
  delete (window as unknown as { __headStart?: HeadStart }).__headStart;
  return (observer) => {
    let done = false;
    const listeners = head.listeners!;
    const finish = () => {
      if (done) return;
      done = true;
      const at = listeners.indexOf(deliver);
      if (at >= 0) listeners.splice(at, 1);
      try {
        head.socket?.close();
      } catch {
        /* already gone */
      }
    };
    function deliver(frame: unknown[]) {
      if (done) return;
      if (frame[0] === "EVENT") observer.next({ type: "EVENT", event: frame[2] as NostrEvent });
      else if (frame[0] === "EOSE") {
        observer.next({ type: "EOSE" });
        finish();
      } else if (frame[0] === "CLOSED") {
        finish();
        observer.error(new Error(String(frame[2] ?? "head start closed")));
      }
    }
    // What came before the app did, then the rest as it comes — synchronously in
    // between, so nothing is missed or told twice.
    for (const event of head.events) observer.next({ type: "EVENT", event });
    if (head.complete) deliver(["EOSE", "head"]);
    else if (head.eose) deliver(["CLOSED", "head", "head start ended"]);
    else listeners.push(deliver);
    return { unsubscribe: finish };
  };
}

/** Test seam. */
export function __resetHeadStart(): void {
  taken = false;
}
