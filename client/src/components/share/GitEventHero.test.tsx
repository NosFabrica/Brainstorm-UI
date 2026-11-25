// @vitest-environment jsdom
/**
 * The NIP-34 events around an item had no page: a status, a repository state
 * and a legacy reply opened as the structural tag table. Each now says what
 * it is — a status the state it set and its item as a card, a state its
 * branches, tags and HEAD, a reply its thread and its words.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { MinimalEvent } from "@/lib/noteRefs";

const byId = new Map<string, MinimalEvent>();
const byAddress = new Map<string, MinimalEvent>();
vi.mock("@/services/nostr", async () => ({
  ...(await import("@/test/fakeNostr")).nostrReadDefaults,
  fetchEventsByIds: async (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
  fetchAddressableEvents: async (refs: { kind: number; pubkey: string; identifier: string }[]) =>
    new Map(
      refs.flatMap((r) => {
        const key = `${r.kind}:${r.pubkey}:${r.identifier}`;
        return byAddress.has(key) ? [[key, byAddress.get(key)!]] : [];
      }),
    ),
}));
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchRepoCounts: async () => ({ issues: 0, patches: 0, contributors: [], lastAt: null }),
}));
vi.mock("@/hooks/useAuthorScores", () => ({ useAuthorScores: () => () => null }));
vi.mock("@/hooks/useNip05", () => ({ useNip05: () => "none" }));

import { GitReplyHero, GitStatusHero, RepoStateHero } from "./GitEventHero";

const OWNER = "a".repeat(64);
const AUTHOR = "b".repeat(64);
const STRANGER = "c".repeat(64);
let n = 100;
const ev = (kind: number, tags: string[][], content = "", pubkey = OWNER): MinimalEvent => ({
  id: (++n).toString(16).padStart(64, "0"),
  kind,
  pubkey,
  created_at: 1_790_000_000,
  tags,
  content,
});
const repo = ev(30617, [
  ["d", "ngit"],
  ["name", "ngit"],
  ["maintainers", OWNER],
]);

beforeEach(() => {
  byId.clear();
  byAddress.clear();
  byAddress.set(`30617:${OWNER}:ngit`, repo);
});

describe("GitStatusHero", () => {
  it("says what a 1631 set on a pull request — merged — with the PR as its card, the repo and the merge commit", async () => {
    const pr = ev(
      1618,
      [
        ["a", `30617:${OWNER}:ngit`],
        ["subject", "Add a status page"],
      ],
      "",
      AUTHOR,
    );
    byId.set(pr.id, pr);
    renderWithProviders(
      <GitStatusHero
        event={ev(
          1631,
          [
            ["e", pr.id, "", "root"],
            ["a", `30617:${OWNER}:ngit`],
            ["merge-commit", "abcdef1234567"],
          ],
          "Thanks — **merged**.",
        )}
      />,
    );
    expect(await screen.findByTestId("git-status-title")).toHaveTextContent("Merged: Add a status page");
    expect(screen.getByTestId("git-status-pill")).toHaveTextContent("Merged");
    expect(screen.getByTestId("git-status-merge")).toHaveTextContent("abcdef1");
    expect(screen.getByTestId("git-status-note")).toHaveTextContent("Thanks — merged.");
    expect(screen.getByTestId("git-event-repo")).toHaveTextContent("ngit");
    expect(await screen.findByTestId("embedded-card")).toHaveAttribute("data-shape", "repo");
    expect(screen.queryByTestId("git-status-unauthorised")).toBeNull();
  });

  it("a 1631 on an issue says resolved; from neither its author nor a maintainer, it says it does not count", async () => {
    const issue = ev(
      1621,
      [
        ["a", `30617:${OWNER}:ngit`],
        ["subject", "Crash on start"],
      ],
      "",
      AUTHOR,
    );
    byId.set(issue.id, issue);
    renderWithProviders(<GitStatusHero event={ev(1631, [["e", issue.id, "", "root"]], "", STRANGER)} />);
    expect(await screen.findByTestId("git-status-title")).toHaveTextContent("Resolved: Crash on start");
    expect(await screen.findByTestId("git-status-unauthorised")).toBeInTheDocument();
  });

  it("an unmarked e names no item", () => {
    renderWithProviders(<GitStatusHero event={ev(1632, [["e", "f".repeat(64)]])} />);
    expect(screen.getByTestId("git-status-title")).toHaveTextContent("Marked closed");
    expect(screen.getByTestId("git-status-no-target")).toBeInTheDocument();
  });
});

describe("RepoStateHero", () => {
  it("names the repo, its HEAD, its branches (default first) and its tags", async () => {
    renderWithProviders(
      <RepoStateHero
        event={ev(30618, [
          ["d", "ngit"],
          ["refs/heads/dev", "1111111aaaa"],
          ["refs/heads/master", "2222222bbbb"],
          ["refs/tags/v1.0.0", "3333333cccc"],
          ["HEAD", "ref: refs/heads/master"],
        ])}
      />,
    );
    expect(screen.getByTestId("repo-state-line")).toHaveTextContent("HEAD → master");
    expect(screen.getByTestId("repo-state-line")).toHaveTextContent("2 branches · 1 tag");
    const branches = within(screen.getByTestId("repo-state-branches")).getAllByRole("listitem");
    expect(branches[0]).toHaveTextContent("master");
    expect(branches[0]).toHaveTextContent("default");
    expect(branches[0]).toHaveTextContent("2222222");
    expect(screen.getByTestId("repo-state-tags")).toHaveTextContent("v1.0.0");
    expect(await screen.findByTestId("repo-state-title")).toHaveTextContent("ngit");
  });
});

describe("GitReplyHero (legacy 1622)", () => {
  it("is a comment with its thread: the repo, the issue it answers as a card, its words", async () => {
    const issue = ev(
      1621,
      [
        ["a", `30617:${OWNER}:ngit`],
        ["subject", "Docs are stale"],
      ],
      "",
      AUTHOR,
    );
    byId.set(issue.id, issue);
    renderWithProviders(
      <GitReplyHero
        event={ev(
          1622,
          [
            ["a", `30617:${OWNER}:ngit`],
            ["e", issue.id, "", "root"],
          ],
          "I can take this one.",
          STRANGER,
        )}
      />,
    );
    expect(screen.getByTestId("git-reply-body")).toHaveTextContent("I can take this one.");
    expect(screen.getByTestId("git-event-repo")).toHaveTextContent("ngit");
    expect(await screen.findByTestId("embedded-card")).toHaveTextContent("Docs are stale");
  });
});
