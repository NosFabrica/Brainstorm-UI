// @vitest-environment jsdom
/**
 * The calendar event page as a proper post (Benjamin: "events should have
 * URLs clickable, images and metadata descriptions render when needed —
 * make it look like a top-notch post"). The action sits with the facts, not
 * under a long description; links in the description are real links with
 * favicons; the first link earns a metadata card when the proxy knows it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));
const unfurlMock = vi.fn<(url: string) => Promise<{ title: string | null; description: string | null; image: string | null; siteName: string | null } | null>>(() => Promise.resolve(null));
vi.mock("@/services/unfurl", () => ({ fetchUnfurl: (url: string) => unfurlMock(url) }));

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
});
