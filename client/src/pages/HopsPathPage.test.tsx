// @vitest-environment jsdom
/**
 * The Connection page over the whole Path network: the safest path first,
 * exact counts, risky accounts named with the paths through them, and a
 * stepper that says where you are.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";

const ME = "a".repeat(64),
  T = "f".repeat(64),
  C1 = "1".repeat(64),
  C2 = "2".repeat(64),
  C3 = "3".repeat(64),
  C4 = "4".repeat(64),
  C5 = "5".repeat(64);

type Network = { hops: number; layers: string[][]; links: number[][][]; pathCount: number };
/** The PRD's diamond: you → {C1, C2, C3} → {C4, C5} → T; five paths, three through C5. */
const diamond: Network = {
  hops: 3,
  layers: [
    [C1, C2, C3],
    [C4, C5],
  ],
  links: [[[0, 1], [0, 1], [1]]],
  pathCount: 5,
};
let served: Network = diamond;
let to = T;
let scores: Record<string, number | null | undefined> = {};
let flags: Record<string, boolean | undefined> = {};
let origin = { origin: ME, originPov: "global" as "global" | "personalized", isFallback: false, loading: false };

const api = vi.hoisted(() => ({
  getShortestPath: vi.fn(),
  getShortestHops: vi.fn(),
  getHouseInfluence: async () => null,
  getUserOverview: async () => null,
}));
vi.mock("@/services/api", () => ({ apiClient: api }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => (pk: string) => scores[pk] }));
vi.mock("@/hooks/useAuthorFlags", () => ({ useAuthorFlags: () => (pk: string) => flags[pk] }));
vi.mock("@/hooks/useHopsOrigin", () => ({ useHopsOrigin: () => origin }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/services/nostr", () => ({ fetchProfileMap: async () => new Map(), fetchProfileForShare: async () => null }));
vi.mock("@/services/socialActions", () => ({
  fetchContactList: async () => null,
  getFollowedPubkeys: () => new Set(),
  followUser: vi.fn(),
  reportUser: vi.fn(),
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));

import HopsPathPage from "./HopsPathPage";

import { PathNetworkTooLargeError } from "@/services/api/users";

const clean = { [ME]: 0.9, [C1]: 0.3, [C2]: 0.2, [C3]: 0.25, [C4]: 0.4, [C5]: 0.5, [T]: 0.4 };
const open = (target = T) => {
  window.history.replaceState({}, "", `/p/${nip19.npubEncode(target)}/hops`);
  return renderWithProviders(<HopsPathPage />);
};
/** The connectors on the card, in walk order. */
const shownConnectors = () =>
  screen
    .getAllByTestId(/^hops-node-\d+$/)
    .slice(1, -1)
    .map((li) => within(li).getAllByRole("link")[0].getAttribute("href"));
const npubs = (...pks: string[]) => pks.map((pk) => `/p/${nip19.npubEncode(pk)}`);

beforeEach(() => {
  vi.clearAllMocks();
  served = diamond;
  to = T;
  scores = { ...clean };
  flags = {};
  origin = { origin: ME, originPov: "global", isFallback: false, loading: false };
  api.getShortestPath.mockImplementation(async () => ({ from: ME, to, reachable: true, maxHops: 30, ...served }));
  api.getShortestHops.mockResolvedValue({ from: ME, to: T, reachable: true, hops: 3, maxHops: 30 });
});

describe("the Connection page", () => {
  it("a single path: says so, and offers nothing to step through", async () => {
    served = { hops: 2, layers: [[C1]], links: [], pathCount: 1 };
    open();
    await screen.findByTestId("hops-path");
    expect(screen.getByTestId("hops-degree")).not.toHaveTextContent("ways");
    expect(screen.queryByTestId("hops-checking")).toBeNull();
    expect(screen.queryByTestId("hops-next")).toBeNull();
    expect(screen.queryByTestId("hops-risk-flagged")).toBeNull();
  });

  it('one request, and every count is exact — no sampling, no "we checked"', async () => {
    flags = { [C5]: true };
    open();
    await waitFor(() =>
      expect(screen.getByTestId("hops-risk-flagged")).toHaveTextContent("1 flagged account, on 3 of the 5 paths"),
    );
    expect(screen.getByTestId("hops-degree")).toHaveTextContent("through 2 people, 5 different ways");
    expect(screen.queryByTestId("hops-checking")).toBeNull();
    expect(document.body).not.toHaveTextContent(/we checked|Checked \d/);
    expect(api.getShortestPath).toHaveBeenCalledTimes(1);
    expect(api.getShortestPath).toHaveBeenCalledWith({ from: ME, to: T });
  });

  it("leads with the safest path and steps through all of them in order, both ways, wrapping", async () => {
    flags = { [C5]: true };
    open();
    await waitFor(() => expect(screen.getByTestId("hops-next")).toHaveTextContent("Path 1 of 5"));
    expect(shownConnectors()).toEqual(npubs(C1, C4));
    fireEvent.click(screen.getByTestId("hops-next"));
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Path 2 of 5");
    expect(shownConnectors()).toEqual(npubs(C2, C4));
    fireEvent.click(screen.getByTestId("hops-prev"));
    fireEvent.click(screen.getByTestId("hops-prev"));
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Path 5 of 5");
    expect(shownConnectors()).toEqual(npubs(C2, C5)); // flagged, weakest link last
    fireEvent.click(screen.getByTestId("hops-next"));
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Path 1 of 5");
  });

  it("names the unverified accounts on their own line", async () => {
    scores = { ...clean, [C4]: 0.01 };
    open();
    await waitFor(() =>
      expect(screen.getByTestId("hops-risk-unverified")).toHaveTextContent("1 unverified account, on 2 of the 5 paths"),
    );
    expect(screen.queryByTestId("hops-risk-flagged")).toBeNull();
  });

  it('"Show them" steps through the flagged accounts, each on its safest path, most paths first; tapping again widens back', async () => {
    // C1 and C4 sit on two paths each; C1 is nearer, so it leads.
    flags = { [C1]: true, [C4]: true };
    open();
    await waitFor(() =>
      expect(screen.getByTestId("hops-risk-flagged")).toHaveTextContent("2 flagged accounts, on 3 of the 5 paths"),
    );
    fireEvent.click(screen.getByTestId("hops-group-flagged"));
    expect(screen.getByTestId("hops-group-flagged")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("hops-group-flagged")).toHaveTextContent("Show all");
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Flagged account 1 of 2");
    expect(shownConnectors()).toEqual(npubs(C1, C5)); // through C1, one risky connector
    expect(screen.getByTestId("hops-node-1")).toHaveAttribute("data-focus", "true");
    fireEvent.click(screen.getByTestId("hops-next"));
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Flagged account 2 of 2");
    expect(shownConnectors()).toEqual(npubs(C2, C4)); // through C4
    expect(screen.getByTestId("hops-node-2")).toHaveAttribute("data-focus", "true");
    expect(screen.getByTestId("hops-node-1")).not.toHaveAttribute("data-focus");
    fireEvent.click(screen.getByTestId("hops-group-flagged"));
    expect(screen.getByTestId("hops-group-flagged")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Path 1 of 5");
  });

  it("marks the connectors on the shown path — Flagged, Unverified — and never the target", async () => {
    served = { hops: 3, layers: [[C1], [C2]], links: [[[0]]], pathCount: 1 };
    flags = { [C1]: true, [T]: true };
    scores = { ...clean, [C2]: null };
    open();
    await screen.findByTestId("hops-flagged-1");
    expect(screen.getByTestId("hops-flagged-1")).toHaveTextContent("Flagged");
    expect(screen.getByTestId("hops-unverified-2")).toHaveTextContent("Unverified");
    expect(screen.queryByTestId("hops-flagged-3")).toBeNull();
    expect(screen.queryByTestId("hops-unverified-3")).toBeNull();
  });

  it("under your own account, the weak link is the person who followed the risky connector", async () => {
    served = { hops: 3, layers: [[C1], [C2]], links: [[[0]]], pathCount: 1 };
    flags = { [C2]: true };
    origin = { origin: ME, originPov: "personalized", isFallback: false, loading: false };
    open();
    await screen.findByTestId("hops-weaklink-1");
    expect(screen.getByTestId("hops-flagged-2")).toBeInTheDocument();
  });

  it("under Brainstorm's view the marks show, but there is no weak link to blame", async () => {
    served = { hops: 3, layers: [[C1], [C2]], links: [[[0]]], pathCount: 1 };
    flags = { [C2]: true };
    open();
    await screen.findByTestId("hops-flagged-2");
    expect(screen.queryByTestId("hops-weaklink-1")).toBeNull();
  });

  it("shows a path at once, unmarked, while the signals are still landing, then marks, counts and orders", async () => {
    scores = {};
    flags = { [C1]: true }; // landed early; the card still waits for the rest
    const { rerender } = open();
    await screen.findByTestId("hops-path");
    expect(screen.getByTestId("hops-checking")).toHaveTextContent("Checking who's on these paths");
    expect(screen.queryByTestId("hops-flagged-1")).toBeNull();
    expect(screen.queryByTestId("hops-next")).toBeNull();
    expect(screen.queryByTestId("hops-risk-flagged")).toBeNull();
    scores = { ...clean };
    flags = { [C5]: true };
    rerender(<HopsPathPage />);
    await waitFor(() =>
      expect(screen.getByTestId("hops-risk-flagged")).toHaveTextContent("1 flagged account, on 3 of the 5 paths"),
    );
    expect(screen.queryByTestId("hops-checking")).toBeNull();
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Path 1 of 5");
  });

  it("too large to map: the degree from hops alone, a plain note, and no paths", async () => {
    api.getShortestPath.mockRejectedValue(new PathNetworkTooLargeError());
    open();
    await waitFor(() => expect(screen.getByTestId("hops-too-large")).toHaveTextContent("too large to map right now"));
    expect(screen.getByTestId("hops-degree")).toHaveTextContent("3rd degree");
    expect(screen.queryByTestId("hops-path")).toBeNull();
    expect(screen.queryByTestId("hops-risk-flagged")).toBeNull();
    expect(api.getShortestHops).toHaveBeenCalledWith({ from: ME, to: T });
  });

  it("a tapped group belongs to that connection — a new target opens on every path again", async () => {
    const T2 = "e".repeat(64);
    flags = { [C5]: true };
    open();
    await waitFor(() => expect(screen.getByTestId("hops-group-flagged")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hops-group-flagged"));
    to = T2;
    window.history.pushState({}, "", `/p/${nip19.npubEncode(T2)}/hops`);
    await waitFor(() => expect(screen.getByTestId("hops-next")).toHaveTextContent("Path 1 of 5"));
    expect(screen.getByTestId("hops-group-flagged")).toHaveAttribute("aria-pressed", "false");
  });
});
