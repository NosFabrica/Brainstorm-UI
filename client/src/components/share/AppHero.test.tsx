// @vitest-environment jsdom
/**
 * The app page hero (kind 32267 on /e): an app-store presentation — icon,
 * name, summary, Get-it + Source, platform/license chips, publisher row,
 * screenshot gallery (tap to zoom), What's-new from the latest Zap Store
 * release, version history, and the full description.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";

type Release = { version: string; at: number; notes: string };
const releasesMock = vi.fn<() => Promise<Release[]>>(() => Promise.resolve([]));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchReleases: (...args: unknown[]) => releasesMock(...(args as [])),
}));
const openLightboxMock = vi.fn();
vi.mock("@/components/share/Lightbox", () => ({
  useLightbox: () => openLightboxMock,
}));
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => () => 0.7,
}));
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: vi.fn(() => Promise.resolve(new Map())),
}));
// The real store verifies signatures (and jsdom's TextEncoder trips @noble),
// so known-profile lookups are faked per test.
const knownProfiles = new Map<string, NostrEvent>();
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (_kind: number, pubkey: string) => knownProfiles.get(pubkey),
    getEvent: () => undefined,
    add: (event: NostrEvent) => event,
  },
}));

import { AppHero } from "./AppHero";

const PUBLISHER = "b".repeat(64);

function listing(tags: string[][], content = ""): NostrEvent {
  return {
    id: "a".repeat(64),
    kind: 32267,
    pubkey: PUBLISHER,
    tags,
    content,
    created_at: 1_760_000_000,
    sig: "s",
  } as NostrEvent;
}

const FLOTILLA = listing(
  [
    ["d", "social.flotilla"],
    ["name", "Flotilla"],
    ["summary", "Self-hosted community chat and threads built on the nostr protocol."],
    ["icon", "https://cdn.zapstore.dev/icon.png"],
    ["image", "https://cdn.zapstore.dev/shot1.png"],
    ["image", "https://cdn.zapstore.dev/shot2.png"],
    ["url", "https://flotilla.social"],
    ["repository", "https://github.com/coracle-social/flotilla"],
    ["f", "android-arm64-v8a"],
    ["license", "MIT"],
  ],
  "Flotilla is a full community platform.\n\nRooms, threads, and more.",
);

const rel = (version: string, daysAgo: number, notes = ""): Release => ({
  version,
  at: Math.floor(Date.now() / 1000) - 86400 * daysAgo,
  notes,
});

beforeEach(() => {
  vi.clearAllMocks();
  knownProfiles.clear();
  releasesMock.mockResolvedValue([]);
});

describe("AppHero", () => {
  it("presents the listing app-store style: icon, name, actions, chips, shots, description", () => {
    render(<AppHero event={FLOTILLA} />);

    expect(screen.getByText("Flotilla")).toBeInTheDocument();
    expect(screen.getByText(/Self-hosted community chat/)).toBeInTheDocument();
    expect((screen.getByTestId("app-hero-icon") as HTMLImageElement).src).toContain("icon.png");

    expect(screen.getByTestId("app-hero-get").getAttribute("href")).toBe("https://flotilla.social");
    expect(screen.getByTestId("app-hero-source").getAttribute("href")).toContain("github.com/coracle-social");

    expect(screen.getByText("Android")).toBeInTheDocument();
    expect(screen.getByText("MIT")).toBeInTheDocument();

    const shots = screen.getAllByTestId(/^app-shot-/);
    expect(shots).toHaveLength(2);

    expect(screen.getByText(/full community platform/)).toBeInTheDocument();
  });

  it("shows the latest release as the maintained signal", async () => {
    releasesMock.mockResolvedValue([rel("1.0.2133", 3)]);
    render(<AppHero event={FLOTILLA} />);
    const latest = await screen.findByTestId("app-hero-release");
    expect(latest).toHaveTextContent("1.0.2133");
    // Asked for THIS app by its d identifier and publisher.
    expect(releasesMock).toHaveBeenCalledWith("social.flotilla", PUBLISHER);
  });

  it("stays quiet about releases when there are none", async () => {
    render(<AppHero event={FLOTILLA} />);
    await Promise.resolve();
    expect(screen.queryByTestId("app-hero-release")).toBeNull();
  });

  it("shows the release's actual notes as a What's-new section", async () => {
    releasesMock.mockResolvedValue([rel("1.9.1", 2, "- Fixed the login crash\n- New dark theme")]);
    render(<AppHero event={FLOTILLA} />);
    const whatsNew = await screen.findByTestId("app-hero-whats-new");
    expect(whatsNew).toHaveTextContent("What's new");
    expect(whatsNew).toHaveTextContent("Fixed the login crash");
  });

  it("skips What's-new when the release has no notes", async () => {
    releasesMock.mockResolvedValue([rel("1.9.1", 2, "   ")]);
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-release");
    expect(screen.queryByTestId("app-hero-whats-new")).toBeNull();
  });

  it("collapses a long changelog behind Show more", async () => {
    releasesMock.mockResolvedValue([
      rel("2.0", 1, Array.from({ length: 40 }, (_, i) => `* change number ${i}`).join("\n")),
    ]);
    render(<AppHero event={FLOTILLA} />);
    const toggle = await screen.findByTestId("app-hero-notes-toggle");
    expect(toggle).toHaveTextContent("Show more");
    fireEvent.click(toggle);
    expect(screen.getByTestId("app-hero-notes-toggle")).toHaveTextContent("Show less");
  });

  it("short notes need no toggle", async () => {
    releasesMock.mockResolvedValue([rel("2.0", 1, "- One small fix")]);
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-whats-new");
    expect(screen.queryByTestId("app-hero-notes-toggle")).toBeNull();
  });

  it("opens the lightbox on the tapped screenshot", () => {
    render(<AppHero event={FLOTILLA} />);
    fireEvent.click(screen.getByTestId("app-shot-1"));
    expect(openLightboxMock).toHaveBeenCalledWith(
      ["https://cdn.zapstore.dev/shot1.png", "https://cdn.zapstore.dev/shot2.png"],
      1,
    );
  });

  it("renders the changelog rich: headings, PR chips, nostr mentions as people", async () => {
    const friend = "c".repeat(64);
    const friendNpub = nip19.npubEncode(friend);
    releasesMock.mockResolvedValue([
      rel(
        "1.14.0",
        2,
        [
          "## What's Changed",
          "* Fix a fatal crash by @davotoula in https://github.com/vitorpamplona/amethyst/pull/3796",
          `* Thanks nostr:${friendNpub} for the report`,
        ].join("\n"),
      ),
    ]);
    render(<AppHero event={FLOTILLA} />);
    const whatsNew = await screen.findByTestId("app-hero-whats-new");

    // The markdown heading renders as a heading, not literal ##.
    expect(whatsNew).not.toHaveTextContent("##");
    expect(whatsNew).toHaveTextContent("What's Changed");

    // GitHub PR URLs become compact clickable chips.
    const pr = screen.getByRole("link", { name: /#3796/ });
    expect(pr.getAttribute("href")).toBe("https://github.com/vitorpamplona/amethyst/pull/3796");

    // nostr mentions render as the person, linked to their profile.
    const mention = screen.getByTestId("mention-chip");
    expect(mention.getAttribute("href")).toBe(`/p/${friendNpub}`);

    // GitHub handles get acknowledged (styled), still plain text.
    expect(whatsNew).toHaveTextContent("@davotoula");
  });

  it("names the publisher and links to their profile", () => {
    knownProfiles.set(PUBLISHER, {
      id: "p".repeat(64),
      kind: 0,
      pubkey: PUBLISHER,
      tags: [],
      content: JSON.stringify({ name: "Zap Store", picture: "https://cdn.zapstore.dev/pub.png" }),
      created_at: 1,
      sig: "s",
    } as NostrEvent);
    render(<AppHero event={FLOTILLA} />);
    const row = screen.getByTestId("app-hero-publisher");
    expect(row).toHaveTextContent("Zap Store");
    expect(row.getAttribute("href")).toBe(`/p/${nip19.npubEncode(PUBLISHER)}`);
  });

  it("lists older versions as history, newest release excluded", async () => {
    releasesMock.mockResolvedValue([rel("1.9.1", 2), rel("1.9.0", 20), rel("1.8.0", 60)]);
    render(<AppHero event={FLOTILLA} />);
    const history = await screen.findByTestId("app-hero-history");
    expect(history).toHaveTextContent("1.9.0");
    expect(history).toHaveTextContent("1.8.0");
    // 1.9.1 is the What's-new release, not history.
    expect(history).not.toHaveTextContent("1.9.1");
  });

  it("a single release means no history section", async () => {
    releasesMock.mockResolvedValue([rel("1.9.1", 2)]);
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-release");
    expect(screen.queryByTestId("app-hero-history")).toBeNull();
  });
});
