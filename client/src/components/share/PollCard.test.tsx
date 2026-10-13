// @vitest-environment jsdom
/**
 * A poll under its question: options with their share of voters, who voted,
 * when it closes; a signed-in reader votes (a kind-1018 response through the
 * signing path) and sees their own choice; a reader signed out, or a closed
 * poll, gets no voting. A zap poll shows sats per option and links out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (key: string | null) => {
    askedKeys.push(key);
    return { events: held, loading: false, settled: true };
  },
}));

const publishPollVote = vi.fn(async () => ({ success: true }));
vi.mock("@/services/polls", () => ({
  fetchPollResponses: vi.fn(async () => []),
  fetchZapPollReceipts: vi.fn(async () => []),
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
  publishPollVote.mockClear();
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
  const receipt = (sats: number, option: number): MinimalEvent => ({
    id: String(++n).padStart(64, "0"),
    pubkey: "f".repeat(64),
    kind: 9735,
    created_at: NOW - 60,
    content: "",
    tags: [
      ["e", POLL_ID],
      ["bolt11", `lnbc${sats * 10}n1pexample`],
      [
        "description",
        JSON.stringify({
          kind: 9734,
          pubkey: ALICE,
          tags: [
            ["e", POLL_ID],
            ["poll_option", String(option)],
          ],
        }),
      ],
    ],
  });

  it("shows sats per option, consensus, closing time and a way to zap", () => {
    held = [receipt(700, 0), receipt(300, 1)];
    renderWithProviders(<PollCard event={zapPoll} />);
    expect(screen.getByTestId("zap-poll-option-0")).toHaveTextContent("Yes");
    expect(screen.getByTestId("zap-poll-option-0")).toHaveTextContent("Consensus");
    expect(screen.getByTestId("zap-poll-option-0")).toHaveTextContent("700 sats · 70%");
    expect(screen.getByTestId("zap-poll-option-1")).toHaveTextContent("300 sats · 30%");
    expect(screen.getByTestId("zap-poll-total")).toHaveTextContent("1,000 sats from 2 zaps");
    expect(screen.getByTestId("zap-poll-closes")).toHaveTextContent("Ends in 1 day");
    expect(screen.getByTestId("zap-poll-open").getAttribute("href")).toMatch(/^nostr:nevent1/);
  });

  it("compact: the options", () => {
    renderWithProviders(<PollCard event={zapPoll} compact />);
    expect(screen.getByTestId("poll-compact")).toHaveTextContent("Zap poll · Ends in 1 day");
  });
});
