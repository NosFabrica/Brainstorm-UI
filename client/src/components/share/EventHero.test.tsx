// @vitest-environment jsdom
/**
 * The calendar event page as a proper post (Benjamin: "events should have
 * URLs clickable, images and metadata descriptions render when needed —
 * make it look like a top-notch post"). The action sits with the facts, not
 * under a long description; links in the description are real links with
 * favicons; the first link earns a metadata card when the proxy knows it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
const unfurlMock = vi.fn<(url: string) => Promise<{ title: string | null; description: string | null; image: string | null; siteName: string | null } | null>>(() => Promise.resolve(null));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: (url: string) => unfurlMock(url) }));
const profileMapMock = vi.fn<(pks: string[]) => Promise<Map<string, { name?: string; display_name?: string; picture?: string }>>>(() => Promise.resolve(new Map()));
vi.mock("@/services/nostr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/nostr")>()),
  fetchProfileMap: (pks: string[]) => profileMapMock(pks),
}));
const rsvpsMock = vi.fn<(addresses: string[]) => Promise<Map<string, { going: number; faces: string[] }>>>(() => Promise.resolve(new Map()));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchEventRsvps: (addresses: string[]) => rsvpsMock(addresses),
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => 0.7 }));

import { EventHero } from "./EventHero";

const NOW = Math.floor(Date.now() / 1000);
const v4v = {
  id: "1".repeat(64),
  kind: 31923,
  pubkey: "c".repeat(64),
  created_at: NOW - 86_400,
  content: "V4V Chicago is a two-day gathering.\n\nBuy tickets: https://pay.zaprite.com/pl_UNaHgthGQD\n\nhttps://app.cluborange.org/hhxyE09d",
  sig: "",
  tags: [
    ["d", "v4v"],
    ["title", "V4V Chicago 2026"],
    ["start", String(NOW + 10 * 86_400)],
    ["location", "Fork & Coin, 3938 N Central Ave, Chicago, IL"],
    ["image", "https://cdn.example/v4v.jpg"],
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  unfurlMock.mockImplementation(() => Promise.resolve(null));
  profileMapMock.mockResolvedValue(new Map());
  rsvpsMock.mockResolvedValue(new Map());
});

describe("EventHero", () => {
  it("puts the action with the facts, above the description", () => {
    render(<EventHero event={v4v} />);
    const rsvp = screen.getByTestId("event-rsvp");
    const description = screen.getByTestId("event-hero-description");
    expect(rsvp.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("event-hero-image").getAttribute("src")).toBe("https://cdn.example/v4v.jpg");
    expect(screen.getByTestId("event-hero-date")).toBeInTheDocument();
  });

  it("renders the description's URLs as real links, new tab, with the domain", () => {
    render(<EventHero event={v4v} />);
    const description = screen.getByTestId("event-hero-description");
    const links = within(description).getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["https://pay.zaprite.com/pl_UNaHgthGQD", "https://app.cluborange.org/hhxyE09d"]));
    for (const a of links) expect(a.getAttribute("target")).toBe("_blank");
    expect(description).toHaveTextContent("pay.zaprite.com");
  });

  it("the first link earns a metadata card when the proxy knows it", async () => {
    unfurlMock.mockImplementation((url) =>
      Promise.resolve(url.includes("zaprite") ? { title: "V4V Chicago tickets", description: "Two-day pass", image: "https://cdn.example/tickets.jpg", siteName: "Zaprite" } : null),
    );
    render(<EventHero event={v4v} />);
    const card = await screen.findByTestId("link-card");
    expect(card).toHaveTextContent("V4V Chicago tickets");
    expect(unfurlMock).toHaveBeenCalledWith("https://pay.zaprite.com/pl_UNaHgthGQD");
  });

  it("a past event offers the recording, not an RSVP", () => {
    const past = { ...v4v, tags: [...v4v.tags.filter((t) => t[0] !== "start"), ["start", String(NOW - 5 * 86_400)], ["recording", "https://youtu.be/abc12345678"]] };
    render(<EventHero event={past} />);
    expect(screen.queryByTestId("event-rsvp")).toBeNull();
    expect(screen.getByTestId("event-watch-recording").getAttribute("href")).toBe("https://youtu.be/abc12345678");
  });

  // Luma's page: the cover beside the facts, the host named, the date tile
  // with start, end and zone, who is going, and a calendar file of the
  // reader's own — no vendor between them and their calendar.
  it("lays out like Luma: host named, start to end with the zone, guests as faces, and Add to calendar hands over an .ics", async () => {
    profileMapMock.mockImplementation(async (pks) => new Map(pks.map((pk) => [pk, pk === v4v.pubkey ? { name: "v4v", display_name: "V4V Chicago" } : { name: `guest-${pk.slice(0, 2)}` }])));
    const addr = `31923:${v4v.pubkey}:v4v`;
    rsvpsMock.mockResolvedValue(new Map([[addr, { going: 3, faces: ["1".repeat(64), "2".repeat(64), "3".repeat(64)] }]]));
    const timed = { ...v4v, tags: [...v4v.tags, ["end", String(NOW + 10 * 86_400 + 2 * 3600)], ["start_tzid", "America/Chicago"]] };
    const createObjectURL = vi.fn(() => "blob:ics");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: string[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.getAttribute("download") ?? ""); };
    try {
      render(<EventHero event={timed} />);
      expect(await screen.findByTestId("event-hero-host")).toHaveTextContent("V4V Chicago");
      const when = screen.getByTestId("event-hero-when");
      expect(when).toHaveTextContent(/\d{1,2}:\d{2}/); // a start time
      expect(when).toHaveTextContent(/–|to/); // and an end
      expect(when).toHaveTextContent("Chicago");
      const guests = await screen.findByTestId("event-hero-guests");
      expect(guests).toHaveTextContent("3 going");
      expect(guests.querySelectorAll('[data-testid^="event-hero-guest-"]')).toHaveLength(3);
      expect(rsvpsMock).toHaveBeenCalledWith([addr]);
      fireEvent.click(screen.getByTestId("event-hero-ics"));
      expect(createObjectURL).toHaveBeenCalled();
      expect(clicks[0]).toMatch(/\.ics$/);
      expect(clicks[0]).toMatch(/v4v/i);
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});
