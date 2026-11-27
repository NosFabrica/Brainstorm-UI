import { describe, expect, it } from "vitest";
import { gitStatusLabel, readGitReply, readGitStatus, readRepoState, statusFromAuthority } from "./gitEvents";

const ITEM = "1".repeat(64);
const REV = "2".repeat(64);
const PATCH = "3".repeat(64);
const OWNER = "a".repeat(64);
const REPO = `30617:${OWNER}:ngit`;

describe("readGitStatus (NIP-34 Status)", () => {
  it("reads the root, the accepted revisions, the repo and a 1631's merge facts", () => {
    const s = readGitStatus({
      kind: 1631,
      content: "Merged, thanks!",
      tags: [
        ["e", ITEM, "", "root"],
        ["e", REV, "wss://relay.ngit.dev", "reply"],
        ["p", OWNER],
        ["a", REPO, "wss://relay.ngit.dev"],
        ["q", PATCH, "", OWNER],
        ["merge-commit", "abcdef1234567890"],
        ["applied-as-commits", "1111111", "2222222"],
      ],
    });
    expect(s.target).toEqual({ id: ITEM });
    expect(s.revisions).toEqual([{ id: REV, relay: "wss://relay.ngit.dev" }]);
    expect(s.repo).toBe(REPO);
    expect(s.appliedPatches).toEqual([{ id: PATCH }]);
    expect(s.mergeCommit).toBe("abcdef1234567890");
    expect(s.appliedCommits).toEqual(["1111111", "2222222"]);
    expect(s.note).toBe("Merged, thanks!");
  });

  it("names no target from an unmarked e, and keeps merge facts to a 1631", () => {
    const s = readGitStatus({
      kind: 1632,
      content: "",
      tags: [
        ["e", ITEM],
        ["merge-commit", "abcdef1"],
      ],
    });
    expect(s.target).toBeNull();
    expect(s.mergeCommit).toBeNull();
  });

  it("says a 1631 as merged for a patch or PR, resolved for an issue", () => {
    const s = readGitStatus({ kind: 1631, content: "", tags: [["e", ITEM, "", "root"]] });
    expect(gitStatusLabel(s, 1618)).toBe("Merged");
    expect(gitStatusLabel(s, 1621)).toBe("Resolved");
    expect(gitStatusLabel(s)).toBe("Merged or resolved");
    expect(gitStatusLabel(readGitStatus({ kind: 1632, content: "", tags: [] }))).toBe("Closed");
  });

  it("counts a status from the item's author or a maintainer only", () => {
    const repo = { pubkey: OWNER, tags: [["maintainers", "b".repeat(64)]] };
    expect(statusFromAuthority("c".repeat(64), "c".repeat(64), undefined)).toBe(true);
    expect(statusFromAuthority("b".repeat(64), "c".repeat(64), repo)).toBe(true);
    expect(statusFromAuthority("d".repeat(64), "c".repeat(64), repo)).toBe(false);
    expect(statusFromAuthority("d".repeat(64), "c".repeat(64), undefined)).toBeNull();
  });
});

describe("readRepoState (NIP-34 30618)", () => {
  it("reads branches, tags and HEAD, the default branch first", () => {
    const state = readRepoState({
      pubkey: OWNER,
      tags: [
        ["d", "ngit"],
        ["refs/heads/feature", "aaaaaaa1"],
        ["refs/heads/master", "bbbbbbb2"],
        ["refs/tags/v1.2.0", "ccccccc3"],
        ["refs/tags/v1.10.0", "ddddddd4"],
        ["refs/tags/v1.10.0^{}", "eeeeeee5"],
        ["HEAD", "ref: refs/heads/master"],
        ["refs/heads/bad", "not a commit"],
      ],
    });
    expect(state.repo).toBe(REPO);
    expect(state.head).toBe("master");
    expect(state.branches.map((b) => b.name)).toEqual(["master", "feature"]);
    expect(state.tags.map((t) => t.name)).toEqual(["v1.10.0", "v1.2.0"]);
  });
});

describe("readGitReply (legacy 1622)", () => {
  it("reads the repo and the NIP-10 root and reply markers", () => {
    const r = readGitReply({
      tags: [
        ["a", REPO],
        ["e", ITEM, "", "root"],
        ["e", REV, "", "reply"],
      ],
    });
    expect(r).toEqual({ repo: REPO, root: { id: ITEM }, parent: { id: REV } });
  });
});
