// @vitest-environment jsdom
/**
 * The Connection page: prefers the clean path, and names the risky ones.
 * The team (2026-09-24): surface paths that run through a flagged or
 * unverified account so a reader can spot a bad actor in their trust
 * network. Benjamin: simple — the safest path first, counts you can tap,
 * a Next button that says where you are.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";

const ME = "a".repeat(64), T = "f".repeat(64), C1 = "1".repeat(64), C2 = "2".repeat(64), C3 = "3".repeat(64);
let served: string[][] = [];
let calls = 0;
let extra: Record<string, unknown> = {};
let pathCount = 19;
let scores: Record<string, number | null | undefined> = {};
let flags: Record<string, boolean | undefined> = {};
let origin = { origin: ME, originPov: "global" as "global" | "personalized", isFallback: false, loading: false };
const getShortestPath = vi.fn(async () => ({ from: ME, to: T, reachable: true, hops: 2, path: served[calls++ % served.length], pathCount, pathCountCapped: false, maxHops: 6, ...extra }));

vi.mock("@/services/api", () => ({ apiClient: { getShortestPath: (o: unknown) => getShortestPath(o), getHouseInfluence: async () => null, getUserOverview: async () => null } }));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => (pk: string) => scores[pk] }));
vi.mock("@/hooks/useAuthorFlags", () => ({ useAuthorFlags: () => (pk: string) => flags[pk] }));
vi.mock("@/hooks/useHopsOrigin", () => ({ useHopsOrigin: () => origin }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["nosfabrica", () => {}] }));
vi.mock("@/services/nostr", () => ({ fetchProfileMap: async () => new Map(), fetchProfileForShare: async () => null }));
vi.mock("@/services/socialActions", () => ({ fetchContactList: async () => null, getFollowedPubkeys: () => new Set(), followUser: vi.fn(), reportUser: vi.fn() }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));

import HopsPathPage from "./HopsPathPage";

const clean = { [ME]: 0.9, [C1]: 0.3, [C2]: 0.2, [C3]: 0.25, [T]: 0.4 };
const open = () => {
  window.history.replaceState({}, "", `/p/${nip19.npubEncode(T)}/hops`);
  return renderWithProviders(<HopsPathPage />);
};

beforeEach(() => {
  vi.clearAllMocks();
  calls = 0;
  extra = {};
  pathCount = 19;
  scores = { ...clean };
  flags = {};
  origin = { origin: ME, originPov: "global", isFallback: false, loading: false };
});

describe("the Connection page", () => {
  it("a single path: says so, and offers nothing to step through", async () => {
    served = [[ME, C1, T]];
    pathCount = 1;
    open();
    await screen.findByTestId("hops-path");
    expect(screen.getByTestId("hops-summary")).toHaveTextContent("This is the only connection this direct");
    expect(screen.queryByTestId("hops-next")).toBeNull();
    expect(screen.queryByTestId("hops-group-verified")).toBeNull();
  });

  it("samples a few paths and says honestly how many it checked", async () => {
    served = [[ME, C1, T], [ME, C2, T], [ME, C3, T], [ME, C1, T]];
    open();
    await waitFor(() => expect(screen.getByTestId("hops-summary")).toHaveTextContent(/We checked 3 of the 19 connections/));
    expect(getShortestPath).toHaveBeenCalledWith({ from: ME, to: T });
  });

  it("takes the server's list when it sends one, and says it saw them all", async () => {
    served = [[ME, C1, T]];
    pathCount = 3;
    extra = { paths: [[ME, C1, T], [ME, C2, T], [ME, C3, T]] };
    open();
    await waitFor(() => expect(screen.getByTestId("hops-summary")).toHaveTextContent(/All 3 connections/));
    expect(getShortestPath).toHaveBeenCalledTimes(1);
  });

  it("counts the groups, leads with the safest path, and says where you are", async () => {
    served = [[ME, C1, T], [ME, C2, T], [ME, C3, T]];
    pathCount = 3;
    flags = { [C1]: true };
    scores = { ...clean, [C3]: 0.01 };
    open();
    await waitFor(() => expect(screen.getByTestId("hops-group-flagged")).toHaveTextContent("1 flagged"));
    expect(screen.getByTestId("hops-group-verified")).toHaveTextContent("1 verified");
    expect(screen.getByTestId("hops-group-unverified")).toHaveTextContent("1 unverified");
    // The safest path leads: its connector is C2.
    expect(within(screen.getByTestId("hops-node-1")).getByRole("link", { name: /.+/ }).getAttribute("href")).toBe(`/p/${nip19.npubEncode(C2)}`);
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Next path · 1 of 3");
  });

  it("tapping a group narrows the page to it: the button presses, its path shows, and Next has nowhere to go", async () => {
    served = [[ME, C1, T], [ME, C2, T], [ME, C3, T]];
    pathCount = 3;
    flags = { [C1]: true };
    open();
    await waitFor(() => expect(screen.getByTestId("hops-group-flagged")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("hops-group-flagged"));
    expect(screen.getByTestId("hops-group-flagged")).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("hops-node-1")).getByRole("link", { name: /.+/ }).getAttribute("href")).toBe(`/p/${nip19.npubEncode(C1)}`);
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Next path · 1 of 1");
    expect(screen.getByTestId("hops-next")).toBeDisabled();
  });

  it("stepping wraps around, and tapping the pressed group again widens back to every path", async () => {
    served = [[ME, C1, T], [ME, C2, T], [ME, C3, T]];
    pathCount = 3;
    flags = { [C1]: true };
    open();
    await waitFor(() => expect(screen.getByTestId("hops-next")).toHaveTextContent("1 of 3"));
    fireEvent.click(screen.getByTestId("hops-next"));
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Next path · 2 of 3");
    fireEvent.click(screen.getByTestId("hops-next"));
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Next path · 3 of 3");
    // The flagged path is last in the safest-first order.
    expect(within(screen.getByTestId("hops-node-1")).getByRole("link", { name: /.+/ }).getAttribute("href")).toBe(`/p/${nip19.npubEncode(C1)}`);
    fireEvent.click(screen.getByTestId("hops-next"));
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Next path · 1 of 3");
    fireEvent.click(screen.getByTestId("hops-group-flagged"));
    fireEvent.click(screen.getByTestId("hops-group-flagged"));
    expect(screen.getByTestId("hops-group-flagged")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Next path · 1 of 3");
  });

  it("marks the connectors on the shown path — Flagged, Unverified — and never the target", async () => {
    served = [[ME, C1, C2, T]];
    pathCount = 1;
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
    served = [[ME, C1, C2, T]];
    pathCount = 1;
    flags = { [C2]: true };
    origin = { origin: ME, originPov: "personalized", isFallback: false, loading: false };
    open();
    await screen.findByTestId("hops-weaklink-1");
    expect(screen.getByTestId("hops-flagged-2")).toBeInTheDocument();
  });

  it("under Brainstorm's view the marks show, but there is no weak link to blame", async () => {
    served = [[ME, C1, C2, T]];
    pathCount = 1;
    flags = { [C2]: true };
    open();
    await screen.findByTestId("hops-flagged-2");
    expect(screen.queryByTestId("hops-weaklink-1")).toBeNull();
  });

  it("shows the first path at once while the signals are still landing, then marks and counts", async () => {
    served = [[ME, C1, T], [ME, C2, T]];
    pathCount = 2;
    scores = {};
    const { rerender } = open();
    await screen.findByTestId("hops-path");
    expect(screen.getByTestId("hops-summary")).toHaveTextContent("Checking who's on these paths");
    expect(screen.queryByTestId("hops-next")).toBeNull();
    scores = { ...clean };
    flags = { [C1]: true };
    rerender(<HopsPathPage />);
    await waitFor(() => expect(screen.getByTestId("hops-group-flagged")).toHaveTextContent("1 flagged"));
    expect(screen.getByTestId("hops-group-verified")).toHaveTextContent("1 verified");
    expect(screen.getByTestId("hops-next")).toHaveTextContent("Next path · 1 of 2");
  });
});
