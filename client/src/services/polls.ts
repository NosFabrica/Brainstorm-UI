/**
 * Polls on Nostr: asking relays for a poll's answers, and answering one.
 *
 * A NIP-88 response (kind 1018) is signed by the Active Account and sent to
 * the reader's own relays, the poll author's inbox and the relays the poll
 * names (`relay` tags) — where the author asked for answers to go. Publishing
 * adds it to the EventStore, so the tally a card draws from the store moves at
 * once. Zap-poll answers are zaps; nothing here sends those.
 */
import type { NostrEvent } from "nostr-tools";
import { activeAccount, signAs, signingFailure, type PublishOutcome } from "@/accounts/signing";
import { fetchEventsByFilter, fetchFromSearchRelayByFilters, publishToRelays } from "@/services/nostr";
import { relayHintFor, tagWithHint } from "@/lib/relayRouting";
import { PROFILE_RELAYS } from "@/lib/relays";
import { POLL_RESPONSE_KIND, ZAP_RECEIPT_KIND, acceptedChoices, type Poll } from "@/lib/polls";

/** Responses asked for at most: a poll past this many is read from what came back. */
const ANSWERS_ASKED = 1000;
/** Relay hints from a poll's own tags, at most. */
const MAX_POLL_RELAYS = 6;

function readRelays(hints: string[]): string[] {
  return Array.from(new Set([...hints.slice(0, MAX_POLL_RELAYS), ...PROFILE_RELAYS]));
}

/** Everything matching `filter` from `relays` and the search relay, into the store. Never rejects. */
async function askEverywhere(filter: Record<string, unknown>, relays: string[]): Promise<NostrEvent[]> {
  const answers = await Promise.all([
    fetchEventsByFilter(filter, relays).catch(() => [] as NostrEvent[]),
    fetchFromSearchRelayByFilters([filter], 6000).catch(() => [] as NostrEvent[]),
  ]);
  const byId = new Map<string, NostrEvent>();
  for (const ev of answers.flat()) byId.set(ev.id, ev);
  return [...byId.values()];
}

/** A NIP-88 poll's responses (kind 1018), from the relays it names, the usual ones and the search relay. */
export function fetchPollResponses(pollId: string, pollRelays: string[] = []): Promise<NostrEvent[]> {
  return askEverywhere({ kinds: [POLL_RESPONSE_KIND], "#e": [pollId], limit: ANSWERS_ASKED }, readRelays(pollRelays));
}

/** A zap poll's zap receipts (kind 9735). */
export function fetchZapPollReceipts(pollId: string, hints: string[] = []): Promise<NostrEvent[]> {
  return askEverywhere({ kinds: [ZAP_RECEIPT_KIND], "#e": [pollId], limit: ANSWERS_ASKED }, readRelays(hints));
}

export type PollVoteOutcome = PublishOutcome & { event?: NostrEvent };

/**
 * Answer a NIP-88 poll as the Active Account: one `response` tag per choice
 * (only the first counts on a single-choice poll, so only one is sent), the
 * poll by `e`, its author by `p`. A later response replaces this one.
 */
export async function publishPollVote(poll: Poll, choices: string[]): Promise<PollVoteOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Sign in to vote" };
  const picked = acceptedChoices(poll, choices);
  if (!picked.length) return { success: false, error: "Pick an option first" };
  const hint = poll.relays[0] ?? relayHintFor(poll.pubkey);
  try {
    const signed = await signAs(account, {
      kind: POLL_RESPONSE_KIND,
      tags: [
        tagWithHint("e", poll.id, hint),
        tagWithHint("p", poll.pubkey, relayHintFor(poll.pubkey)),
        ...picked.map((id) => ["response", id]),
      ],
      content: "",
    });
    const res = await publishToRelays(signed, poll.relays.slice(0, MAX_POLL_RELAYS));
    return { ...res, event: signed };
  } catch (e) {
    return signingFailure(e);
  }
}
