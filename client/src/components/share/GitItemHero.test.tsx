// @vitest-environment jsdom
/**
 * An issue, patch or pull request page, as a reader wants it: a title, what
 * became of it, which repo (linked), who filed it, how much talk it drew —
 * then the body as it was meant to be read: markdown rendered, a patch shown
 * as a patch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";

const statusesMock = vi.fn<(ids: string[]) => Promise<Map<string, { kind: number; at: number }>>>(() => Promise.resolve(new Map()));
const commentsMock = vi.fn<(ids: string[]) => Promise<Map<string, number>>>(() => Promise.resolve(new Map()));
const repoMock = vi.fn<(address: string) => Promise<NostrEvent | null>>(() => Promise.resolve(null));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchGitStatuses: (ids: string[]) => statusesMock(ids),
  fetchGitCommentCounts: (ids: string[]) => commentsMock(ids),
  fetchRepoByAddress: (address: string) => repoMock(address),
}));

import { GitItemHero } from "./GitItemHero";

const SELLER = "9".repeat(64);
const REPO_ADDR = `30617:${SELLER}:armada`;
const REPO = { id: "r".repeat(64), kind: 30617, pubkey: SELLER, created_at: 1, content: "", sig: "", tags: [["d", "armada"], ["name", "armada"]] } as NostrEvent;

describe("GitItemHero", () => {
  beforeEach(() => {
    statusesMock.mockReset();
    commentsMock.mockReset();
    repoMock.mockReset();
    statusesMock.mockResolvedValue(new Map());
    commentsMock.mockResolvedValue(new Map());
    repoMock.mockResolvedValue(REPO);
  });

  it("an issue: title, state, linked repo, labels, agent, comments — and its markdown rendered", async () => {
    const issue = { id: "1".repeat(64), kind: 1621, pubkey: "a".repeat(64), created_at: 1, content: "## Report\n\nA user on **Windows 10** cannot share.", tags: [["a", REPO_ADDR], ["subject", "Windows: screen share fails"], ["t", "bug"], ["t", "android"], ["buzz-origin-agent", "Sentinel"]] };
    statusesMock.mockResolvedValue(new Map([[issue.id, { kind: 1632, at: 5 }]]));
    commentsMock.mockResolvedValue(new Map([[issue.id, 4]]));
    render(<GitItemHero event={issue} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Windows: screen share fails");
    expect(await screen.findByTestId("git-status-state")).toHaveTextContent("Closed");
    const repo = await screen.findByTestId("git-status-repo");
    expect(repo).toHaveTextContent("armada");
    expect(repo.closest("a")?.getAttribute("href")).toMatch(/^\/e\//);
    expect(repoMock).toHaveBeenCalledWith(REPO_ADDR);
    expect(screen.getByTestId("git-item-labels")).toHaveTextContent("bug");
    expect(screen.getByTestId("git-item-agent").getAttribute("title")).toMatch(/Sentinel/);
    expect(await screen.findByTestId("git-item-comments")).toHaveTextContent("4 comments");
    const body = screen.getByTestId("git-item-body");
    expect(within(body).getByRole("heading", { level: 2 })).toHaveTextContent("Report");
    expect(body.querySelector("strong")).toHaveTextContent("Windows 10");
    expect(body).not.toHaveTextContent("##");
  });

  it("a patch: titled from its text, author and commit shown, the diff as a diff with a change summary", async () => {
    const content = [
      "From e7d5515e41b8a9089d229af9a2cf36d373cb0ce7 Mon Sep 17 00:00:00 2001",
      "From: OpenClaw Codex <codex@openclaw.local>",
      "Date: Fri, 4 Sep 2026 19:42:56 -0700",
      "Subject: [PATCH] Trust proxy headers for NIP-98",
      "",
      "Honour X-Forwarded-* behind TLS.",
      "---",
      " 2 files changed, 3 insertions(+), 1 deletion(-)",
      "",
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -41,6 +41,7 @@",
      " | `ASTILLERO_CONFIG` |",
      "+| `TRUST_PROXY` |",
      "diff --git a/cmd/main.go b/cmd/main.go",
      "--- a/cmd/main.go",
      "+++ b/cmd/main.go",
      "@@ -1,3 +1,5 @@",
      "-old := false",
      "+trust := cfg.TrustProxy",
      "+_ = trust",
    ].join("\n");
    const patch = { id: "2".repeat(64), kind: 1617, pubkey: "b".repeat(64), created_at: 1, content, tags: [["a", REPO_ADDR], ["commit", "e7d5515e41b8a9089d229af9a2cf36d373cb0ce7"]] };
    render(<GitItemHero event={patch} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Trust proxy headers for NIP-98");
    expect(screen.getByTestId("git-patch-meta")).toHaveTextContent("OpenClaw Codex");
    expect(screen.getByTestId("git-patch-meta")).toHaveTextContent("e7d5515");
    expect(screen.getByTestId("git-patch-message")).toHaveTextContent("Honour X-Forwarded-* behind TLS.");
    expect(screen.getByTestId("git-patch-summary")).toHaveTextContent("2 files changed, +3 −1");
    const diff = screen.getByTestId("git-patch-diff");
    expect(diff.querySelectorAll('[data-line="added"]')).toHaveLength(3);
    expect(diff.querySelectorAll('[data-line="removed"]')).toHaveLength(1);
    expect(diff).toHaveTextContent("diff --git a/README.md b/README.md");
    // The mail headers are not shown as prose.
    expect(screen.queryByText(/Mon Sep 17 00:00:00 2001/)).toBeNull();
  });

  it("a pull request: branch, commit count and a clone button, description rendered", async () => {
    const pr = { id: "3".repeat(64), kind: 1618, pubkey: "c".repeat(64), created_at: 1, content: "Fixes a stuck warning.", tags: [["a", REPO_ADDR], ["subject", "fix(git-pool): recompute stale warning"], ["branch-name", "fix-stale-warning"], ["target-branch", "main"], ["c", "1".repeat(40)], ["c", "2".repeat(40)], ["clone", "https://gitnostr.com/npub15qy/gitworkshop.git"]] };
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<GitItemHero event={pr} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("fix(git-pool): recompute stale warning");
    const facts = screen.getByTestId("git-pr-facts");
    expect(facts).toHaveTextContent("fix-stale-warning");
    expect(facts).toHaveTextContent("main");
    expect(facts).toHaveTextContent("2 commits");
    fireEvent.click(screen.getByTestId("git-pr-clone"));
    expect(writeText).toHaveBeenCalledWith("https://gitnostr.com/npub15qy/gitworkshop.git");
    expect(screen.getByTestId("git-item-body")).toHaveTextContent("Fixes a stuck warning.");
  });

  // Bug reports lead with screenshots as bare URLs. A reader wants the
  // picture, not the address.
  it("a bare image URL in an issue body shows as the image", async () => {
    const issue = { id: "5".repeat(64), kind: 1621, pubkey: "a".repeat(64), created_at: 1, content: "https://blossom.ditto.pub/4f18c2dd.webp\n\nArmada never receives relay lists. See https://example.org/docs for context.", tags: [["a", REPO_ADDR], ["subject", "relay lists"]] };
    render(<GitItemHero event={issue} />);
    const body = screen.getByTestId("git-item-body");
    const img = body.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://blossom.ditto.pub/4f18c2dd.webp");
    expect(body).not.toHaveTextContent("blossom.ditto.pub/4f18c2dd.webp");
    // An ordinary link stays a link.
    const link = [...body.querySelectorAll("a")].find((a) => a.getAttribute("href") === "https://example.org/docs");
    expect(link).toBeTruthy();
  });

  it("an issue nobody has touched is open, with the repo named even before it resolves", async () => {
    repoMock.mockResolvedValue(null);
    const issue = { id: "4".repeat(64), kind: 1621, pubkey: "a".repeat(64), created_at: 1, content: "plain words", tags: [["a", REPO_ADDR]] };
    render(<GitItemHero event={issue} />);
    expect(await screen.findByTestId("git-status-state")).toHaveTextContent("Open");
    expect(screen.getByTestId("git-status-repo")).toHaveTextContent("armada");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("plain words");
  });
});
