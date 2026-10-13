// @vitest-environment jsdom
/**
 * A poll under its question: options with their share of voters, who voted,
 * when it closes; a signed-in reader votes (a kind-1018 response through the
 * signing path) and sees their own choice; a reader signed out, or a closed
 * poll, gets no voting. A zap poll shows sats per option and links out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

const ME = "e".repeat(64);
const AUTHOR = "a".repeat(64);
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);
const POLL_ID = "9".repeat(64);
const NOW = Math.floor(Date.now() / 1000);

let viewer: { pubkey: string } | null = { pubkey: ME };
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => viewer }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map(), useLiveProfile: () => ({}) }));

/** What the store holds for the card's filters. */
let held: MinimalEvent[] = [];
const askedKeys: (string | null)[] = [];
/** The asks the card would send, to run by hand. */
const asks: (() => Promise<unknown>)[] = [];
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (key: string | null, _filters: unknown, ask: () => Promise<unknown>) => {
    askedKeys.push(key);
    asks.push(ask);
    return { events: held, loading: false, settled: true };
  },
}));

const publishPollVote = vi.fn(async () => ({ success: true }));
const fetchPollResponses = vi.fn(async (..._args: unknown[]) => []);
const fetchZapPollReceipts = vi.fn(async (..._args: unknown[]) => []);
vi.mock("@/services/polls", () => ({
  // Small, so a test can reach it.
  POLL_ANSWERS_CAP: 5,
  fetchPollResponses: (...args: unknown[]) => fetchPollResponses(...args),
  fetchZapPollReceipts: (...args: unknown[]) => fetchZapPollReceipts(...args),
  publishPollVote: (...args: unknown[]) => publishPollVote(...(args as [])),
}));

import { PollCard } from "./PollCard";

const poll = (tags: string[][]): MinimalEvent => ({
  id: POLL_ID,
  pubkey: AUTHOR,
  kind: 1068,
  created_at: NOW - 3600,
  content: "Best relay?",
  tags: [["option", "x1", "damus"], ["option", "x2", "nos.lol"], ...tags],
});

let n = 0;
const vote = (pubkey: string, choice: string, at = NOW - 60): MinimalEvent => ({
  id: String(++n).padStart(64, "0"),
  pubkey,
  kind: 1018,
  created_at: at,
  content: "",
  tags: [
    ["e", POLL_ID],
    ["response", choice],
  ],
});

beforeEach(() => {
  viewer = { pubkey: ME };
  held = [];
  askedKeys.length = 0;
  asks.length = 0;
  publishPollVote.mockClear();
  fetchPollResponses.mockClear();
  fetchZapPollReceipts.mockClear();
});

describe("PollCard — NIP-88", () => {
  it("shows each option's share, the voters and when it closes", () => {
    held = [vote(ALICE, "x1"), vote(BOB, "x1"), vote(BOB, "x2", NOW - 30)];
    renderWithProviders(<PollCard event={poll([["endsAt", String(NOW + 3 * 86_400 + 60)]])} />);
    // Bob's latest vote is x2: one each.
    expect(screen.getByTestId("poll-option-x1")).toHaveTextContent("damus50%");
    expect(screen.getByTestId("poll-option-x2")).toHaveTextContent("nos.lol50%");
    expect(screen.getByTestId("poll-total")).toHaveTextContent("2 voters");
    expect(screen.getByTestId("poll-closes")).toHaveTextContent("Ends in 3 days");
  });

  it("marks the reader's own choice and lets them change it, through the publish path", async () => {
    held = [vote(ME, "x1")];
    renderWithProviders(<PollCard event={poll([])} />);
    expect(screen.getByTestId("poll-option-x1")).toHaveTextContent("You");
    const button = screen.getByTestId("poll-vote");
    expect(button).toHaveTextContent("Change vote");
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /nos\.lol/ }));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(publishPollVote).toHaveBeenCalledTimes(1));
    expect(publishPollVote).toHaveBeenCalledWith(expect.objectContaining({ id: POLL_ID }), ["x2"]);
  });

  it("a multiple-choice poll offers checkboxes", () => {
    renderWithProviders(<PollCard event={poll([["polltype", "multiplechoice"]])} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByTestId("poll-vote")).toHaveTextContent("Vote");
  });

  it("signed out: no voting, a way to sign in", () => {
    viewer = null;
    renderWithProviders(<PollCard event={poll([])} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByTestId("poll-vote")).toBeNull();
    expect(screen.getByTestId("poll-sign-in")).toBeInTheDocument();
  });

  it("closed: no voting, and late votes do not count", () => {
    const endsAt = NOW - 120;
    held = [vote(ALICE, "x1", endsAt - 10), vote(BOB, "x2", endsAt + 10)];
    renderWithProviders(<PollCard event={poll([["endsAt", String(endsAt)]])} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByTestId("poll-vote")).toBeNull();
    expect(screen.queryByTestId("poll-sign-in")).toBeNull();
    expect(screen.getByTestId("poll-closes")).toHaveTextContent(/^Ended /);
    expect(screen.getByTestId("poll-total")).toHaveTextContent("1 voter");
    expect(screen.getByTestId("poll-option-x1")).toHaveTextContent("100%");
  });

  it("compact: the options and the closing time, asking no relay", () => {
    renderWithProviders(<PollCard event={poll([["endsAt", String(NOW + 7200 + 600)]])} compact />);
    const card = screen.getByTestId("poll-compact");
    expect(card).toHaveTextContent("damus");
    expect(card).toHaveTextContent("nos.lol");
    expect(card).toHaveTextContent("Poll · Pick one · Ends in 2 hours");
    expect(askedKeys).toEqual([]);
  });
});

describe("PollCard — zap poll (kind 6969)", () => {
  const zapPoll: MinimalEvent = {
    id: POLL_ID,
    pubkey: AUTHOR,
    kind: 6969,
    created_at: NOW - 3600,
    content: "Ship it?",
    tags: [
      ["poll_option", "0", "Yes"],
      ["poll_option", "1", "No"],
      ["consensus_threshold", "60"],
      ["closed_at", String(NOW + 86_400 + 60)],
    ],
  };
  const receipt = (sats: number, option: number, signed = true): MinimalEvent => {
    const template = {
      kind: 9734,
      created_at: NOW - 70,
      content: "",
      tags: [
        ["e", POLL_ID],
        ["p", AUTHOR],
        ["poll_option", String(option)],
      ],
    };
    return {
      id: String(++n).padStart(64, "0"),
      pubkey: "f".repeat(64),
      kind: 9735,
      created_at: NOW - 60,
      content: "",
      tags: [
        ["e", POLL_ID],
        ["p", AUTHOR],
        ["bolt11", `lnbc${sats * 10}n1pexample`],
        [
          "description",
          JSON.stringify(signed ? finalizeEvent(template, generateSecretKey()) : { ...template, pubkey: ALICE }),
        ],
      ],
    };
  };

  it("shows sats per option, closing time and a way to zap — and no consensus on an unverified tally", () => {
    held = [receipt(700, 0), receipt(300, 1)];
    renderWithProviders(<PollCard event={zapPoll} />);
    expect(screen.getByTestId("zap-poll-option-0")).toHaveTextContent("Yes");
    // 70% passes the 60% threshold, but the receipts are the wallets' word: no option is declared the consensus.
    expect(screen.getByTestId("zap-poll-option-0")).not.toHaveTextContent("Consensus");
    expect(screen.getByTestId("zap-poll-option-0")).toHaveTextContent("700 sats · 70%");
    expect(screen.getByTestId("zap-poll-option-1")).toHaveTextContent("300 sats · 30%");
    // Neither request names its amount: the total is only the receipts' word.
    expect(screen.getByTestId("zap-poll-total")).toHaveTextContent("≈1,000 sats from 2 zaps");
    expect(screen.getByTestId("zap-poll-closes")).toHaveTextContent("Ends in 1 day");
    expect(screen.getByTestId("zap-poll-open").getAttribute("href")).toMatch(/^nostr:nevent1/);
  });

  it("compact: the options", () => {
    renderWithProviders(<PollCard event={zapPoll} compact />);
    expect(screen.getByTestId("poll-compact")).toHaveTextContent("Zap poll · Ends in 1 day");
  });

  it("counts no receipt whose zap request nobody signed, and says the tally is the wallets' word", () => {
    held = [receipt(700, 0), receipt(100_000, 1, false)];
    renderWithProviders(<PollCard event={zapPoll} />);
    expect(screen.getByTestId("zap-poll-option-1")).toHaveTextContent("0 sats");
    expect(screen.getByTestId("zap-poll-total")).toHaveTextContent("≈700 sats from 1 zap");
    expect(screen.getByTestId("zap-poll-unverified")).toHaveTextContent("Unverified tally (zap receipts)");
  });

  it("asks for no receipt after it closed, from where it was found too", async () => {
    renderWithProviders(<PollCard event={zapPoll} relayHints={["wss://found.example.com"]} />);
    await asks.at(-1)!();
    expect(fetchZapPollReceipts).toHaveBeenCalledWith(POLL_ID, ["wss://found.example.com"], NOW + 86_400 + 60);
  });
});

describe("PollCard — the edges", () => {
  it("says a count past what it read is at least that", () => {
    held = [ALICE, BOB, ME, "3".repeat(64), "4".repeat(64)].map((pk) => vote(pk, "x1"));
    renderWithProviders(<PollCard event={poll([])} />);
    expect(screen.getByTestId("poll-total")).toHaveTextContent("5+ voters");
  });

  it("asks the poll's relays and where it was found, nothing after it ends", async () => {
    const endsAt = NOW + 3600;
    renderWithProviders(
      <PollCard
        event={poll([
          ["relay", "wss://poll.example.com"],
          ["endsAt", String(endsAt)],
        ])}
        relayHints={["wss://found.example.com"]}
      />,
    );
    await asks.at(-1)!();
    expect(fetchPollResponses).toHaveBeenCalledWith(
      POLL_ID,
      ["wss://poll.example.com", "wss://found.example.com"],
      endsAt,
    );
  });

  it("a pick on one poll does not carry to the next drawn in its place", () => {
    const first = poll([]);
    const { rerender } = renderWithProviders(<PollCard event={first} />);
    fireEvent.click(screen.getByRole("radio", { name: /damus/ }));
    expect(screen.getByRole("radio", { name: /damus/ })).toHaveAttribute("aria-checked", "true");
    rerender(<PollCard event={{ ...first, id: "8".repeat(64) }} />);
    expect(screen.getByRole("radio", { name: /damus/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("poll-vote")).toBeDisabled();
  });

  it("closes on screen when its time comes", () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const endsAt = Math.floor(Date.now() / 1000) + 2;
      renderWithProviders(<PollCard event={poll([["endsAt", String(endsAt)]])} />);
      expect(screen.getAllByRole("radio")).toHaveLength(2);
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByRole("radio")).toBeNull();
      expect(screen.getByTestId("poll-closes")).toHaveTextContent(/^Ended /);
    } finally {
      vi.useRealTimers();
    }
  });
});
