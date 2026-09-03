// @vitest-environment jsdom
/**
 * The repo page (kind 30617 on /e): name, publisher, description, clone/web
 * links, and the live NIP-34 activity feed (issues + patches referencing the
 * repo address) — what nostrhub shows statically, plus "is anyone working on
 * this?" for real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const activityMock = vi.fn<() => Promise<NostrEvent[]>>(() => Promise.resolve([]));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchRepoActivity: (...args: unknown[]) => activityMock(...(args as [])),
}));
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => () => 0.7,
}));
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: vi.fn(() => Promise.resolve(new Map())),
}));
const knownProfiles = new Map<string, NostrEvent>();
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (_kind: number, pubkey: string) => knownProfiles.get(pubkey),
    getEvent: () => undefined,
    add: (event: NostrEvent) => event,
  },
}));

import { RepoHero } from "./RepoHero";

const MAINTAINER = "b".repeat(64);

const NGIT: NostrEvent = {
  id: "a".repeat(64),
  kind: 30617,
  pubkey: MAINTAINER,
  tags: [
    ["d", "ngit"],
    ["name", "ngit"],
    ["description", "Nostr-permissioned git collaboration."],
    ["clone", "https://relay.ngit.dev/npub1rmz/ngit.git"],
    ["web", "https://gitworkshop.dev/ngit"],
  ],
  content: "",
  created_at: 1_760_000_000,
  sig: "s",
} as NostrEvent;

beforeEach(() => {
  vi.clearAllMocks();
  knownProfiles.clear();
  activityMock.mockResolvedValue([]);
});

describe("RepoHero", () => {
  it("presents the repo: name, description, web + clone, publisher", () => {
    knownProfiles.set(MAINTAINER, {
      id: "p".repeat(64), kind: 0, pubkey: MAINTAINER, tags: [],
      content: JSON.stringify({ name: "DanConwayDev" }), created_at: 1, sig: "s",
    } as NostrEvent);
    render(<RepoHero event={NGIT} />);

    expect(screen.getByText("ngit")).toBeInTheDocument();
    expect(screen.getByText(/Nostr-permissioned git/)).toBeInTheDocument();
    expect(screen.getByTestId("repo-hero-web").getAttribute("href")).toBe("https://gitworkshop.dev/ngit");
    expect(screen.getByTestId("repo-hero-clone")).toHaveTextContent("relay.ngit.dev");
    expect(screen.getByTestId("repo-hero-publisher")).toHaveTextContent("DanConwayDev");
  });

  it("shows the repo's live issues and patches, labeled and linked", async () => {
    activityMock.mockResolvedValue([
      {
        id: "1".repeat(64), kind: 1621, pubkey: "c".repeat(64),
        tags: [["subject", "e2e specs broken on wizard provisioning"]],
        content: "", created_at: Math.floor(Date.now() / 1000) - 3600, sig: "s",
      } as NostrEvent,
      {
        id: "2".repeat(64), kind: 1617, pubkey: "d".repeat(64),
        tags: [["subject", "fix: clone over https"]],
        content: "", created_at: Math.floor(Date.now() / 1000) - 86400, sig: "s",
      } as NostrEvent,
    ]);
    render(<RepoHero event={NGIT} />);
    const activity = await screen.findByTestId("repo-hero-activity");
    // Asked with the repo's NIP-34 address.
    expect(activityMock).toHaveBeenCalledWith(`30617:${MAINTAINER}:ngit`);
    expect(activity).toHaveTextContent("e2e specs broken on wizard provisioning");
    expect(activity).toHaveTextContent("Issue");
    expect(activity).toHaveTextContent("Patch");
    const row = screen.getByTestId(`repo-activity-${"1".repeat(64)}`);
    expect(row.getAttribute("href")).toMatch(/^\/e\//);
  });

  it("stays quiet when the repo has no activity", async () => {
    render(<RepoHero event={NGIT} />);
    await Promise.resolve();
    expect(screen.queryByTestId("repo-hero-activity")).toBeNull();
  });
});
