// @vitest-environment jsdom
/**
 * Keyword search through a follow or follower list (issue #310): someone you
 * followed minutes ago may score too low for the site's search to surface, but
 * they are in your list — so the list itself can be searched, by name, handle
 * or key, on your own lists and on anyone else's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderWithProviders } from "@/test/utils";
import ConnectionListPage from "./ConnectionListPage";

const SUBJECT = "f".repeat(64);
const LIRA = "a".repeat(64);
const MOSS = "b".repeat(64);
const QUILL = "c".repeat(64);

/** The backend's pages, newest cursor first; a test sets what each returns. */
const pages = vi.hoisted(() => ({
  byCursor: {} as Record<string, { items: { pubkey: string; influence: number | null }[]; next_cursor: string | null }>,
  calls: [] as (string | undefined)[],
}));
const getUserConnections = vi.hoisted(() =>
  vi.fn(async (_pk: string, _kind: string, opts?: { cursor?: string }) => {
    pages.calls.push(opts?.cursor);
    return { data: pages.byCursor[opts?.cursor ?? "first"] };
  }),
);

vi.mock("wouter", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useRoute: () => [true, { id: SUBJECT, type: "following" }],
  useLocation: () => [`/p/${SUBJECT}/following`, vi.fn()],
  Redirect: () => null,
}));
vi.mock("@/services/api", () => ({ apiClient: { getUserConnections } }));
vi.mock("@/hooks/useLiveProfile", () => ({
  useLiveProfile: () => ({ profile: { display_name: "Subject" } }),
  useLiveProfiles: () =>
    new Map([
      [LIRA, { display_name: "Lira Ødegaard", name: "lira_dev" }],
      [MOSS, { display_name: "Moss", name: "moss" }],
      // Quill has no profile loaded yet: only the key can find them.
    ]),
}));
vi.mock("@/hooks/useStoreEvents", () => ({ useStoreEvents: () => ({ events: [], loading: false, settled: true }) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useGoBack", () => ({ useGoBack: () => vi.fn() }));
vi.mock("@/hooks/useTierGranularity", () => ({ useTierGranularity: () => ["simple", vi.fn()] }));
vi.mock("@/components/PublicPageHeader", () => ({ PublicPageHeader: () => null }));
vi.mock("@/components/messages/MessageButton", () => ({ MessageButton: () => null }));
vi.mock("@/components/score/TrustScorePov", () => ({
  TrustScoreModal: () => null,
  useScorePov: () => ({ pov: "global" }),
}));

const row = (pk: string) => `conn-row-${pk.slice(0, 8)}`;

describe("ConnectionListPage — searching the list", () => {
  beforeEach(() => {
    pages.calls = [];
    getUserConnections.mockClear();
    pages.byCursor = {
      first: {
        items: [
          { pubkey: LIRA, influence: 0.9 },
          { pubkey: MOSS, influence: 0.4 },
          { pubkey: QUILL, influence: 0.1 },
        ],
        next_cursor: null,
      },
    };
  });

  it("narrows the rows to the people matching what's typed, and says when nobody does", async () => {
    renderWithProviders(<ConnectionListPage />);
    await screen.findByTestId(row(LIRA));
    expect(screen.getByTestId(row(MOSS))).toBeInTheDocument();

    const box = screen.getByTestId("conn-search");
    fireEvent.change(box, { target: { value: "lira" } });
    expect(screen.getByTestId(row(LIRA))).toBeInTheDocument();
    expect(screen.queryByTestId(row(MOSS))).toBeNull();
    expect(screen.queryByTestId(row(QUILL))).toBeNull();

    // A key finds someone whose profile hasn't loaded.
    fireEvent.change(box, { target: { value: "cccc" } });
    expect(screen.getByTestId(row(QUILL))).toBeInTheDocument();
    expect(screen.queryByTestId(row(LIRA))).toBeNull();

    // "No one" is only said once the whole list has been read.
    fireEvent.change(box, { target: { value: "zebra" } });
    expect(await screen.findByTestId("conn-search-empty")).toHaveTextContent("zebra");

    fireEvent.change(box, { target: { value: "" } });
    await waitFor(() => expect(screen.getByTestId(row(MOSS))).toBeInTheDocument());
    expect(screen.queryByTestId("conn-search-empty")).toBeNull();
  });

  /**
   * The list is paged, twenty at a time, and the person wanted may be on page
   * eleven: a search reads every page, so "no one matching" means no one in
   * the whole list. Browsing without a query still loads one page at a time.
   */
  it("reads the rest of the list while a query is typed, so a match on a later page is found", async () => {
    pages.byCursor = {
      first: { items: [{ pubkey: LIRA, influence: 0.9 }], next_cursor: "page-2" },
      "page-2": { items: [{ pubkey: MOSS, influence: 0.4 }], next_cursor: "page-3" },
      "page-3": { items: [{ pubkey: QUILL, influence: 0.1 }], next_cursor: null },
    };
    renderWithProviders(<ConnectionListPage />);
    await screen.findByTestId(row(LIRA));
    expect(pages.calls).toEqual([undefined]);
    expect(screen.getByTestId("conn-load-more")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("conn-search"), { target: { value: "cccc" } });
    await screen.findByTestId(row(QUILL));
    // The first page again, at the largest size, then every cursor after it.
    expect(pages.calls).toEqual([undefined, undefined, "page-2", "page-3"]);
    expect(screen.queryByTestId(row(LIRA))).toBeNull();
    // Nothing left to page through: the button is gone with the query still set.
    expect(screen.queryByTestId("conn-load-more")).toBeNull();
  });
});
