// @vitest-environment jsdom
/**
 * What GitHub says about who owns an account, asked of our own origin
 * (`/github/…`, proxied to api.github.com and cached, never GitHub from the
 * reader's browser): the npubs its profile names, its website, and the gist
 * behind a profile that claims it (hooks/useGitHubEvidence joins them to the
 * claims). Anything but a JSON answer is "nothing known" — staging's origin
 * answers its own page until the proxy is there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nip19 } from "nostr-tools";

const OWNER = "a1".repeat(32);
const CLAIMER = "c3".repeat(32);
const npub = (hex: string) => nip19.npubEncode(hex);

const answers = new Map<string, unknown>();
const fetchMock = vi.fn(async (input: string) =>
  answers.has(input)
    ? new Response(JSON.stringify(answers.get(input)), { status: 200, headers: { "content-type": "application/json" } })
    : new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } }),
);
vi.stubGlobal("fetch", (input: string) => fetchMock(input));

import { fetchGitHubProfileEvidence, gistProvesClaim } from "./github";

beforeEach(() => {
  answers.clear();
  fetchMock.mockClear();
});

describe("fetchGitHubProfileEvidence", () => {
  it("reads the npubs the profile names and its website's host", async () => {
    answers.set("/github/users/riverdev", {
      login: "riverdev",
      blog: "https://www.RiverDev-Home.com/about",
      bio: "builds",
    });
    answers.set("/github/users/riverdev/social_accounts", [
      { provider: "generic", url: `https://njump.me/${npub(OWNER)}` },
      { provider: "twitter", url: "https://twitter.com/riverdev" },
    ]);
    expect(await fetchGitHubProfileEvidence("riverdev")).toEqual({
      checked: true,
      named: [OWNER],
      blogHost: "riverdev-home.com",
    });
  });

  it("knows nothing when the origin answers its own page instead of GitHub's", async () => {
    expect(await fetchGitHubProfileEvidence("riverdev")).toEqual({ checked: false, named: [], blogHost: null });
  });
});

describe("gistProvesClaim", () => {
  it("proves a claim with a gist the account owns naming the claimant, and nothing with someone else's", async () => {
    answers.set("/github/gists/gist1", {
      owner: { login: "riverdev" },
      files: { "proof.md": { content: `Nostr: ${npub(CLAIMER)}` } },
    });
    // Someone else's gist proves nothing about this account.
    answers.set("/github/gists/gist2", {
      owner: { login: "intruder" },
      files: { "x.md": { content: npub("d4".repeat(32)) } },
    });
    expect(await gistProvesClaim("gist1", "riverdev", CLAIMER)).toBe(true);
    expect(await gistProvesClaim("gist2", "riverdev", "d4".repeat(32))).toBe(false);
  });

  it("proves nothing when the origin answers its own page instead of GitHub's", async () => {
    expect(await gistProvesClaim("gist1", "riverdev", CLAIMER)).toBe(false);
  });
});
