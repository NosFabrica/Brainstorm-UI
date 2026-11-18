import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import type { CompromisedStatus } from "@/lib/compromised";

// The real lookup: test/setup.ts answers "nobody" for every other suite.
vi.unmock("@/services/compromised");

const ME = "e".repeat(64);
const A = "a".repeat(64);
const B = "b".repeat(64);
const PROOF = "c".repeat(64);
const NEW_KEY = "d".repeat(64);

const viewer = vi.hoisted(() => ({
  signedIn: true,
  follows: new Set<string>(),
  reported: new Set<string>(),
  profiles: new Map<string, { name?: string; display_name?: string; picture?: string }>(),
  notes: new Map<
    string,
    { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] }[]
  >(),
  byId: new Map<
    string,
    { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] }
  >(),
  mode: "off" as string,
}));
const social = vi.hoisted(() => ({
  followUser: vi.fn(async (_pk: string) => ({ success: true })),
  unfollowUser: vi.fn(async (_pk: string) => ({ success: true })),
  reportUser: vi.fn(async (_pk: string, _reason: string) => ({ success: true })),
}));

vi.mock("@/hooks/useRelationshipBadges", () => ({
  useRelationshipBadges: (pk: string | undefined) => ({
    enabled: viewer.signedIn && !!pk && pk !== ME,
    isFollowing: viewer.signedIn && !!pk && viewer.follows.has(pk),
    isMuted: false,
    followsYou: false,
    report: pk && viewer.reported.has(pk) ? { id: "r", reason: "impersonation", created_at: 1 } : null,
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
vi.mock("@/hooks/useStoreEvents", () => ({
  useStoreEvents: (_key: string | null, filters: { ids?: string[] }[] | null) => ({
    events: (filters ?? []).flatMap((f) => (f.ids ?? []).flatMap((id) => viewer.byId.get(id) ?? [])),
    loading: false,
  }),
}));
vi.mock("@/hooks/useRecentByKinds", () => ({
  useRecentByKinds: (pk: string | undefined) => ({ events: (pk && viewer.notes.get(pk)) || [], loading: false }),
}));
vi.mock("@/components/share/EmbeddedNoteCard", () => ({
  EmbeddedNoteCard: ({ event }: { event: { content: string } }) => (
    <div data-testid="successor-note">{event.content}</div>
  ),
}));
vi.mock("@/components/search/PersonCard", () => ({
  PersonCard: ({ result, idx }: { result: { displayName?: string; npub: string }; idx: number | string }) => (
    <div data-testid={`result-profile-${idx}`} data-npub={result.npub}>
      {result.displayName}
    </div>
  ),
}));
vi.mock("@/hooks/useScoreDisplayMode", () => ({ useScoreDisplayMode: () => [viewer.mode, () => {}] }));

import { __resetCompromised } from "@/services/compromised";
import { CompromisedAuthorNotice } from "./CompromisedAuthorNotice";
import { CompromisedBanner } from "./CompromisedBanner";
import { CompromisedChatWarning } from "./CompromisedChatWarning";
import { CompromisedFollowsAlert } from "./CompromisedFollowsAlert";
import { CompromisedMark } from "./CompromisedMark";
import { CompromisedWatermark } from "./CompromisedWatermark";
import { NewAccountResult } from "./NewAccountResult";
import { ReplacesBanner } from "./ReplacesBanner";
import { useCompromisedRing } from "@/hooks/useCompromised";

const status = (over: Partial<CompromisedStatus> = {}): CompromisedStatus => ({
  pubkey: A,
  since: 1794855600,
  proofEventId: PROOF,
  proofEvent: null,
  successorPubkey: null,
  successorEventId: null,
  ...over,
});

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const serverSays = (results: unknown[]) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { results } }), { status: 200 }));

beforeEach(() => {
  __resetCompromised();
  fetchMock.mockReset();
  serverSays([]);
  vi.stubGlobal("fetch", fetchMock);
  viewer.signedIn = true;
  viewer.follows = new Set();
  viewer.reported = new Set();
  viewer.profiles = new Map([
    [A, { display_name: "Old Account" }],
    [NEW_KEY, { display_name: "New Account" }],
  ]);
  viewer.notes = new Map();
  viewer.byId = new Map();
  viewer.mode = "off";
  Object.values(social).forEach((f) => f.mockClear());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompromisedBanner", () => {
  it("says the account is compromised, as an alert, and what not to do", () => {
    render(<CompromisedBanner status={status()} />);
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("This account is compromised");
    expect(banner).toHaveTextContent("Someone other than its owner controls it");
    expect(banner).toHaveTextContent("Don't send it money");
  });

  it("links to the post that proves it", () => {
    render(<CompromisedBanner status={status()} />);
    const link = screen.getByRole("link", { name: /read the owner's post/i });
    const decoded = nip19.decode(link.getAttribute("href")!.replace("/e/", ""));
    expect(decoded.type).toBe("nevent");
    expect((decoded.data as { id: string }).id).toBe(PROOF);
  });

  it("has no proof link when there is no proof to link to", () => {
    render(<CompromisedBanner status={status({ proofEventId: null })} />);
    expect(screen.queryByRole("link", { name: /read the owner's post/i })).toBeNull();
  });

  it("shows the owner's new account by name, with a way to follow it and its latest post", () => {
    viewer.notes.set(NEW_KEY, [
      {
        id: "1".repeat(64),
        kind: 1,
        pubkey: NEW_KEY,
        created_at: 1794856000,
        content: "I'm back, on a new key.",
        tags: [],
      },
    ]);
    render(<CompromisedBanner status={status({ successorPubkey: NEW_KEY })} />);
    const card = screen.getByTestId("compromised-successor");
    expect(card).toHaveTextContent("The owner's new account");
    expect(within(card).getByRole("link", { name: /new account/i })).toHaveAttribute(
      "href",
      `/p/${nip19.npubEncode(NEW_KEY)}`,
    );
    expect(within(card).getByTestId("successor-note")).toHaveTextContent("I'm back, on a new key.");

    fireEvent.click(within(card).getByRole("button", { name: "Follow" }));
    expect(social.followUser).toHaveBeenCalledWith(NEW_KEY);
  });

  it("shows the owner's own post about the new account when one is recorded, not whatever they posted last", () => {
    const ANNOUNCE = "9".repeat(64);
    viewer.byId.set(ANNOUNCE, {
      id: ANNOUNCE,
      kind: 1,
      pubkey: NEW_KEY,
      created_at: 1794856000,
      content: "New key. Here is why.",
      tags: [],
    });
    viewer.notes.set(NEW_KEY, [
      { id: "1".repeat(64), kind: 1, pubkey: NEW_KEY, created_at: 1794860000, content: "gm", tags: [] },
    ]);
    render(<CompromisedBanner status={status({ successorPubkey: NEW_KEY, successorEventId: ANNOUNCE })} />);
    const card = screen.getByTestId("compromised-successor");
    expect(card).toHaveTextContent("Their post about the new account");
    expect(within(card).getByTestId("successor-note")).toHaveTextContent("New key. Here is why.");
    expect(card).not.toHaveTextContent("gm");
  });

  it("says the day it was compromised as that day everywhere, whatever the reader's time zone", () => {
    // Midnight UTC on Nov 16: a reader west of UTC must not be told Nov 15.
    render(<CompromisedBanner status={status({ since: 1794787200 })} />);
    expect(screen.getByTestId("compromised-since")).toHaveTextContent("Compromised since Nov 16, 2026");
  });

  it("says a report is public, beside the button that sends one", () => {
    render(<CompromisedBanner status={status()} />);
    expect(screen.getByTestId("compromised-actions")).toHaveTextContent("Reports are public");
  });

  it("offers someone who follows the compromised account a one-click unfollow", async () => {
    viewer.follows.add(A);
    render(<CompromisedBanner status={status()} />);
    fireEvent.click(screen.getByRole("button", { name: /unfollow this account/i }));
    await waitFor(() => expect(social.unfollowUser).toHaveBeenCalledWith(A));
  });

  it("offers no unfollow to someone who doesn't follow it", () => {
    render(<CompromisedBanner status={status()} />);
    expect(screen.queryByRole("button", { name: /unfollow/i })).toBeNull();
  });

  it("reports the account as an impersonation, once", async () => {
    render(<CompromisedBanner status={status()} />);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    await waitFor(() => expect(social.reportUser).toHaveBeenCalledWith(A, "impersonation"));
    expect(await screen.findByText("Reported")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("shows a signed-out reader the warning and the links, and no account actions", () => {
    viewer.signedIn = false;
    render(<CompromisedBanner status={status({ successorPubkey: NEW_KEY })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This account is compromised");
    expect(screen.getByTestId("compromised-successor")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ReplacesBanner", () => {
  it("says on the new account's page which compromised account it replaces", () => {
    render(<ReplacesBanner replaces={status({ successorPubkey: NEW_KEY })} />);
    const note = screen.getByTestId("replaces-banner");
    expect(note).toHaveTextContent("replaces one that was compromised");
    expect(within(note).getByRole("link", { name: /old account/i })).toHaveAttribute(
      "href",
      `/p/${nip19.npubEncode(A)}`,
    );
  });
});

describe("CompromisedMark", () => {
  it("marks an account the server says is compromised", async () => {
    serverSays([{ pubkey: A, compromised: true }]);
    render(<CompromisedMark pubkey={A} />);
    expect(await screen.findByTestId("compromised-mark")).toHaveTextContent("Compromised");
  });

  it("draws nothing for an account that isn't marked", async () => {
    serverSays([{ pubkey: B, compromised: false }]);
    render(<CompromisedMark pubkey={B} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("compromised-mark")).toBeNull();
  });

  it("marks the owner's new account as the new account", async () => {
    serverSays([{ pubkey: A, compromised: true, successor_pubkey: NEW_KEY }]);
    render(
      <>
        <CompromisedMark pubkey={A} />
        <CompromisedMark pubkey={NEW_KEY} />
      </>,
    );
    expect(await screen.findByTestId("successor-mark")).toHaveTextContent("New account");
  });
});

describe("the avatar ring", () => {
  function Face({ pubkey }: { pubkey: string }) {
    return <span data-testid="face" className={useCompromisedRing(pubkey) ?? "none"} />;
  }

  it("rings a compromised account in red even with trust display turned off", async () => {
    viewer.mode = "off";
    serverSays([{ pubkey: A, compromised: true }]);
    render(<Face pubkey={A} />);
    await waitFor(() => expect(screen.getByTestId("face").className).toContain("#dc2626"));
  });

  it("leaves everyone else's avatar alone", async () => {
    serverSays([{ pubkey: B, compromised: false }]);
    render(<Face pubkey={B} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("face").className).toBe("none");
  });
});

describe("CompromisedFollowsAlert", () => {
  it("tells a reader which accounts they follow are compromised, with the new account to follow instead", async () => {
    viewer.follows = new Set([A, B]);
    serverSays([
      { pubkey: A, compromised: true, successor_pubkey: NEW_KEY },
      { pubkey: B, compromised: false },
    ]);
    render(<CompromisedFollowsAlert observer={ME} />);
    const alert = await screen.findByTestId("compromised-follows-alert");
    expect(alert).toHaveTextContent("An account you follow is compromised");
    expect(alert).toHaveTextContent("Old Account");
    expect(alert).toHaveTextContent("New Account");
    expect(within(alert).getByRole("button", { name: /unfollow/i })).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Follow" })).toBeInTheDocument();
  });

  it("says nothing when none of the reader's follows is compromised", async () => {
    viewer.follows = new Set([B]);
    serverSays([{ pubkey: B, compromised: false }]);
    render(<CompromisedFollowsAlert observer={ME} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("compromised-follows-alert")).toBeNull();
  });
});

describe("CompromisedAuthorNotice", () => {
  const SINCE = "2026-11-16T19:00:00Z"; // 1794855600

  it("warns that a post made after the compromise may not be the owner's, and points to the new account", async () => {
    serverSays([{ pubkey: A, compromised: true, since: SINCE, successor_pubkey: NEW_KEY }]);
    render(<CompromisedAuthorNotice pubkey={A} postedAt={1794855600 + 60} />);
    const notice = await screen.findByTestId("compromised-author-notice");
    expect(notice).toHaveTextContent("Posted after this account was compromised");
    expect(notice).toHaveTextContent("may not be from the owner");
    expect(within(notice).getByRole("link", { name: /new account/i })).toHaveAttribute(
      "href",
      `/p/${nip19.npubEncode(NEW_KEY)}`,
    );
  });

  it("says an older post is the owner's own, from before the compromise", async () => {
    serverSays([{ pubkey: A, compromised: true, since: SINCE }]);
    render(<CompromisedAuthorNotice pubkey={A} postedAt={1794855600 - 86400} />);
    const notice = await screen.findByTestId("compromised-author-notice");
    expect(notice).toHaveTextContent("Posted before this account was compromised");
    expect(notice).not.toHaveTextContent("may not be from the owner");
  });

  it("treats the proof post as a compromised post, and says it is where the owner said so", async () => {
    serverSays([{ pubkey: A, compromised: true, since: SINCE, proof_event_id: PROOF }]);
    render(<CompromisedAuthorNotice pubkey={A} postedAt={1794855600 + 60} eventId={PROOF} />);
    const notice = await screen.findByTestId("compromised-author-notice");
    // A compromised post like the rest, and the one where the owner says so.
    expect(notice).toHaveAttribute("role", "alert");
    expect(notice).toHaveTextContent("Posted from a compromised account");
    expect(notice).toHaveTextContent("In this post the owner says their account was compromised");
    expect(notice).not.toHaveTextContent("may not be from the owner");
  });

  it("says nothing under anyone else's post", async () => {
    serverSays([{ pubkey: B, compromised: false }]);
    render(<CompromisedAuthorNotice pubkey={B} postedAt={1794855600} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("compromised-author-notice")).toBeNull();
  });
});

describe("CompromisedWatermark", () => {
  it("lays a mark over a compromised account's content that never takes a click or a screen reader's attention", async () => {
    serverSays([{ pubkey: A, compromised: true }]);
    render(<CompromisedWatermark pubkey={A} />);
    const mark = await screen.findByTestId("compromised-watermark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark.className).toContain("pointer-events-none");
    // Hidden until the reader's pointer is on the content.
    expect(mark.className).toContain("opacity-0");
  });

  it("leaves what the owner posted before the compromise unmarked: that content is still theirs", async () => {
    serverSays([{ pubkey: A, compromised: true, since: "2026-11-16T19:00:00Z" }]);
    render(
      <>
        <CompromisedWatermark pubkey={A} postedAt={1794855600 - 86400} />
        <CompromisedMark pubkey={A} />
      </>,
    );
    await screen.findByTestId("compromised-mark");
    expect(screen.queryByTestId("compromised-watermark")).toBeNull();
  });

  it("marks the owner's own post about the compromise as well: it was posted with the key already taken", async () => {
    serverSays([{ pubkey: A, compromised: true, since: "2026-11-16T19:00:00Z", proof_event_id: PROOF }]);
    render(<CompromisedWatermark pubkey={A} postedAt={1794855600 - 60} eventId={PROOF} />);
    expect(await screen.findByTestId("compromised-watermark")).toBeInTheDocument();
  });

  it("marks what was posted after it", async () => {
    serverSays([{ pubkey: A, compromised: true, since: "2026-11-16T19:00:00Z" }]);
    render(<CompromisedWatermark pubkey={A} postedAt={1794855600 + 60} />);
    expect(await screen.findByTestId("compromised-watermark")).toBeInTheDocument();
  });

  it("on the account's own profile, plays when the page is viewed: no hover needed", async () => {
    serverSays([{ pubkey: A, compromised: true }]);
    render(<CompromisedWatermark pubkey={A} when="view" />);
    const mark = await screen.findByTestId("compromised-watermark");
    expect(mark.className).toContain("motion-safe:animate-[cw-settle");
    expect(mark.className).not.toContain("group-hover/cw:animate");
    expect(mark.className).toContain("pointer-events-none");
  });

  it("lays nothing over anyone else's", async () => {
    serverSays([{ pubkey: B, compromised: false }]);
    render(<CompromisedWatermark pubkey={B} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("compromised-watermark")).toBeNull();
  });
});

describe("NewAccountResult", () => {
  it("puts the owner's new account, highlighted, above its compromised one in a list of people", async () => {
    serverSays([{ pubkey: A, compromised: true, successor_pubkey: NEW_KEY }]);
    render(<NewAccountResult compromisedPubkey={A} pov="nosfabrica" onOpen={() => {}} />);
    const row = await screen.findByTestId("new-account-result");
    expect(row).toHaveTextContent("The owner's new account");
    const card = within(row).getByTestId("result-profile-new-account");
    expect(card).toHaveTextContent("New Account");
    expect(card).toHaveAttribute("data-npub", nip19.npubEncode(NEW_KEY));
  });

  it("adds nothing above a compromised account with no known new account, or above anyone else", async () => {
    serverSays([
      { pubkey: A, compromised: true },
      { pubkey: B, compromised: false },
    ]);
    render(
      <>
        <NewAccountResult compromisedPubkey={A} pov="nosfabrica" onOpen={() => {}} />
        <NewAccountResult compromisedPubkey={B} pov="nosfabrica" onOpen={() => {}} />
      </>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("new-account-result")).toBeNull();
  });
});

describe("CompromisedChatWarning", () => {
  it("warns, loudly, that the person in this chat is compromised, and offers the owner's new account to message instead", async () => {
    serverSays([{ pubkey: A, compromised: true, successor_pubkey: NEW_KEY }]);
    render(<CompromisedChatWarning pubkeys={[A]} />);
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("You're messaging a compromised account");
    expect(warning).toHaveTextContent("Don't send money");
    expect(within(warning).getByRole("link", { name: /message their new account/i })).toHaveAttribute(
      "href",
      `/messages/${nip19.npubEncode(NEW_KEY)}`,
    );
  });

  it("names who, in a group", async () => {
    serverSays([
      { pubkey: A, compromised: true },
      { pubkey: B, compromised: false },
    ]);
    render(<CompromisedChatWarning pubkeys={[A, B]} />);
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("Someone in this chat is compromised");
    expect(warning).toHaveTextContent("Old Account");
  });

  it("keeps a short reminder at the composer, where the money would be sent", async () => {
    serverSays([{ pubkey: A, compromised: true }]);
    render(<CompromisedChatWarning pubkeys={[A]} placement="composer" />);
    expect(await screen.findByTestId("compromised-chat-reminder")).toHaveTextContent("Compromised account");
  });

  it("says nothing in a chat with nobody compromised", async () => {
    serverSays([{ pubkey: B, compromised: false }]);
    render(<CompromisedChatWarning pubkeys={[B]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
