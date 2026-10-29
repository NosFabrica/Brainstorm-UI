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
      tag: { name: "Bitcoin Developer", description: "" },
      elementId: "",
      carriers: [],
      disputed: [],
    },
  }),
  useTagVote: () => ({ mutate: () => {}, isPending: false }),
  usePinnedTags: () => ({ data: [] }),
  useTogglePin: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
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
