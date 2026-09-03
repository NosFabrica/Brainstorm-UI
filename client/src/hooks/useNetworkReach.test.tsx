// @vitest-environment jsdom
/**
 * How far the viewer's network reaches: the people they follow (their own
 * kind-3) and friends of friends (a sampled two-hop set from those follows'
 * contact lists — the dashboard's reading-feed graph, reused). One fetch per
 * viewer per session; signed out there is no "you", so it is empty and ready.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const ME = "e".repeat(64);
const F1 = "1".repeat(64);
const F2 = "2".repeat(64);
const FOF = "3".repeat(64);
const contactsMock = vi.fn();
const eventsMock = vi.fn();
vi.mock("@/services/socialActions", () => ({
  fetchContactList: (pk: string) => contactsMock(pk),
  getFollowedPubkeys: (list: { tags: string[][] } | null) => new Set(list?.tags.filter((t) => t[0] === "p").map((t) => t[1]) ?? []),
}));
vi.mock("@/services/nostr", () => ({ fetchEventsByFilter: (...a: unknown[]) => eventsMock(...a) }));
vi.mock("@/lib/relays", () => ({ CONTENT_RELAYS: ["wss://x"] }));

import { useNetworkReach, __resetNetworkReach } from "./useNetworkReach";

function Probe({ me }: { me?: string }) {
  const r = useNetworkReach(me);
  return <div data-testid="probe">{r.ready ? "ready" : "loading"}|{[...r.direct].map((p) => p[0]).join("")}|{[...r.friends].map((p) => p[0]).join("")}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetNetworkReach();
});

describe("useNetworkReach", () => {
  it("is empty and ready with nobody signed in", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("ready||");
    expect(contactsMock).not.toHaveBeenCalled();
  });

  it("builds direct follows and friends-of-friends from real contact lists", async () => {
    contactsMock.mockResolvedValue({ kind: 3, pubkey: ME, tags: [["p", F1], ["p", F2]], content: "", created_at: 1 });
    eventsMock.mockResolvedValue([
      { kind: 3, pubkey: F1, tags: [["p", FOF], ["p", ME], ["p", F2]], content: "", created_at: 1 },
    ]);
    render(<Probe me={ME} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("loading||");
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|12|123"));
    // Friends of friends never include me; direct follows are in friends too.
    expect(eventsMock).toHaveBeenCalledWith(expect.objectContaining({ kinds: [3], authors: [F1, F2] }), ["wss://x"], expect.any(Number));
  });
});
