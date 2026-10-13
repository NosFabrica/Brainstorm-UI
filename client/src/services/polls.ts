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
import {
  MAX_POLL_RELAYS,
  POLL_RESPONSE_KIND,
  ZAP_RECEIPT_KIND,
  acceptedChoices,
  pollClosed,
  type Poll,
} from "@/lib/polls";

/** Answers asked for in one page. */
const ANSWERS_ASKED = 1000;
/** Pages asked for at most, each from just before the oldest answer of the last. */
const MAX_PAGES = 5;
/** Answers read at most from one source: a poll with more is counted from these, and says so ("5000+"). */
export const POLL_ANSWERS_CAP = ANSWERS_ASKED * MAX_PAGES;

function readRelays(hints: string[]): string[] {
  return Array.from(new Set([...hints.slice(0, MAX_POLL_RELAYS), ...PROFILE_RELAYS]));
}

/**
 * The most events many relays send for one REQ, whatever limit was asked
 * (strfry's default, among others): a page this long may be a full one.
 */
const RELAY_PAGE_CAP = 500;
/** A page at least this long may have more behind it. */
const FULL_PAGE = Math.min(ANSWERS_ASKED, RELAY_PAGE_CAP);

/**
 * Everything matching `filter` from `relays` and the search relay, into the
 * store: from `until` (a poll's close — nothing later counts) back, a page at a
 * time. Each source pages on its own, from just before ITS oldest answer, while
 * it returns a page that may be full — one source coming back short must not
 * stop another that has thousands more, nor its oldest skip theirs. `MAX_PAGES`
 * a source at most. Never rejects.
 */
async function askEverywhere(
  filter: Record<string, unknown>,
  relays: string[],
  until: number | null = null,
): Promise<NostrEvent[]> {
  const byId = new Map<string, NostrEvent>();
  const sources: { ask: (f: Record<string, unknown>) => Promise<NostrEvent[]>; cursor: number | null }[] = [
    { ask: (f) => fetchEventsByFilter(f, relays), cursor: until },
    { ask: (f) => fetchFromSearchRelayByFilters([f], 6000), cursor: until },
  ];
  let paging = sources;
  for (let i = 0; i < MAX_PAGES && paging.length; i++) {
    const pages = await Promise.all(
      paging.map((s) =>
        s.ask(s.cursor === null ? filter : { ...filter, until: s.cursor }).catch(() => [] as NostrEvent[]),
      ),
    );
    paging = paging.filter((source, j) => {
      const page = pages[j];
      for (const ev of page) byId.set(ev.id, ev);
      if (page.length < FULL_PAGE) return false;
      const oldest = page.reduce((min, ev) => Math.min(min, ev.created_at), Infinity);
      if (!Number.isFinite(oldest)) return false;
      source.cursor = oldest - 1;
      return true;
    });
  }
  return [...byId.values()];
}

/**
 * A NIP-88 poll's responses (kind 1018), from the relays it names, the usual
 * ones and the search relay — none stamped after `endsAt`.
 */
export function fetchPollResponses(
  pollId: string,
  pollRelays: string[] = [],
  endsAt: number | null = null,
): Promise<NostrEvent[]> {
  return askEverywhere(
    { kinds: [POLL_RESPONSE_KIND], "#e": [pollId], limit: ANSWERS_ASKED },
    readRelays(pollRelays),
    endsAt,
  );
}

/** A zap poll's zap receipts (kind 9735), none after `closedAt`. */
export function fetchZapPollReceipts(
  pollId: string,
  hints: string[] = [],
  closedAt: number | null = null,
): Promise<NostrEvent[]> {
  return askEverywhere(
    { kinds: [ZAP_RECEIPT_KIND], "#e": [pollId], limit: ANSWERS_ASKED },
    readRelays(hints),
    closedAt,
  );
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
  // The card may have been open since before it closed: a late vote does not count (NIP-88), so none is signed.
  if (pollClosed(poll, Math.floor(Date.now() / 1000))) return { success: false, error: "This poll has closed" };
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
    // Answered at the first relay that takes it; the slower ones carry on behind.
    const res = await publishToRelays(signed, poll.relays.slice(0, MAX_POLL_RELAYS), { need: 1, timeoutMs: 8000 });
    return { ...res, event: signed };
  } catch (e) {
    return signingFailure(e);
  }
}
