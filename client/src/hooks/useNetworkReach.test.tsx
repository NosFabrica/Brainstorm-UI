// @vitest-environment jsdom
/**
 * The people the viewer follows — their own kind-3, and nothing past it: no
 * follows' contact lists are fetched. Signed out there is no "you", so it is
 * empty and ready.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const ME = "e".repeat(64);
const F1 = "1".repeat(64);
const F2 = "2".repeat(64);
const contactsMock = vi.fn();
const eventsMock = vi.fn();
vi.mock("@/services/socialActions", () => ({
  fetchContactList: (pk: string) => contactsMock(pk),
  getFollowedPubkeys: (list: { tags: string[][] } | null) =>
    new Set(list?.tags.filter((t) => t[0] === "p").map((t) => t[1]) ?? []),
}));
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByAuthors: (...a: unknown[]) => eventsMock(...a),
}));

import { useNetworkReach } from "./useNetworkReach";

function Probe({ me }: { me?: string }) {
  const r = useNetworkReach(me);
  return (
    <div data-testid="probe">
      {r.ready ? "ready" : "loading"}|{[...r.direct].map((p) => p[0]).join("")}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useNetworkReach", () => {
  it("is empty and ready with nobody signed in", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("ready|");
    expect(contactsMock).not.toHaveBeenCalled();
  });

  it("is the viewer's own follows, without fetching their follows' contact lists", async () => {
    contactsMock.mockResolvedValue({
      id: "a".repeat(64),
      kind: 3,
      pubkey: ME,
      tags: [
        ["p", F1],
        ["p", F2],
      ],
      content: "",
      created_at: 1,
    });
    render(<Probe me={ME} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("loading|");
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("ready|12"));
    expect(eventsMock).not.toHaveBeenCalled();
  });
});
