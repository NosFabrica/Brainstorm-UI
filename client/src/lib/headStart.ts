import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";

/**
 * What index.html's inline script asked the relay while the bundle was still
 * downloading (see the comment there). The app takes it once, on the first
 * results render, and the head start's socket is done.
 */
interface HeadStart {
  query: string;
  events: NostrEvent[];
  eose: boolean;
  socket: { close: () => void } | null;
}

let taken = false;

function parked(): HeadStart | undefined {
  return (window as unknown as { __headStart?: HeadStart }).__headStart;
}

/**
 * The events collected for `query`, or none — for a different question, a
 * second ask, or a page the head start never ran on. Everything handed over is
 * in the event store, so a clicked result renders from what we already hold.
 */
export function takeHeadStart(query: string): NostrEvent[] {
  const head = parked();
  if (!head || taken) return [];
  taken = true;
  // One handover, and the page keeps no copy of the wire data afterwards.
  delete (window as unknown as { __headStart?: HeadStart }).__headStart;
  // Whether or not the answer is wanted, nobody else is coming for it.
  try {
    head.socket?.close();
  } catch {
    /* already gone */
  }
  if (head.query !== query) return [];
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
  return good;
}

/** Test seam. */
export function __resetHeadStart(): void {
  taken = false;
}
