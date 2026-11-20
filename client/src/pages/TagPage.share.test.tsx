/** A tag page's Share pill hands out the tag's short link. */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";

const AUTHOR = "ab".repeat(32);
const NPUB = nip19.npubEncode(AUTHOR);
const SLUG = "bitcoin-dev";
let status: "ok" | "absent" | "unavailable" = "ok";
let viewer: string | null = null;
let madeFor: "posts" | "people" | undefined;
let carriers: unknown[] = [];

const createShortUrl = vi.hoisted(() => vi.fn());
vi.mock("@/services/api", () => ({ apiClient: { createShortUrl } }));
vi.mock("wouter", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("wouter");
  return {
    ...actual,
    useRoute: () => [true, { author: NPUB, slug: SLUG }],
    useLocation: () => [`/tags/${NPUB}/${SLUG}`, () => {}],
  };
});
vi.mock("@/hooks/useTags", () => ({
  useTagDetail: () => ({
    isLoading: false,
    data: {
      status,
      tag: { name: "Bitcoin Developer", description: "", madeFor },
      elementId: "",
      carriers,
      disputed: [],
    },
  }),
  useTagVote: () => ({ mutate: () => {}, isPending: false }),
  usePinnedTags: () => ({ data: [] }),
  useTogglePin: () => ({ mutate: () => {}, isPending: false }),
  useEditTagDescription: () => ({ mutateAsync: async () => ({ description: "" }), isPending: false }),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => (viewer ? { pubkey: viewer } : null),
}));
vi.mock("@/hooks/useLiveProfile", () => ({ useLiveProfiles: () => new Map() }));
vi.mock("@/hooks/useGoBack", () => ({ useGoBack: () => () => {} }));
vi.mock("@/components/score/TrustScorePov", () => ({ useScorePov: () => ({ pov: "global" }) }));
vi.mock("@/components/share/TaggedNotes", () => ({ TaggedNotes: () => null }));
vi.mock("@/components/share/TagComments", () => ({ TagComments: () => null }));
vi.mock("@/components/PublicPageHeader", () => ({
  PublicPageHeader: ({ actions }: { actions?: ReactNode }) => <header>{actions}</header>,
}));
vi.mock("@/pages/not-found", () => ({ default: () => <div data-testid="app-not-found" /> }));

import TagPage from "./TagPage";

beforeEach(() => {
  status = "ok";
  viewer = null;
  madeFor = undefined;
  carriers = [];
  createShortUrl.mockReset();
});
afterEach(() => {
  delete (navigator as { share?: unknown }).share;
});

const tapShare = () => {
  const pill = screen.getByTestId("share-open-modal");
  fireEvent.pointerDown(pill);
  fireEvent.click(pill);
};

describe("sharing a tag page", () => {
  it("mints a tag short link keyed author hex:slug and shows it in the share sheet", async () => {
    createShortUrl.mockResolvedValue({ shortCode: "AB3XK9QZ" });
    renderWithProviders(<TagPage />);
    tapShare();
    expect(screen.getByTestId("modal-share")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("share-link-input")).toHaveValue(`${window.location.origin}/s/AB3XK9QZ`),
    );
    expect(createShortUrl).toHaveBeenCalledWith({ kind: "tag", key: `${AUTHOR}:${SLUG}`, relays: [] });
  });

  it("the share sheet gets the tag's name and, when minting fails, the page's public URL", async () => {
    createShortUrl.mockRejectedValue(new Error("429"));
    const share = vi.fn(async (_d: { title: string; url: string }) => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    renderWithProviders(<TagPage />);
    tapShare();
    await waitFor(
      () =>
        expect(share).toHaveBeenCalledWith({
          title: "Bitcoin Developer on Brainstorm",
          url: `${window.location.origin}/tags/${NPUB}/${SLUG}`,
        }),
      { timeout: 3000 },
    );
  });

  it("offers no Share until the relays confirm the tag exists", () => {
    status = "unavailable";
    renderWithProviders(<TagPage />);
    expect(screen.queryByTestId("share-open-modal")).toBeNull();
  });
});

describe("a tag nobody carries", () => {
  it("shows no people section: no empty card, no '0 people'", () => {
    renderWithProviders(<TagPage />);
    expect(screen.queryByText("Nobody has this tag yet")).toBeNull();
    expect(screen.queryByText(/^0 people$/i)).toBeNull();
  });
});

// A tag's description is its creator's to change, later and as often as they like; its name isn't.
describe("editing a tag's description from its page", () => {
  it("is offered to the tag's creator", () => {
    viewer = AUTHOR;
    renderWithProviders(<TagPage />);
    expect(screen.getByTestId("tag-description-edit")).toHaveTextContent("Add a description");
  });

  it("is offered to nobody else, signed in or not", () => {
    viewer = "cd".repeat(32);
    const { unmount } = renderWithProviders(<TagPage />);
    expect(screen.queryByTestId("tag-description-edit")).toBeNull();
    unmount();
    viewer = null;
    renderWithProviders(<TagPage />);
    expect(screen.queryByTestId("tag-description-edit")).toBeNull();
  });

  it("is not offered until the relays confirm the tag exists", () => {
    viewer = AUTHOR;
    status = "unavailable";
    renderWithProviders(<TagPage />);
    expect(screen.queryByTestId("tag-description-edit")).toBeNull();
  });
});

// "Add me to this tag" is how a person joins a tag about people. On a tag made
// for posts ("Dance", put on a video) it asked the reader to call themselves a video.
describe("adding yourself from a tag's page", () => {
  it("is offered on a tag about people", () => {
    viewer = "cd".repeat(32);
    renderWithProviders(<TagPage />);
    expect(screen.getByTestId("tag-self-add")).toHaveTextContent("Add me to this tag");
    expect(screen.getByTestId("tag-header")).toHaveTextContent("People the network says this describes.");
  });

  it("is not offered on a tag made for posts that nobody carries", () => {
    viewer = "cd".repeat(32);
    madeFor = "posts";
    renderWithProviders(<TagPage />);
    expect(screen.queryByTestId("tag-self-add")).toBeNull();
    // Not "Posts": a tag made on a post is put on articles, repos and events too.
    expect(screen.getByTestId("tag-header")).toHaveTextContent("Content the network says this describes.");
  });

  it("is offered again once people carry it: how a tag is used outranks what it was made for", () => {
    viewer = "cd".repeat(32);
    madeFor = "posts";
    carriers = [
      { pubkey: "ef".repeat(32), applications: 2, disputes: 0, asserters: [], addedAt: 1, selfDeclared: false },
    ];
    renderWithProviders(<TagPage />);
    expect(screen.getByTestId("tag-self-add")).toBeInTheDocument();
  });
});
