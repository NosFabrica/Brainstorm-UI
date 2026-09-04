/**
 * Going to an event, on Nostr (Benjamin: "I don't want this to go to
 * Google — keep it Nostr"). A NIP-52 RSVP (kind 31925) under the reader's
 * own key: addressable, naming the event's coordinate and id, status
 * accepted, the host p-tagged. Other clients understand it, and reading it
 * back is how Brainstorm remembers you're going. Withdrawal is the NIP-09
 * delete the vouch uses, naming id and coordinate so relays drop every
 * version. Signed by the Active Account, sent through the normal outbox.
 */
import type { NostrEvent } from "nostr-tools";
import { activeAccount, signAs, signingFailure, type PublishOutcome } from "@/accounts/signing";
import { publishToRelays } from "@/services/nostr";
import { searchRelay } from "@/lib/searchRelay";

export const RSVP_KIND = 31925;
const CLIENT_TAG = ["client", "Brainstorm"];

type CalendarLike = { id: string; kind: number; pubkey: string; tags: string[][] };

export type RsvpStatus = "accepted" | "tentative" | "declined";
export interface MyRsvp {
  id: string;
  d: string;
  status: RsvpStatus;
}
export type RsvpOutcome = PublishOutcome & { event?: NostrEvent };

/** The event's addressable coordinate, `kind:pubkey:d`. */
export function calendarAddress(event: CalendarLike): string {
  const d = event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  return `${event.kind}:${event.pubkey}:${d}`;
}

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  } catch {
    return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  }
}

/** Publish the reader's RSVP (accepted by default). */
export async function publishRsvp(event: CalendarLike, status: RsvpStatus = "accepted"): Promise<RsvpOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  if (account.pubkey === event.pubkey) return { success: false, error: "You can't RSVP to your own event" };
  try {
    const signed = await signAs(account, {
      kind: RSVP_KIND,
      tags: [
        ["a", calendarAddress(event)],
        ["e", event.id],
        ["d", randomId()],
        ["status", status],
        ["p", event.pubkey],
        ["alt", `RSVP: ${status}`],
        CLIENT_TAG,
      ],
      content: "",
    });
    const res = await publishToRelays(signed);
    return { ...res, event: signed };
  } catch (e) {
    return signingFailure(e);
  }
}

/** Withdraw an RSVP: a NIP-09 delete naming the event AND its coordinate. */
export async function withdrawRsvp(rsvp: { id: string; d: string }): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const signed = await signAs(account, {
      kind: 5,
      tags: [["e", rsvp.id], ["a", `${RSVP_KIND}:${account.pubkey}:${rsvp.d}`], ["k", String(RSVP_KIND)], CLIENT_TAG],
      content: "RSVP withdrawn",
    });
    return await publishToRelays(signed);
  } catch (e) {
    return signingFailure(e);
  }
}

const cache = new Map<string, Promise<MyRsvp | null>>();

/** The reader's newest RSVP to this event, from the search relay (wide
 *  corpus, one REQ), memoized per event and reader for the session. */
export function fetchMyRsvp(event: CalendarLike, me: string, timeoutMs = 5000): Promise<MyRsvp | null> {
  const key = `${me}|${calendarAddress(event)}`;
  let p = cache.get(key);
  if (p) return p;
  p = new Promise<MyRsvp | null>((resolve) => {
    let relay: ReturnType<typeof searchRelay>;
    try {
      relay = searchRelay();
    } catch {
      relay = null;
    }
    if (!relay) return resolve(null);
    let newest: (MyRsvp & { at: number }) | null = null;
    let sub: { unsubscribe: () => void } | null = null;
    const timer = setTimeout(finish, timeoutMs);
    try {
      sub = relay
        .req({ kinds: [RSVP_KIND], authors: [me], "#a": [calendarAddress(event)], search: "include:spam", limit: 10 })
        .subscribe((msg: { type: string; event?: NostrEvent }) => {
          if (msg.type === "EVENT" && msg.event) {
            const e = msg.event;
            const tag = (k: string) => e.tags.find((t) => t[0] === k)?.[1];
            const status = (tag("status") ?? "accepted") as RsvpStatus;
            if (!newest || e.created_at > newest.at) newest = { id: e.id, d: tag("d") ?? "", status, at: e.created_at };
          } else if (msg.type === "EOSE" || msg.type === "CLOSED") finish();
        });
    } catch {
      finish();
    }
    function finish() {
      clearTimeout(timer);
      sub?.unsubscribe();
      resolve(newest ? { id: newest.id, d: newest.d, status: newest.status } : null);
    }
  });
  cache.set(key, p);
  return p;
}

/** After a publish or withdrawal the memo is stale — forget it. */
export function forgetMyRsvp(event: CalendarLike, me: string): void {
  cache.delete(`${me}|${calendarAddress(event)}`);
}

/** Test seam. */
export function __resetRsvpCache(): void {
  cache.clear();
}
