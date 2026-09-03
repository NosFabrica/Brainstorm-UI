// @vitest-environment jsdom
/**
 * The person page's Trust reviews section — the full list of Relay Outpost
 * vouches about someone, in the one order (you follow → verified → the rest
 * folded), each with its type, its words, and the person's own public reply
 * when they answered. Silent when nobody has vouched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

type PersonEndorsements = import("@/services/endorsements").PersonEndorsements;
const personEndorsementsMock = vi.fn<(pubkey: string | null, personal: boolean) => PersonEndorsements | null>(() => null);
vi.mock("@/hooks/usePersonEndorsements", () => ({
  usePersonEndorsements: (pubkey: string | null, personal: boolean) => personEndorsementsMock(pubkey, personal),
}));
let followsMock = new Set<string>();
let signedInMock = false;
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: followsMock, ready: true, signedIn: signedInMock }),
}));
const scoreByPubkey = new Map<string, number | null>();
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => (scoreByPubkey.has(pk) ? scoreByPubkey.get(pk) : 0.7),
}));
const repliesMock = vi.fn<(ids: string[]) => Promise<Map<string, { id: string; pubkey: string; text: string; at: number }>>>(() => Promise.resolve(new Map()));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchVouchReplies: (...a: unknown[]) => repliesMock(...(a as [string[]])),
}));
vi.mock("@/services/nostr", () => ({ fetchProfileMap: vi.fn(() => Promise.resolve(new Map())) }));
const knownProfiles = new Map<string, NostrEvent>();
vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: (_k: number, pubkey: string) => knownProfiles.get(pubkey), getEvent: () => undefined, add: (e: NostrEvent) => e },
}));

import { TrustReviews } from "./TrustReviews";

const SUBJECT = "0".repeat(64);
const BEN = "1".repeat(64);
const FRIEND = "2".repeat(64);
const STRANGER = "3".repeat(64);
const profile = (pubkey: string, name: string): NostrEvent =>
  ({ id: pubkey.slice(0, 8), kind: 0, pubkey, tags: [], content: JSON.stringify({ name }), created_at: 1, sig: "s" }) as NostrEvent;
const NOW = Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.clearAllMocks();
  personEndorsementsMock.mockReturnValue(null);
  repliesMock.mockResolvedValue(new Map());
  followsMock = new Set();
  signedInMock = false;
  scoreByPubkey.clear();
  knownProfiles.clear();
});

describe("TrustReviews", () => {
  it("lists vouches in trust order with type, words, and the subject's reply", async () => {
    signedInMock = true;
    followsMock = new Set([FRIEND]);
    scoreByPubkey.set(FRIEND, null);
    scoreByPubkey.set(STRANGER, null);
    knownProfiles.set(BEN, profile(BEN, "benjamin"));
    knownProfiles.set(FRIEND, profile(FRIEND, "friend"));
    knownProfiles.set(SUBJECT, profile(SUBJECT, "nathan"));
    personEndorsementsMock.mockReturnValue({
      followedBy: [], total: null,
      vouches: [
        { id: "v-stranger", pubkey: STRANGER, type: "vouch", text: "trust me bro", at: NOW - 100 },
        { id: "v-ben", pubkey: BEN, type: "identity", text: "Leaving this here so others know this is the real Nathan Day account.", at: NOW - 86400 * 60 },
        { id: "v-friend", pubkey: FRIEND, type: "vouch", text: "Great relay operator.", at: NOW - 86400 * 3 },
      ],
    });
    repliesMock.mockResolvedValue(new Map([["v-ben", { id: "r1", pubkey: SUBJECT, text: "Confirmed, that's me.", at: NOW - 86400 * 50 }]]));

    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    const section = await screen.findByTestId("trust-reviews");
    expect(section).toHaveTextContent("Trust reviews");
    expect(section).toHaveTextContent("3");
    // Order: the friend first, then verified benjamin; the stranger folded.
    const rows = () =>
      [...section.querySelectorAll('[data-testid^="trust-review-"]')]
        .map((e) => e.getAttribute("data-testid")!)
        .filter((id) => !id.startsWith("trust-review-reply-") && !id.startsWith("trust-reviews-"));
    expect(rows()).toEqual(["trust-review-v-friend", "trust-review-v-ben"]);
    expect(screen.getByTestId("trust-review-v-friend")).toHaveTextContent("Vouched");
    expect(screen.getByTestId("trust-review-v-ben")).toHaveTextContent("Identity");
    expect(screen.getByTestId("trust-review-v-ben")).toHaveTextContent("real Nathan Day account");
    // Identity from a trusted reviewer earns the chip.
    expect(screen.getByTestId("trust-reviews-identity")).toHaveTextContent("Identity confirmed");
    // The subject's public answer sits under the vouch it answers.
    await vi.waitFor(() => expect(screen.getByTestId("trust-review-reply-v-ben")).toHaveTextContent("Confirmed, that's me."));
    expect(repliesMock).toHaveBeenCalledWith(["v-stranger", "v-ben", "v-friend"]);
    // Rings on the reviewers.
    expect(screen.getByTestId("trust-review-v-ben").querySelector('[class*="shadow-[0_0_0"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId("trust-reviews-toggle"));
    expect(rows()).toContain("trust-review-v-stranger");
  });

  it("is silent when nobody has vouched", async () => {
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [] });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    await Promise.resolve();
    expect(screen.queryByTestId("trust-reviews")).toBeNull();
  });

  it("with only outsiders, shows them unfolded — nothing to hide behind", async () => {
    scoreByPubkey.set(STRANGER, null);
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [{ id: "v", pubkey: STRANGER, type: "vouch", text: "ok", at: NOW }] });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    await screen.findByTestId("trust-review-v");
    expect(screen.queryByTestId("trust-reviews-toggle")).toBeNull();
    expect(screen.queryByTestId("trust-reviews-identity")).toBeNull();
  });
});
