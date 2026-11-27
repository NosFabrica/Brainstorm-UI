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
import { relayHintFor, tagWithHint } from "@/lib/relayRouting";
import { searchOnce } from "@/lib/searchOnce";
import { isNewerVersion } from "@/lib/newestPerAddress";
import { capMap } from "@/lib/boundedMap";

export const RSVP_KIND = 31925;
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
  // Where the host writes, so a reader of this RSVP can find the event it
  // answers. The publish itself also reaches the host's INBOX — see
  // `publishRelaysFor` — which is what actually delivers the RSVP to them.
  const hint = relayHintFor(event.pubkey);
  try {
    const signed = await signAs(account, {
      kind: RSVP_KIND,
      tags: [
        tagWithHint("a", calendarAddress(event), hint),
        tagWithHint("e", event.id, hint),
        ["d", randomId()],
        ["status", status],
        tagWithHint("p", event.pubkey, hint),
        ["alt", `RSVP: ${status}`],
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
export async function withdrawRsvp(rsvp: { id: string; d: string }, hostPubkey?: string): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const signed = await signAs(account, {
      kind: 5,
      tags: [
        // `e` and `a` name the viewer's OWN RSVP, so they hint where the viewer
        // writes. Only the `p` below names the host.
        tagWithHint("e", rsvp.id, relayHintFor(account.pubkey)),
        tagWithHint("a", `${RSVP_KIND}:${account.pubkey}:${rsvp.d}`, relayHintFor(account.pubkey)),
        ["k", String(RSVP_KIND)],
        // The host, so the withdrawal reaches the inbox the RSVP itself reached.
        // Both `e` and `a` here point at the VIEWER's own events, so nothing in
        // the tags would otherwise name the person this actually concerns.
        ...(hostPubkey ? [tagWithHint("p", hostPubkey, relayHintFor(hostPubkey))] : []),
      ],
      content: "RSVP withdrawn",
    });
    return await publishToRelays(signed);
  } catch (e) {
    return signingFailure(e);
  }
}

const cache = new Map<string, Promise<MyRsvp | null>>();
/** Readers × events asked this session; the oldest are forgotten past this. */
const MAX_REMEMBERED = 500;

/**
 * The reader's newest RSVP to this event, from the search relay (wide corpus,
 * one REQ), memoized per event and reader for the session — but only an
 * answer the relay finished: a timeout or a refusal is asked again next time.
 * Only the reader's own RSVPs that the store kept count (lib/searchOnce).
 */
export function fetchMyRsvp(event: CalendarLike, me: string, timeoutMs = 5000): Promise<MyRsvp | null> {
  const key = `${me}|${calendarAddress(event)}`;
  const known = cache.get(key);
  if (known) return known;
  const address = calendarAddress(event);
  const p = searchOnce(
    { kinds: [RSVP_KIND], authors: [me], "#a": [address], search: "include:spam", limit: 10 },
    { timeoutMs },
  ).then(({ events, answered }) => {
    if (!answered && cache.get(key) === p) cache.delete(key);
    let newest: NostrEvent | undefined;
    for (const e of events) {
      if (e.kind !== RSVP_KIND || e.pubkey !== me) continue;
      if (!e.tags.some((t) => t[0] === "a" && t[1] === address)) continue;
      if (isNewerVersion(e, newest)) newest = e;
    }
    if (!newest) return null;
    const tag = (k: string) => newest!.tags.find((t) => t[0] === k)?.[1];
    return { id: newest.id, d: tag("d") ?? "", status: (tag("status") ?? "accepted") as RsvpStatus };
  });
  cache.set(key, p);
  capMap(cache, MAX_REMEMBERED);
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
