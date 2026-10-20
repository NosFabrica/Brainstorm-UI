// @vitest-environment jsdom
/**
 * What GitHub says about who owns an account, asked of our own origin
 * (`/github/…`, proxied to api.github.com and cached, never GitHub from the
 * reader's browser): the npubs its profile names, its website, and the gists
 * behind the profiles that claim it. Anything but a JSON answer is "nothing
 * known" — staging's origin answers its own page until the proxy is there.
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

const claims = vi.hoisted(() => ({ list: [] as { pubkey: string; proof: string | null }[] }));
vi.mock("@/services/itemEngagement", () => ({ fetchGitHubClaimants: async () => claims.list }));

import { fetchGitHubEvidence, __resetGitHub } from "./github";

beforeEach(() => {
  answers.clear();
  claims.list = [];
  fetchMock.mockClear();
  __resetGitHub();
});

describe("fetchGitHubEvidence", () => {
  it("reads the npubs the profile names, its website's host, and the claims its gists prove", async () => {
    answers.set("/github/users/riverdev", {
      login: "riverdev",
      blog: "https://www.RiverDev-Home.com/about",
      bio: "builds",
    });
    answers.set("/github/users/riverdev/social_accounts", [
      { provider: "generic", url: `https://njump.me/${npub(OWNER)}` },
      { provider: "twitter", url: "https://twitter.com/riverdev" },
    ]);
    claims.list = [
      { pubkey: CLAIMER, proof: "gist1" },
      { pubkey: "d4".repeat(32), proof: "gist2" },
      { pubkey: "e5".repeat(32), proof: null },
    ];
    answers.set("/github/gists/gist1", {
      owner: { login: "riverdev" },
      files: { "proof.md": { content: `Nostr: ${npub(CLAIMER)}` } },
    });
    // Someone else's gist proves nothing about this account.
    answers.set("/github/gists/gist2", {
      owner: { login: "intruder" },
      files: { "x.md": { content: npub("d4".repeat(32)) } },
    });
    expect(await fetchGitHubEvidence("riverdev")).toEqual({
      checked: true,
      named: [OWNER],
      blogHost: "riverdev-home.com",
      claimants: [CLAIMER, "d4".repeat(32), "e5".repeat(32)],
      provenClaimants: [CLAIMER],
    });
  });

  it("knows nothing when the origin answers its own page instead of GitHub's, and asks once a session", async () => {
    const none = { checked: false, named: [], blogHost: null, claimants: [], provenClaimants: [] };
    expect(await fetchGitHubEvidence("riverdev")).toEqual(none);
    const calls = fetchMock.mock.calls.length;
    await fetchGitHubEvidence("RiverDev");
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
