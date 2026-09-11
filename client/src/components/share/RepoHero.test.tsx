// @vitest-environment jsdom
/**
 * The repo page (kind 30617 on /e): name, publisher, description, clone/web
 * links, and the live NIP-34 activity feed (issues + patches referencing the
 * repo address) — what nostrhub shows statically, plus "is anyone working on
 * this?" for real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const activityMock = vi.fn<() => Promise<NostrEvent[]>>(() => Promise.resolve([]));
const countsMock = vi.fn<(address: string) => Promise<{ issues: number; patches: number; contributors: string[]; lastAt: number | null }>>(() =>
  Promise.resolve({ issues: 0, patches: 0, contributors: [], lastAt: null }),
);
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchRepoActivity: (...args: unknown[]) => activityMock(...(args as [])),
  fetchRepoCounts: (address: string) => countsMock(address),
  fetchGitStatuses: (ids: string[]) => statusesMock(ids),
  fetchGitCommentCounts: (ids: string[]) => commentsMock(ids),
  fetchRepoForks: (euc: string, self: string) => forksMock(euc, self),
}));
const forksMock = vi.fn<(euc: string, self: string) => Promise<NostrEvent[]>>(() => Promise.resolve([]));
const statusesMock = vi.fn<(ids: string[]) => Promise<Map<string, { kind: number; at: number }>>>(() => Promise.resolve(new Map()));
const commentsMock = vi.fn<(ids: string[]) => Promise<Map<string, number>>>(() => Promise.resolve(new Map()));
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
  countsMock.mockResolvedValue({ issues: 0, patches: 0, contributors: [], lastAt: null });
  statusesMock.mockResolvedValue(new Map());
  commentsMock.mockResolvedValue(new Map());
  forksMock.mockResolvedValue([]);
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

  it("activity lists people's issues before agents', and marks the agents'", async () => {
    const item = (id: string, subject: string, at: number, agent?: string): NostrEvent =>
      ({ id: id.padEnd(64, "0"), kind: 1621, pubkey: "5".repeat(64), created_at: at, content: subject, sig: "", tags: [["a", `30617:${MAINTAINER}:ngit`], ["subject", subject], ...(agent ? [["buzz-origin-agent", agent]] : [])] }) as NostrEvent;
    activityMock.mockResolvedValue([item("a1", "Prove warm coverage", 300, "Sentinel"), item("h1", "Windows: screen share fails", 200), item("a2", "Reuse condensed rows", 100, "PM")]);
    render(<RepoHero event={NGIT} />);
    const activity = await screen.findByTestId("repo-hero-activity");
    const order = [...activity.querySelectorAll('[data-testid^="repo-activity-"]')].filter((el) => !/agent/.test(el.getAttribute("data-testid") ?? "")).map((el) => el.getAttribute("data-testid"));
    expect(order[0]).toBe("repo-activity-" + "h1".padEnd(64, "0"));
    expect(activity.querySelector('[data-testid="repo-activity-agent-' + "a1".padEnd(64, "0") + '"]')).not.toBeNull();
    expect(activity.querySelector('[data-testid="repo-activity-agent-' + "h1".padEnd(64, "0") + '"]')).toBeNull();
  });

  // The page's dead corner — an 80px folder glyph — becomes the answer to
  // "is this alive, and who is behind it": the numbers the card already has.
  it("shows the repo's numbers — issues, patches, ringed contributors, last activity — in place of the glyph", async () => {
    const now = Math.floor(Date.now() / 1000);
    countsMock.mockResolvedValue({ issues: 12, patches: 3, contributors: ["1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64)], lastAt: now - 3 * 3600 });
    render(<RepoHero event={NGIT} />);
    const stats = await screen.findByTestId("repo-hero-stats");
    expect(countsMock).toHaveBeenCalledWith(`30617:${MAINTAINER}:ngit`);
    // Each cell stacks its number over its word.
    expect(stats).toHaveTextContent(/12\s*issues/);
    expect(stats).toHaveTextContent(/3\s*patches/);
    expect(stats).toHaveTextContent(/4\s*contributors/);
    expect(stats.querySelectorAll('[data-testid^="repo-hero-contributor-"]')).toHaveLength(3);
    expect(stats).toHaveTextContent(/active\s*today/);
    expect(screen.queryByTestId("repo-hero-glyph")).toBeNull();
  });

  it("a repo nobody has touched keeps its glyph and shows no numbers", async () => {
    render(<RepoHero event={NGIT} />);
    expect(await screen.findByTestId("repo-hero-glyph")).toBeInTheDocument();
    expect(screen.queryByTestId("repo-hero-stats")).toBeNull();
  });

  it("activity rows say what became of each item and how much talk it drew, and fold past eight", async () => {
    const item = (n: number, kind: number): NostrEvent =>
      ({ id: String(n).padStart(2, "0").padEnd(64, "0"), kind, pubkey: "5".repeat(64), created_at: 1000 - n, content: `item ${n}`, sig: "", tags: [["a", `30617:${MAINTAINER}:ngit`], ["subject", `item ${n}`]] }) as NostrEvent;
    const items = Array.from({ length: 10 }, (_, i) => item(i + 1, i % 2 ? 1621 : 1617));
    activityMock.mockResolvedValue(items);
    statusesMock.mockResolvedValue(new Map([[items[0].id, { kind: 1631, at: 5 }], [items[1].id, { kind: 1632, at: 5 }]]));
    commentsMock.mockResolvedValue(new Map([[items[1].id, 4]]));
    render(<RepoHero event={NGIT} />);
    const activity = await screen.findByTestId("repo-hero-activity");
    expect(await within(activity).findByTestId(`repo-activity-state-${items[0].id}`)).toHaveTextContent("Merged");
    expect(within(activity).getByTestId(`repo-activity-state-${items[1].id}`)).toHaveTextContent("Closed");
    expect(within(activity).getByTestId(`repo-activity-state-${items[2].id}`)).toHaveTextContent("Open");
    expect(within(activity).getByTestId(`repo-activity-comments-${items[1].id}`)).toHaveTextContent("4");
    expect(statusesMock).toHaveBeenCalledWith(expect.arrayContaining(items.map((i) => i.id)));
    // Eight rows, then the rest on request.
    expect(activity.querySelectorAll('[data-testid^="repo-activity-"]:not([data-testid*="state"]):not([data-testid*="comments"]):not([data-testid*="agent"]):not([data-testid="repo-activity-more"])')).toHaveLength(8);
    fireEvent.click(within(activity).getByTestId("repo-activity-more"));
    expect(activity.querySelectorAll('[data-testid^="repo-activity-"]:not([data-testid*="state"]):not([data-testid*="comments"]):not([data-testid*="agent"])')).toHaveLength(10);
  });

  // Where it came from and where it went: gitnostr's announcement names the
  // GitHub original it was forked from and its earliest commit, which other
  // Nostr announcements share.
  it("names the original it was forked from, and how many Nostr forks share its lineage", async () => {
    const euc = "2cfca0e64c2270bf7f1086c66db810c453fea187";
    const GITNOSTR = { ...NGIT, tags: [["d", "gitnostr"], ["name", "gitnostr"], ["r", euc, "euc"], ["forkedFrom", "https://github.com/spearson78/gitnostr"], ["source", "https://github.com/arbadacarbaYK/gitnostr"]] } as NostrEvent;
    forksMock.mockResolvedValue([
      { id: "f1".padEnd(64, "0"), kind: 30617, pubkey: "c".repeat(64), tags: [["d", "gitnostr"], ["r", euc, "euc"]], content: "", created_at: 1, sig: "s" } as NostrEvent,
      { id: "f2".padEnd(64, "0"), kind: 30617, pubkey: "d".repeat(64), tags: [["d", "gitnostr"], ["r", euc, "euc"]], content: "", created_at: 1, sig: "s" } as NostrEvent,
    ]);
    render(<RepoHero event={GITNOSTR} />);
    const from = screen.getByTestId("repo-hero-fork-of");
    expect(from).toHaveTextContent("Fork of spearson78/gitnostr");
    expect(from.querySelector("a")?.getAttribute("href")).toBe("https://github.com/spearson78/gitnostr");
    const forks = await screen.findByTestId("repo-hero-forks");
    expect(forks).toHaveTextContent("2 forks on Nostr");
    expect(forks.getAttribute("href")).toBe("/?q=gitnostr&t=repos");
    expect(forksMock).toHaveBeenCalledWith(euc, `30617:${MAINTAINER}:gitnostr`);
  });

  it("offers the source mirror beside Browse code and the clone URL", () => {
    const WITH_SOURCE = { ...NGIT, tags: [...NGIT.tags, ["source", "https://github.com/arbadacarbaYK/gitnostr"]] } as NostrEvent;
    render(<RepoHero event={WITH_SOURCE} />);
    const source = screen.getByTestId("repo-hero-source");
    expect(source.getAttribute("href")).toBe("https://github.com/arbadacarbaYK/gitnostr");
    expect(source).toHaveTextContent("Source");
    expect(source).toHaveTextContent("github.com");
  });

  it("a repo with no lineage and no forks says nothing about either", async () => {
    render(<RepoHero event={NGIT} />);
    await screen.findByTestId("repo-hero-glyph");
    expect(screen.queryByTestId("repo-hero-fork-of")).toBeNull();
    expect(screen.queryByTestId("repo-hero-forks")).toBeNull();
    expect(forksMock).not.toHaveBeenCalled();
  });
});
