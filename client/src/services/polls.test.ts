/**
 * Asking for a poll's answers and answering one. A popular poll has more
 * answers than one page: the ask pages back from the poll's close, bounded.
 * A vote is refused once the poll has closed, and is sent the way a chat
 * message is — answered at the first relay that takes it, not after the slowest.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const POLL = "9".repeat(64);
const AUTHOR = "a".repeat(64);

type Filter = { until?: number; limit?: number };
const relayAsks: Filter[] = [];
const searchAsks: Filter[] = [];
/** How many full pages the relays have before they run dry. */
let fullPages = 0;
const page = (filter: Filter, full: boolean): NostrEvent[] => {
  const top = filter.until ?? 2_000_000_000;
  const n = full ? filter.limit! : 3;
  return Array.from({ length: n }, (_, i) => ({
    id: `${top}-${i}`,
    pubkey: AUTHOR,
    kind: 1018,
    created_at: top - i,
    content: "",
    tags: [["e", POLL]],
    sig: "s",
  }));
};
const publishToRelays = vi.fn(async (..._args: unknown[]) => ({ success: true }));
vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: async (filter: Filter) => {
    relayAsks.push(filter);
    return page(filter, relayAsks.length <= fullPages);
  },
  fetchFromSearchRelayByFilters: async ([filter]: Filter[]) => {
    searchAsks.push(filter);
    return [];
  },
  publishToRelays: (...args: unknown[]) => publishToRelays(...args),
}));
const signAs = vi.fn(async (_account: unknown, template: object) => ({ ...template, id: "x", sig: "y" }));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: "e".repeat(64) }),
  signAs: (account: unknown, template: object) => signAs(account, template),
  signingFailure: (e: unknown) => ({ success: false, error: String(e) }),
}));
vi.mock("@/lib/relayRouting", () => ({
  relayHintFor: () => undefined,
  tagWithHint: (name: string, value: string) => [name, value],
}));

import { POLL_ANSWERS_CAP, fetchPollResponses, publishPollVote } from "./polls";
import type { Poll } from "@/lib/polls";

const poll = (endsAt: number | null): Poll => ({
  id: POLL,
  pubkey: AUTHOR,
  createdAt: 1_000,
  question: "?",
  options: [{ id: "x1", label: "yes" }],
  multiple: false,
  endsAt,
  relays: ["wss://poll.example.com"],
});

beforeEach(() => {
  relayAsks.length = 0;
  searchAsks.length = 0;
  fullPages = 0;
  publishToRelays.mockClear();
  signAs.mockClear();
});

describe("fetchPollResponses", () => {
  it("asks for nothing stamped after the poll closed", async () => {
    await fetchPollResponses(POLL, [], 1_900_000_000);
    expect(relayAsks[0].until).toBe(1_900_000_000);
    expect(searchAsks[0].until).toBe(1_900_000_000);
  });

  it("pages back while pages come back full, from just before the oldest", async () => {
    fullPages = 2;
    const events = await fetchPollResponses(POLL, [], 1_900_000_000);
    expect(relayAsks).toHaveLength(3);
    const limit = relayAsks[0].limit!;
    expect(relayAsks[1].until).toBe(1_900_000_000 - (limit - 1) - 1);
    expect(events.length).toBe(2 * limit + 3);
  });

  it("stops at its cap however many there are", async () => {
    fullPages = 100;
    const events = await fetchPollResponses(POLL, []);
    expect(relayAsks.length).toBeLessThanOrEqual(5);
    expect(events.length).toBe(POLL_ANSWERS_CAP);
  });
});

describe("publishPollVote", () => {
  it("refuses once the poll has closed, before asking the signer", async () => {
    const res = await publishPollVote(poll(Math.floor(Date.now() / 1000) - 5), ["x1"]);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/closed/i);
    expect(signAs).not.toHaveBeenCalled();
  });

  it("answers at the first relay that takes the vote, not after the slowest", async () => {
    const res = await publishPollVote(poll(null), ["x1"]);
    expect(res.success).toBe(true);
    expect(publishToRelays).toHaveBeenCalledWith(expect.anything(), ["wss://poll.example.com"], {
      need: 1,
      timeoutMs: 8000,
    });
  });
});
