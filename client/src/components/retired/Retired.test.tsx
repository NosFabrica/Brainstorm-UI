import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { nip19 } from "nostr-tools";

/**
 * Retired accounts, as a reader meets them. A Retired account is one its owner
 * stopped using (CONTEXT.md): nothing is wrong with it, so every surface says
 * so calmly and points to the owner's Current account.
 */
const ME = "e".repeat(64);
const OLD = "a".repeat(64);
const CURRENT = "b".repeat(64);
const SOMEONE = "c".repeat(64);

const viewer = vi.hoisted(() => ({
  signedIn: true,
  follows: new Set<string>(),
  profiles: new Map<string, { name?: string; display_name?: string; picture?: string }>(),
  notes: new Map<
    string,
    { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] }[]
  >(),
}));
const social = vi.hoisted(() => ({
  followUser: vi.fn(async (_pk: string) => ({ success: true })),
  unfollowUser: vi.fn(async (_pk: string) => ({ success: true })),
  reportUser: vi.fn(async (_pk: string, _reason: string) => ({ success: true })),
}));

// The record these tests read: OLD is retired, its owner is at CURRENT now.
vi.mock("@/config/retired", () => ({
  KNOWN_RETIRED: [{ pubkey: "a".repeat(64), currentPubkey: "b".repeat(64) }],
}));
vi.mock("@/hooks/useRelationshipBadges", () => ({
  useRelationshipBadges: (pk: string | undefined) => ({
    enabled: viewer.signedIn && !!pk && pk !== ME,
    isFollowing: viewer.signedIn && !!pk && viewer.follows.has(pk),
    isMuted: false,
    followsYou: false,
    report: null,
    loading: false,
  }),
}));
vi.mock("@/hooks/useSocialActions", () => ({
  useSocialActions: () => ({
    isFollowing: (pk: string) => viewer.follows.has(pk),
    followed: viewer.follows,
    listsLoading: false,
  }),
}));
vi.mock("@/services/socialActions", () => social);
vi.mock("@/accounts/signing", () => ({ activeAccount: () => (viewer.signedIn ? { pubkey: ME } : undefined) }));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfile: (pk: string | undefined) => ({ profile: pk ? viewer.profiles.get(pk) : undefined, loading: false }),
  useLiveProfiles: (pks: string[]) =>
    new Map(pks.flatMap((pk) => (viewer.profiles.has(pk) ? [[pk, viewer.profiles.get(pk)!]] : []))),
}));
vi.mock("@/hooks/useStoreEvents", () => ({ useStoreEvents: () => ({ events: [], loading: false }) }));
vi.mock("@/hooks/useRecentByKinds", () => ({
  useRecentByKinds: (pk: string | undefined) => ({ events: (pk && viewer.notes.get(pk)) || [], loading: false }),
}));
vi.mock("@/components/share/EmbeddedNoteCard", () => ({
  EmbeddedNoteCard: ({ event }: { event: { content: string } }) => <div data-testid="latest-note">{event.content}</div>,
}));

import { CompromisedMark } from "@/components/compromised/CompromisedMark";
import { FollowButton } from "@/components/share/FollowButton";
import { CurrentAccountNote } from "./CurrentAccountNote";
import { RetiredAuthorNotice } from "./RetiredAuthorNotice";
import { RetiredBanner } from "./RetiredBanner";
import { RetiredChatNote } from "./RetiredChatNote";
import { RetiredMark } from "./RetiredMark";

beforeEach(() => {
  viewer.signedIn = true;
  viewer.follows = new Set();
  viewer.profiles = new Map([
    [OLD, { display_name: "Pip (old)" }],
    [CURRENT, { display_name: "Pip" }],
  ]);
  viewer.notes = new Map();
  Object.values(social).forEach((f) => f.mockClear());
});

afterEach(cleanup);

describe("RetiredBanner — on the retired account's own page", () => {
  it("says the account is retired as a note, not an alarm", () => {
    render(<RetiredBanner pubkey={OLD} />);
    const banner = screen.getByRole("note");
    expect(banner).toHaveTextContent("This account is retired");
    expect(banner).toHaveTextContent("Its owner no longer uses it");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the owner's current account by name, with a way to follow it, and none of its posts", () => {
    viewer.notes.set(CURRENT, [
      { id: "1".repeat(64), kind: 1, pubkey: CURRENT, created_at: 1794856000, content: "gm from here", tags: [] },
    ]);
    render(<RetiredBanner pubkey={OLD} />);
    const card = screen.getByTestId("retired-current");
    expect(card).toHaveTextContent("Their current account");
    expect(within(card).getByRole("link", { name: /current account: Pip/i })).toHaveAttribute(
      "href",
      `/p/${nip19.npubEncode(CURRENT)}`,
    );
    // One slim row: no post of theirs, so the profile under it stays on the screen.
    expect(screen.queryByTestId("latest-note")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Follow" }));
    expect(social.followUser).toHaveBeenCalledWith(CURRENT);
  });

  it("offers someone who follows the retired account a quiet unfollow, and nobody a report", async () => {
    viewer.follows.add(OLD);
    render(<RetiredBanner pubkey={OLD} />);
    expect(screen.queryByRole("button", { name: /report/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /unfollow this account/i }));
    await waitFor(() => expect(social.unfollowUser).toHaveBeenCalledWith(OLD));
    expect(await screen.findByTestId("retired-unfollowed")).toHaveTextContent("Unfollowed");
    expect(social.reportUser).not.toHaveBeenCalled();
  });

  it("offers no unfollow to someone who doesn't follow it, or who is signed out", () => {
    const { unmount } = render(<RetiredBanner pubkey={OLD} />);
    expect(screen.queryByRole("button", { name: /unfollow this account/i })).toBeNull();
    unmount();
    viewer.signedIn = false;
    viewer.follows.add(OLD);
    render(<RetiredBanner pubkey={OLD} />);
    expect(screen.queryByRole("button", { name: /unfollow this account/i })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("This account is retired");
  });

  it("draws nothing for an account that isn't retired", () => {
    const { container } = render(
      <>
        <RetiredBanner pubkey={CURRENT} />
        <RetiredBanner pubkey={SOMEONE} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RetiredMark — beside the person's name, wherever they are shown", () => {
  it("says Retired, and why, for a retired account", () => {
    render(<RetiredMark pubkey={OLD} />);
    const mark = screen.getByTestId("retired-mark");
    expect(mark).toHaveTextContent("Retired");
    expect(mark).toHaveAttribute("title", "Retired: its owner no longer uses this account");
  });

  it("draws nothing for the current account or anyone else", () => {
    const { container } = render(
      <>
        <RetiredMark pubkey={CURRENT} />
        <RetiredMark pubkey={SOMEONE} />
        <RetiredMark pubkey={null} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Search rows, dropdowns, people lists, bylines and chats all carry this one mark.
  it("shows in the mark every name row already carries", () => {
    render(<CompromisedMark pubkey={OLD} />);
    expect(screen.getByTestId("retired-mark")).toHaveTextContent("Retired");
    expect(screen.queryByTestId("compromised-mark")).toBeNull();
  });
});

describe("RetiredAuthorNotice — under the byline of a retired account's post", () => {
  it("says where the post is from, as a note, and where its owner is now", () => {
    render(<RetiredAuthorNotice pubkey={OLD} />);
    const notice = screen.getByRole("note");
    expect(notice).toHaveTextContent("Posted from a retired account.");
    expect(notice).toHaveTextContent("Its owner posts from another account now.");
    expect(within(notice).getByRole("link", { name: /their current account/i })).toHaveAttribute(
      "href",
      `/p/${nip19.npubEncode(CURRENT)}`,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("draws nothing under anyone else's post", () => {
    const { container } = render(
      <>
        <RetiredAuthorNotice pubkey={CURRENT} />
        <RetiredAuthorNotice pubkey={SOMEONE} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RetiredChatNote — in a conversation with a retired account", () => {
  it("says the messages may go unseen, and offers the owner's current account to message instead", () => {
    render(<RetiredChatNote pubkeys={[OLD]} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("This account is retired");
    expect(note).toHaveTextContent("Its owner may not see messages sent here.");
    expect(within(note).getByRole("link", { name: /message their current account/i })).toHaveAttribute(
      "href",
      `/messages/${nip19.npubEncode(CURRENT)}`,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names who is retired in a group, where a single link would point at the wrong chat", () => {
    render(<RetiredChatNote pubkeys={[SOMEONE, OLD]} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Pip (old) is on a retired account");
    expect(within(note).queryByRole("link")).toBeNull();
  });

  it("draws nothing in a chat with nobody retired", () => {
    const { container } = render(<RetiredChatNote pubkeys={[CURRENT, SOMEONE]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CurrentAccountNote — on the owner's current account", () => {
  it("says, in a line, that an older account of theirs is retired, and links to it", () => {
    render(<CurrentAccountNote pubkey={CURRENT} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("This is their current account.");
    expect(within(note).getByRole("link", { name: /an older account of theirs is retired/i })).toHaveAttribute(
      "href",
      `/p/${nip19.npubEncode(OLD)}`,
    );
  });

  it("draws nothing on the retired account itself, or on anyone else's", () => {
    const { container } = render(
      <>
        <CurrentAccountNote pubkey={OLD} />
        <CurrentAccountNote pubkey={SOMEONE} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// A retired profile keeps its own Follow, but the one the page wants pressed is the current
// account's, in the notice above it: two filled buttons would be a coin toss.
describe("the retired profile's own Follow", () => {
  it("steps back to an outline when asked to be quiet, and still follows", () => {
    render(<FollowButton targetPubkey={OLD} initialFollowing={false} displayName="Pip (old)" quiet />);
    const quiet = screen.getByRole("button", { name: "Follow" });
    expect(quiet.className).not.toContain("bg-brand-primary");
    expect(quiet.className).toContain("border");
    fireEvent.click(quiet);
    expect(social.followUser).toHaveBeenCalledWith(OLD);
  });

  it("stays the filled button everywhere else", () => {
    render(<FollowButton targetPubkey={CURRENT} initialFollowing={false} displayName="Pip" />);
    expect(screen.getByRole("button", { name: "Follow" }).className).toContain("bg-brand-primary");
  });
});
