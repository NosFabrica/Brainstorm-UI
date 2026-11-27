// @vitest-environment jsdom
/**
 * The All tab's row draws one small square picture. For a video its creator
 * marked sensitive that square is a placeholder: no poster, no first frame.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { signed } from "@/test/signedEvent";

vi.mock("@/services/nostr", async () => ({ ...(await import("@/test/fakeNostr")).nostrReadDefaults }));
vi.mock("@/lib/eventStore", async () => ({
  // lib/eventStore's verified-deletion seam (useStoreEvents reads it): nothing deleted here.
  isDeleted: () => false,
  deletions$: { subscribe: () => ({ unsubscribe: () => {} }) },
  eventStore: { ...(await import("@/test/fakeEventStore")).eventStoreDefaults },
}));

import { AllResultRow } from "./AllResultRow";

const ID = "1".repeat(64);
const short = (tags: string[][]): NostrEvent =>
  ({
    id: ID,
    kind: 34236,
    pubkey: "9".repeat(64),
    created_at: 1_790_000_000,
    sig: "s",
    content: "",
    tags: [["d", "b0f9"], ["title", "Morning at the lake"], ...tags],
  }) as NostrEvent;
const withPoster = [
  "imeta",
  "url https://media.divine.video/b0f9",
  "m video/mp4",
  "image https://media.divine.video/thumb",
];
const noPoster = ["imeta", "url https://media.divine.video/b0f9", "m video/mp4"];

describe("AllResultRow — a video marked sensitive", () => {
  it("shows a placeholder where the poster would be", () => {
    render(<AllResultRow event={short([withPoster, ["content-warning", "nudity"]])} author={null} query="" />);
    const row = screen.getByTestId(`all-row-${ID}`);
    expect(within(row).getByTestId("sensitive-tile")).toHaveTextContent("Sensitive");
    expect(screen.queryByTestId("all-row-thumb")).toBeNull();
    expect(row.querySelector("video")).toBeNull();
    expect(row.querySelector('img[src*="thumb"]')).toBeNull();
    // The row is still the way to the video's page.
    expect(row.getAttribute("href")).toMatch(/^\/e\//);
  });

  it("shows a placeholder where the first frame would be", () => {
    render(<AllResultRow event={short([noPoster, ["l", "violence", "content-warning"]])} author={null} query="" />);
    expect(screen.getByTestId("sensitive-tile")).toBeInTheDocument();
    expect(screen.queryByTestId("all-row-video-thumb")).toBeNull();
  });

  it("leaves an unflagged video's poster as it was", () => {
    render(<AllResultRow event={short([withPoster])} author={null} query="" />);
    expect(screen.queryByTestId("sensitive-tile")).toBeNull();
    expect(screen.getByTestId("all-row-thumb")).toBeInTheDocument();
  });

  // A repost draws the reposted video's picture, so the reposted video's warning decides.
  it("shows a placeholder for a repost of a flagged video", () => {
    // Signed: a repost's JSON is its author's video only under their signature (lib/embeddedEvent).
    const flagged = signed({ kind: 34236, tags: short([withPoster, ["content-warning", "nudity"]]).tags });
    const repost = {
      id: "2".repeat(64),
      kind: 16,
      pubkey: "8".repeat(64),
      created_at: 1_790_000_100,
      sig: "s",
      content: JSON.stringify(flagged),
      tags: [
        ["e", flagged.id],
        ["k", "34236"],
        ["p", flagged.pubkey],
      ],
    } as NostrEvent;
    render(<AllResultRow event={repost} author={null} query="" />);
    const row = screen.getByTestId(`all-row-${"2".repeat(64)}`);
    expect(within(row).getByTestId("sensitive-tile")).toBeInTheDocument();
    expect(screen.queryByTestId("all-row-thumb")).toBeNull();
    expect(row.querySelector("video")).toBeNull();
    expect(row.querySelector('img[src*="thumb"]')).toBeNull();
  });

  it("leaves a repost of an unflagged video's poster as it was", () => {
    const unflagged = signed({ kind: 34236, tags: short([withPoster]).tags });
    const repost = {
      id: "3".repeat(64),
      kind: 16,
      pubkey: "8".repeat(64),
      created_at: 1_790_000_100,
      sig: "s",
      content: JSON.stringify(unflagged),
      tags: [["e", unflagged.id]],
    } as NostrEvent;
    render(<AllResultRow event={repost} author={null} query="" />);
    expect(screen.queryByTestId("sensitive-tile")).toBeNull();
    expect(screen.getByTestId("all-row-thumb")).toBeInTheDocument();
  });
});
// A restored Vine is signed the day it was imported; `published_at` is the day it was posted.
const classicVine = (): NostrEvent =>
  ({
    id: "7".repeat(64),
    kind: 34236,
    pubkey: "9".repeat(64),
    created_at: Math.floor(Date.now() / 1000) - 60,
    sig: "s",
    content: "Vampire Eric",
    tags: [
      ["d", "OaXhLEvJxwA"],
      ["title", "Vampire Eric"],
      [
        "imeta",
        "url https://media.divine.video/9001",
        "m video/mp4",
        "image https://media.divine.video/9001.jpg",
        "dim 480x480",
      ],
      ["published_at", "1410674550"],
      ["platform", "vine"],
      ["l", "vine-archive", "archive.divine.video"],
    ],
  }) as NostrEvent;

describe("AllResultRow — a video's date", () => {
  it("dates a classic Vine by the day it was posted, not the day it was imported", () => {
    render(<AllResultRow event={classicVine()} author={null} query="" />);
    const row = screen.getByTestId(`all-row-${"7".repeat(64)}`);
    expect(row).toHaveTextContent("Sep 2014");
    expect(row).not.toHaveTextContent("1m ago");
  });

  it("leaves every other kind dated by created_at", () => {
    const note = { ...classicVine(), kind: 1 } as NostrEvent;
    render(<AllResultRow event={note} author={null} query="" />);
    const row = screen.getByTestId(`all-row-${"7".repeat(64)}`);
    expect(row).toHaveTextContent("1m ago");
    expect(row).not.toHaveTextContent("2014");
  });
});
