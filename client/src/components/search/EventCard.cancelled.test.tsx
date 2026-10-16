// @vitest-environment jsdom
/**
 * A cancelled event in a list (a `status` tag of `cancelled`, the form proposed for NIP-52): the
 * card says Cancelled and offers no RSVP. The Events tab's compact row says it too.
 */
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/services/nostr", async () => (await import("@/test/fakeNostr")).nostrReadDefaults);
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));

import { EventCard } from "./cards";
import { EventRow } from "./EventRow";

const NOW = Math.floor(Date.now() / 1000);
const meetup = (title: string, status?: string): NostrEvent =>
  ({
    id: "1".repeat(64),
    kind: 31923,
    pubkey: "a".repeat(64),
    created_at: NOW - 600,
    content: "",
    sig: "",
    tags: [
      ["d", "sdpy"],
      ["title", title],
      ["start", String(NOW + 3 * 86_400)],
      ...(status ? [["status", status]] : []),
    ],
  }) as NostrEvent;

describe("a cancelled event in a list", () => {
  it("the card says Cancelled and offers no RSVP", () => {
    renderWithProviders(<EventCard event={meetup("SDPy Monthly Meetup", "cancelled")} author={null} />);
    expect(screen.getByTestId(`event-cancelled-${"1".repeat(64)}`)).toHaveTextContent("Cancelled");
    expect(screen.getByText("SDPy Monthly Meetup")).toBeInTheDocument();
    expect(screen.queryByTestId("event-rsvp")).toBeNull();
  });

  it("an event going ahead has no mark and keeps its RSVP", () => {
    renderWithProviders(<EventCard event={meetup("SDPy Monthly Meetup")} author={null} />);
    expect(screen.queryByTestId(`event-cancelled-${"1".repeat(64)}`)).toBeNull();
    expect(screen.getByTestId("event-rsvp")).toBeInTheDocument();
  });

  it("the Events tab's row says Cancelled before the time", () => {
    renderWithProviders(
      <EventRow hit={{ event: meetup("SDPy Monthly Meetup", "cancelled"), author: null, rank: null }} />,
    );
    expect(screen.getByText(/^Cancelled ·/)).toBeInTheDocument();
    expect(screen.getByText("SDPy Monthly Meetup")).toBeInTheDocument();
  });
});
