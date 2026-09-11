// @vitest-environment jsdom
/**
 * "I'm going" — the one thing you'd do next with an upcoming event, kept on
 * Nostr. Publishes a NIP-52 RSVP under your key, reads it back on later
 * visits ("Going"), and a second tap withdraws it. Signed out it is the
 * sign-in door. The event's own host never sees it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const ME = "e".repeat(64);
const HOST = "f".repeat(64);
let viewer: { pubkey: string } | null = { pubkey: ME };
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => viewer }));
const fetchMyRsvpMock = vi.fn<() => Promise<{ id: string; d: string; status: string } | null>>(() => Promise.resolve(null));
const publishMock = vi.fn(async () => ({ success: true, event: { id: "rsvp-new", tags: [["d", "dnew"]] } }));
const withdrawMock = vi.fn(async () => ({ success: true }));
vi.mock("@/services/rsvp", () => ({
  fetchMyRsvp: () => fetchMyRsvpMock(),
  publishRsvp: () => publishMock(),
  withdrawRsvp: () => withdrawMock(),
  forgetMyRsvp: () => {},
  __resetRsvpCache: () => {},
}));

import { RsvpButton } from "./RsvpButton";

const meetup = { id: "1".repeat(64), kind: 31923, pubkey: HOST, created_at: 1, content: "", sig: "", tags: [["d", "x"], ["title", "Meetup"], ["start", "1760400000"]] };

beforeEach(() => {
  vi.clearAllMocks();
  viewer = { pubkey: ME };
  fetchMyRsvpMock.mockImplementation(() => Promise.resolve(null));
  window.history.replaceState({}, "", "/?q=chicago");
});

describe("RsvpButton", () => {
  it("publishes an RSVP on tap and flips to Going; a second tap withdraws it", async () => {
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <RsvpButton event={meetup} />
      </div>,
    );
    const btn = await screen.findByTestId("event-rsvp");
    expect(btn).toHaveTextContent(/I'm going/);
    fireEvent.click(btn);
    expect(onRow).not.toHaveBeenCalled(); // the tap is for the RSVP, not the row
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/^Going/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("event-rsvp"));
    expect(withdrawMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/I'm going/)).toBeInTheDocument();
  });

  it("remembers: an RSVP already on the relays shows as Going without a tap", async () => {
    fetchMyRsvpMock.mockResolvedValue({ id: "r1", d: "d1", status: "accepted" });
    render(<RsvpButton event={meetup} />);
    expect(await screen.findByText(/^Going/)).toBeInTheDocument();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("signed out, it is the sign-in door", async () => {
    viewer = null;
    render(<RsvpButton event={meetup} />);
    fireEvent.click(await screen.findByTestId("event-rsvp"));
    expect(window.location.pathname).toBe("/login");
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("the host sees nothing — you don't RSVP to your own event", () => {
    viewer = { pubkey: HOST };
    render(<RsvpButton event={meetup} />);
    expect(screen.queryByTestId("event-rsvp")).toBeNull();
  });
});
