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
const forgetMock = vi.fn();
vi.mock("@/hooks/usePersonEndorsements", () => ({
  usePersonEndorsements: (pubkey: string | null, personal: boolean) => personEndorsementsMock(pubkey, personal),
  forgetPersonEndorsements: (pk: string) => forgetMock(pk),
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
let viewerMock: { pubkey: string } | null = null;
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => viewerMock }));
const publishVouchMock = vi.fn(async (_subject: string, _opts: { type: string; content: string }) => ({ success: true, event: undefined as unknown }));
const revokeVouchMock = vi.fn(async (_subject: string, _id: string) => ({ success: true }));
vi.mock("@/services/vouches", () => ({
  publishVouch: (s: string, o: { type: string; content: string }) => publishVouchMock(s, o),
  revokeVouch: (s: string, id: string) => revokeVouchMock(s, id),
}));
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
  viewerMock = null;
  window.location.hash = "";
  publishVouchMock.mockResolvedValue({ success: true, event: undefined });
  revokeVouchMock.mockResolvedValue({ success: true });
});

// The composer: a signed-in viewer writes a trust review from the person's
// page — type (Vouched or Identity) plus optional words — publishing the same
// kind-31871 vouch Relay Outpost does. One review per person: an existing one
// prefills and the action reads Update; Remove publishes the NIP-09 delete.
describe("TrustReviews composer", () => {
  const VIEWER = "9".repeat(64);

  it("invites a signed-in viewer to be the first, and shows their review the moment it publishes", async () => {
    viewerMock = { pubkey: VIEWER };
    signedInMock = true;
    knownProfiles.set(SUBJECT, profile(SUBJECT, "nathan"));
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [] });
    publishVouchMock.mockResolvedValue({
      success: true,
      event: { id: "new-v", kind: 31871, pubkey: VIEWER, tags: [["d", SUBJECT], ["p", SUBJECT], ["t", "identity"], ["s", "vouched"]], content: "I know this is really them.", created_at: NOW, sig: "s" },
    });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    const section = await screen.findByTestId("trust-reviews");
    expect(section).toHaveTextContent("Be the first to review nathan");
    fireEvent.click(screen.getByTestId("trust-reviews-invite"));
    fireEvent.click(screen.getByTestId("vouch-type-identity"));
    fireEvent.change(screen.getByTestId("vouch-text"), { target: { value: "I know this is really them." } });
    fireEvent.click(screen.getByTestId("vouch-publish"));
    await vi.waitFor(() => expect(publishVouchMock).toHaveBeenCalledWith(SUBJECT, { type: "identity", content: "I know this is really them." }));
    // The new review is on the page at once, no refetch.
    const row = await screen.findByTestId("trust-review-new-v");
    expect(row).toHaveTextContent("I know this is really them.");
    expect(row).toHaveTextContent("Confirms identity");
    expect(screen.queryByTestId("vouch-text")).toBeNull();
  });

  it("prefills the viewer's existing review, updates it, and can remove it", async () => {
    window.location.hash = "#trust-reviews";
    viewerMock = { pubkey: VIEWER };
    signedInMock = true;
    personEndorsementsMock.mockReturnValue({
      followedBy: [], total: null,
      vouches: [{ id: "mine", pubkey: VIEWER, type: "vouch", text: "Great operator.", at: NOW - 100 }],
    });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    await screen.findByTestId("trust-review-mine");
    const write = screen.getByTestId("trust-reviews-write");
    expect(write).toHaveTextContent("Edit your review");
    fireEvent.click(write);
    expect((screen.getByTestId("vouch-text") as HTMLTextAreaElement).value).toBe("Great operator.");
    expect(screen.getByTestId("vouch-publish")).toHaveTextContent("Update");
    fireEvent.click(screen.getByTestId("vouch-remove"));
    // Two-step: the first click asks, the second removes.
    fireEvent.click(screen.getByTestId("vouch-remove"));
    await vi.waitFor(() => expect(revokeVouchMock).toHaveBeenCalledWith(SUBJECT, "mine"));
    await vi.waitFor(() => expect(screen.queryByTestId("trust-review-mine")).toBeNull());
  });

  it("offers no composer signed out, and none on your own page", async () => {
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [] });
    const { unmount } = render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    await Promise.resolve();
    expect(screen.queryByTestId("trust-reviews")).toBeNull();
    unmount();
    viewerMock = { pubkey: SUBJECT };
    signedInMock = true;
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    await Promise.resolve();
    expect(screen.queryByTestId("trust-reviews-write")).toBeNull();
  });

  it("reports a failed publish and keeps the draft", async () => {
    viewerMock = { pubkey: VIEWER };
    signedInMock = true;
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [] });
    publishVouchMock.mockResolvedValue({ success: false, error: "No relay accepted the event", event: undefined });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    await screen.findByTestId("trust-reviews");
    fireEvent.click(screen.getByTestId("trust-reviews-invite"));
    fireEvent.change(screen.getByTestId("vouch-text"), { target: { value: "draft" } });
    fireEvent.click(screen.getByTestId("vouch-publish"));
    await screen.findByText(/No relay accepted the event/);
    expect((screen.getByTestId("vouch-text") as HTMLTextAreaElement).value).toBe("draft");
  });
});

describe("TrustReviews", () => {
  // Google's and LinkedIn's move: a one-line summary in the identity area —
  // reviewer faces + "Vouched by friend & 1 other" — collapsed by default;
  // tap it to unfold the list. Nothing is dumped on the page unasked.
  it("collapses to a summary line by default and unfolds on tap", async () => {
    signedInMock = true;
    followsMock = new Set([FRIEND]);
    scoreByPubkey.set(FRIEND, null);
    knownProfiles.set(FRIEND, profile(FRIEND, "friend"));
    knownProfiles.set(BEN, profile(BEN, "benjamin"));
    personEndorsementsMock.mockReturnValue({
      followedBy: [], total: null,
      vouches: [
        { id: "v-friend", pubkey: FRIEND, type: "vouch", text: "Great relay operator.", at: NOW - 3 },
        { id: "v-ben", pubkey: BEN, type: "identity", text: "Real.", at: NOW - 60 },
      ],
    });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    const summary = await screen.findByTestId("trust-reviews-summary");
    // Plain words, no faces (the Followed-by row has them) and no names (the
    // rows do): how many, and from whom in the reader's terms.
    expect(summary).toHaveTextContent("2 reviews · 1 from someone you follow");
    expect(summary.querySelector("[data-face]")).toBeNull();
    // Collapsed: no rows yet.
    expect(screen.queryByTestId("trust-review-v-friend")).toBeNull();
    fireEvent.click(screen.getByTestId("trust-reviews-toggle-open"));
    expect(screen.getByTestId("trust-review-v-friend")).toBeInTheDocument();
    expect(screen.getByTestId("trust-reviews-followed")).toHaveTextContent("From people you follow");
  });

  // Benjamin: the edit button belongs in the area that unfolds, not on the
  // summary line — the line stays a quiet social-proof row like Followed-by.
  // The primary door is the page's pen icon beside Zap, which asks the
  // section to open its composer.
  it("keeps the summary line quiet and puts Edit inside the unfolded block", async () => {
    viewerMock = { pubkey: BEN };
    signedInMock = true;
    scoreByPubkey.set(BEN, 0.9);
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [{ id: "mine", pubkey: BEN, type: "vouch", text: "Solid.", at: NOW }] });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    const summary = await screen.findByTestId("trust-reviews-summary");
    expect(summary.querySelector('[data-testid="trust-reviews-write"]')).toBeNull();
    fireEvent.click(screen.getByTestId("trust-reviews-toggle-open"));
    const write = screen.getByTestId("trust-reviews-write");
    expect(write).toHaveTextContent("Edit your review");
    expect(summary.contains(write)).toBe(false);
  });

  // Benjamin: "when users click the pen it does not need to scroll down to
  // the section, just open it — no scroll, make it clean."
  it("opens its composer when the page asks (the pen beside Zap) — without scrolling the page", async () => {
    viewerMock = { pubkey: BEN };
    signedInMock = true;
    const scrollSpy = vi.fn();
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo;
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [] });
    const { rerender } = render(<TrustReviews pubkey={SUBJECT} personal={false} composeRequest={0} />);
    await screen.findByTestId("trust-reviews");
    expect(screen.queryByTestId("vouch-composer")).toBeNull();
    rerender(<TrustReviews pubkey={SUBJECT} personal={false} composeRequest={1} />);
    expect(screen.getByTestId("vouch-composer")).toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("opens unfolded when the page was reached by its deep link, and scrolls there once the reviews land", async () => {
    window.location.hash = "#trust-reviews";
    const scrollSpy = vi.fn();
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo;
    scoreByPubkey.set(BEN, 0.9);
    // The section renders only after the data arrives — too late for the
    // browser's own hash jump, so the section scrolls itself into view.
    personEndorsementsMock.mockReturnValue(null);
    const { rerender } = render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    expect(scrollSpy).not.toHaveBeenCalled();
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [{ id: "v-ben", pubkey: BEN, type: "vouch", text: "Solid.", at: NOW }] });
    rerender(<TrustReviews pubkey={SUBJECT} personal={false} />);
    expect(await screen.findByTestId("trust-review-v-ben")).toBeInTheDocument();
    await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    // Toggling later never scrolls again.
    fireEvent.click(screen.getByTestId("trust-reviews-toggle-open"));
    fireEvent.click(screen.getByTestId("trust-reviews-toggle-open"));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    window.location.hash = "";
  });

  it("renders a review's links and mentions as chips, not raw URLs", async () => {
    window.location.hash = "#trust-reviews";
    scoreByPubkey.set(BEN, 0.9);
    knownProfiles.set(FRIEND, profile(FRIEND, "friend"));
    const npub = (await import("nostr-tools")).nip19.npubEncode(FRIEND);
    personEndorsementsMock.mockReturnValue({
      followedBy: [], total: null,
      vouches: [{ id: "v-ben", pubkey: BEN, type: "vouch", text: `Built https://relayop.xyz with nostr:${npub} — solid.`, at: NOW }],
    });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    const row = await screen.findByTestId("trust-review-v-ben");
    expect(row.querySelector('a[href="https://relayop.xyz"]')).not.toBeNull();
    await vi.waitFor(() => expect(row.querySelector('[data-testid="mention-chip"]')).toHaveTextContent("friend"));
    expect(row.textContent).not.toContain("nostr:");
    window.location.hash = "";
  });

  it("lists vouches in trust order with type, words, and the subject's reply", async () => {
    window.location.hash = "#trust-reviews";
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
    expect(section).toHaveTextContent("Reviews");
    expect(section).toHaveTextContent("3");
    // Order: the friend first, then verified benjamin; the stranger folded.
    const rows = () =>
      [...section.querySelectorAll('[data-testid^="trust-review-"]')]
        .map((e) => e.getAttribute("data-testid")!)
        .filter((id) => !id.startsWith("trust-review-reply-") && !id.startsWith("trust-reviews-"));
    expect(rows()).toEqual(["trust-review-v-friend", "trust-review-v-ben"]);
    expect(screen.getByTestId("trust-review-v-friend")).toHaveTextContent("Recommends");
    expect(screen.getByTestId("trust-review-v-ben")).toHaveTextContent("Confirms identity");
    expect(screen.getByTestId("trust-review-v-ben")).toHaveTextContent("real Nathan Day account");
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
    window.location.hash = "#trust-reviews";
    scoreByPubkey.set(STRANGER, null);
    personEndorsementsMock.mockReturnValue({ followedBy: [], total: null, vouches: [{ id: "v", pubkey: STRANGER, type: "vouch", text: "ok", at: NOW }] });
    render(<TrustReviews pubkey={SUBJECT} personal={false} />);
    await screen.findByTestId("trust-review-v");
    expect(screen.queryByTestId("trust-reviews-toggle")).toBeNull();
  });
});
