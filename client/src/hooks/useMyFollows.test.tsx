// @vitest-environment jsdom
/**
 * The viewer's own follow graph, as a set — the "local-first" half of
 * endorsements: which reviewers, zappers and followers are people YOU follow
 * is a fact from your kind-3, computed on-device. Shares the contacts query
 * with useSocialActions so an optimistic follow shows up here instantly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const activeMock = vi.fn<() => { pubkey: string } | null>(() => null);
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => activeMock() }));
const contactsMock = vi.fn();
vi.mock("@/services/socialActions", () => ({
  fetchContactList: (...a: unknown[]) => contactsMock(...a),
  getFollowedPubkeys: (list: { tags: string[][] } | null) => new Set(list?.tags.filter((t) => t[0] === "p").map((t) => t[1]) ?? []),
}));

import { useMyFollows } from "./useMyFollows";

const ME = "e".repeat(64);
const A = "a".repeat(64);

function Probe() {
  const { follows, ready, signedIn } = useMyFollows();
  return <div data-testid="probe">{signedIn ? "in" : "out"}:{ready ? "ready" : "loading"}:{[...follows].join(",")}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  activeMock.mockReturnValue(null);
});

describe("useMyFollows", () => {
  it("is an empty, ready set when nobody is signed in", () => {
    renderWithProviders(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("out:ready:");
    expect(contactsMock).not.toHaveBeenCalled();
  });

  it("resolves the signed-in viewer's follows through the shared contacts query", async () => {
    activeMock.mockReturnValue({ pubkey: ME });
    contactsMock.mockResolvedValue({ kind: 3, pubkey: ME, tags: [["p", A], ["t", "nope"]], content: "", created_at: 1 });
    const { queryClient } = renderWithProviders(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("in:loading:");
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(`in:ready:${A}`));
    expect(contactsMock).toHaveBeenCalledWith(ME);
    // The same cache entry useSocialActions writes optimistically.
    expect(queryClient.getQueryData(["nostr-contacts", ME])).toBeTruthy();
  });
});
