// @vitest-environment jsdom
/**
 * The app page hero (kind 32267 on /e): an app-store presentation — icon,
 * name, summary, Get-it + Source, platform/license chips, screenshot
 * gallery, maintained-signal from the latest Zap Store release, and the
 * full description.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const releaseMock = vi.fn<() => Promise<{ version: string; at: number; notes: string } | null>>(
  () => Promise.resolve(null),
);
vi.mock("@/services/search", () => ({
  fetchLatestRelease: (...args: unknown[]) => releaseMock(...(args as [])),
}));
const openLightboxMock = vi.fn();
vi.mock("@/components/share/Lightbox", () => ({
  useLightbox: () => openLightboxMock,
}));

import { AppHero } from "./AppHero";

function listing(tags: string[][], content = ""): NostrEvent {
  return {
    id: "a".repeat(64),
    kind: 32267,
    pubkey: "b".repeat(64),
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

beforeEach(() => {
  vi.clearAllMocks();
  releaseMock.mockResolvedValue(null);
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
    releaseMock.mockResolvedValue({
      version: "1.0.2133",
      at: Math.floor(Date.now() / 1000) - 86400 * 3,
      notes: "",
    });
    render(<AppHero event={FLOTILLA} />);
    const latest = await screen.findByTestId("app-hero-release");
    expect(latest).toHaveTextContent("1.0.2133");
    // Asked for THIS app by its d identifier and publisher.
    expect(releaseMock).toHaveBeenCalledWith("social.flotilla", "b".repeat(64));
  });

  it("stays quiet about releases when there are none", async () => {
    render(<AppHero event={FLOTILLA} />);
    await Promise.resolve();
    expect(screen.queryByTestId("app-hero-release")).toBeNull();
  });

  it("shows the release's actual notes as a What's-new section", async () => {
    releaseMock.mockResolvedValue({
      version: "1.9.1",
      at: Math.floor(Date.now() / 1000) - 86400 * 2,
      notes: "- Fixed the login crash\n- New dark theme",
    });
    render(<AppHero event={FLOTILLA} />);
    const whatsNew = await screen.findByTestId("app-hero-whats-new");
    expect(whatsNew).toHaveTextContent("What's new");
    expect(whatsNew).toHaveTextContent("Fixed the login crash");
  });

  it("skips What's-new when the release has no notes", async () => {
    releaseMock.mockResolvedValue({
      version: "1.9.1",
      at: Math.floor(Date.now() / 1000) - 86400 * 2,
      notes: "   ",
    });
    render(<AppHero event={FLOTILLA} />);
    await screen.findByTestId("app-hero-release");
    expect(screen.queryByTestId("app-hero-whats-new")).toBeNull();
  });

  it("collapses a long changelog behind Show more", async () => {
    releaseMock.mockResolvedValue({
      version: "2.0",
      at: Math.floor(Date.now() / 1000) - 86400,
      notes: Array.from({ length: 40 }, (_, i) => `* change number ${i}`).join("\n"),
    });
    render(<AppHero event={FLOTILLA} />);
    const toggle = await screen.findByTestId("app-hero-notes-toggle");
    expect(toggle).toHaveTextContent("Show more");
    fireEvent.click(toggle);
    expect(screen.getByTestId("app-hero-notes-toggle")).toHaveTextContent("Show less");
  });

  it("short notes need no toggle", async () => {
    releaseMock.mockResolvedValue({
      version: "2.0",
      at: Math.floor(Date.now() / 1000) - 86400,
      notes: "- One small fix",
    });
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
});
