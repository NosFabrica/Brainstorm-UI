/**
 * A NIP-34 patch is git's own text. Two shapes on the relay: `git
 * format-patch` mail (From <sha>… / From: / Date: / Subject: / message / ---
 * / diffstat / diff) and `git show` (commit <sha> / Author: / Date: /
 * indented message / diff). None of forty recent patches carried a subject
 * tag, so the title, author, message and diff all come from the text.
 */
import { describe, expect, it } from "vitest";
import { gitItemSummaryOf, gitItemTitleOf, parsePatch } from "./gitPatch";

const MAIL = [
  "From e7d5515e41b8a9089d229af9a2cf36d373cb0ce7 Mon Sep 17 00:00:00 2001",
  "From: OpenClaw Codex <codex@openclaw.local>",
  "Date: Fri, 4 Sep 2026 19:42:56 -0700",
  "Subject: [PATCH 2/3] Trust proxy headers for NIP-98 behind TLS proxy",
  "",
  "Behind a TLS-terminating proxy the scheme is http; honour X-Forwarded-*.",
  "---",
  " README.md          |  1 +",
  " cmd/main.go        |  3 ++-",
  " 2 files changed, 3 insertions(+), 1 deletion(-)",
  "",
  "diff --git a/README.md b/README.md",
  "index c8f6f0d..e0e1fb7 100644",
  "--- a/README.md",
  "+++ b/README.md",
  "@@ -41,6 +41,7 @@ override file values:",
  " | `ASTILLERO_CONFIG` | Configuration file |",
  "+| `TRUST_PROXY` | Honour forwarded headers |",
  "diff --git a/cmd/main.go b/cmd/main.go",
  "--- a/cmd/main.go",
  "+++ b/cmd/main.go",
  "@@ -1,3 +1,5 @@",
  "-old := false",
  "+trust := cfg.TrustProxy",
  "+_ = trust",
].join("\n");

const SHOW = [
  "commit 000c2b0b9fdbc529e89ffbedb24ecaee04bcc0db",
  "Author: randymcmillan <randymcmillan@protonmail.com>",
  "Date:   Fri Sep 4 11:35:43 2026 -0400",
  "",
  "    chore: bump swiss for Go 1.27 support",
  "    ",
  "    Update github.com/cockroachdb/swiss to a revision that builds with Go 1.27.",
  "",
  "diff --git a/go.mod b/go.mod",
  "--- a/go.mod",
  "+++ b/go.mod",
  "@@ -36,7 +36,7 @@ require (",
  "-\tgithub.com/cockroachdb/swiss v0.0.0-old",
  "+\tgithub.com/cockroachdb/swiss v0.0.0-new",
].join("\n");

describe("parsePatch", () => {
  it("reads a format-patch mail: title without the [PATCH n/m] prefix, author, date, message, and the diff with its counts", () => {
    const p = parsePatch(MAIL);
    expect(p.format).toBe("mail");
    expect(p.title).toBe("Trust proxy headers for NIP-98 behind TLS proxy");
    expect(p.author).toBe("OpenClaw Codex");
    expect(p.date).toBe("Fri, 4 Sep 2026 19:42:56 -0700");
    expect(p.message).toBe("Behind a TLS-terminating proxy the scheme is http; honour X-Forwarded-*.");
    expect(p.diff.startsWith("diff --git a/README.md")).toBe(true);
    expect(p.files).toBe(2);
    expect(p.added).toBe(3);
    expect(p.removed).toBe(1);
  });
  it("reads a git-show patch: title and message from the indented block, author, commit", () => {
    const p = parsePatch(SHOW);
    expect(p.format).toBe("show");
    expect(p.commit).toBe("000c2b0b9fdbc529e89ffbedb24ecaee04bcc0db");
    expect(p.title).toBe("chore: bump swiss for Go 1.27 support");
    expect(p.author).toBe("randymcmillan");
    expect(p.message).toBe("Update github.com/cockroachdb/swiss to a revision that builds with Go 1.27.");
    expect(p.files).toBe(1);
    expect(p.added).toBe(1);
    expect(p.removed).toBe(1);
  });
  it("a plain description is a message with no diff", () => {
    const p = parsePatch("Just a note about what this patch would do.");
    expect(p.format).toBe("plain");
    expect(p.title).toBeNull();
    expect(p.diff).toBe("");
    expect(p.files).toBe(0);
    expect(p.message).toBe("Just a note about what this patch would do.");
  });
});

describe("gitItemTitleOf", () => {
  const ev = (kind: number, content: string, tags: string[][] = []) => ({ kind, content, tags });
  it("a subject tag wins; a patch without one is titled from its text; a d-tag of '.' is never a title", () => {
    expect(gitItemTitleOf(ev(1617, MAIL, [["subject", "Given title"]]))).toBe("Given title");
    expect(gitItemTitleOf(ev(1617, MAIL, [["d", "."]]))).toBe("Trust proxy headers for NIP-98 behind TLS proxy");
    expect(gitItemTitleOf(ev(1617, SHOW, [["d", "."]]))).toBe("chore: bump swiss for Go 1.27 support");
    expect(gitItemTitleOf(ev(1617, "", [["d", "."], ["description", "From the description tag"]]))).toBe("From the description tag");
    expect(gitItemTitleOf(ev(1617, "", [["d", "."]]))).toBe("Untitled patch");
  });
  it("an issue or pull request without a subject is titled by its first line", () => {
    expect(gitItemTitleOf(ev(1621, "## Report\n\nA user on Windows…"))).toBe("Report");
    expect(gitItemTitleOf(ev(1618, "Fixes a stuck warning.\nMore detail."))).toBe("Fixes a stuck warning.");
    expect(gitItemTitleOf(ev(1621, ""))).toBe("Untitled issue");
  });
});

describe("gitItemSummaryOf", () => {
  const ev = (kind: number, content: string, tags: string[][] = []) => ({ kind, content, tags });
  it("a patch's summary is its commit message, never the title again and never the mail headers", () => {
    expect(gitItemSummaryOf(ev(1617, MAIL, [["description", "Trust proxy headers for NIP-98 behind TLS proxy\n\nBehind a TLS-terminating proxy…"]]))).toBe(
      "Behind a TLS-terminating proxy the scheme is http; honour X-Forwarded-*.",
    );
    expect(gitItemSummaryOf(ev(1617, SHOW))).toBe("Update github.com/cockroachdb/swiss to a revision that builds with Go 1.27.");
    // No message in the text: the description tag, minus a repeated title.
    expect(gitItemSummaryOf(ev(1617, "", [["description", "fix: count deposits\n\nThe treasury balance minus queued sats."]]))).toBe("The treasury balance minus queued sats.");
  });
  it("an issue's summary is its body after the title line, marks stripped", () => {
    expect(gitItemSummaryOf(ev(1621, "## Report\n\nA user on **Windows 10** cannot share.", [["subject", "Report"]]))).toBe("A user on Windows 10 cannot share.");
    expect(gitItemSummaryOf(ev(1621, "Just one line."))).toBe("");
    expect(gitItemSummaryOf(ev(1618, "Fixes a stuck warning.\nMore detail here.", [["subject", "fix(git-pool): stale warning"]]))).toBe("Fixes a stuck warning. More detail here.");
  });
});
