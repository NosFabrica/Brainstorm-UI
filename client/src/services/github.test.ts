// @vitest-environment jsdom
/**
 * A GitHub account's public facts, asked of our own origin (`/github/…`,
 * which nginx proxies to api.github.com and caches), never of GitHub from
 * the reader's browser — the link-preview rule (services/unfurl), for the
 * same reasons: one upstream call per account, not one per reader against
 * GitHub's 60-an-hour limit, and readers never contact GitHub.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal("fetch", (input: string, init?: RequestInit) => fetchMock(input, init));

import { fetchGitHubAccount, topRepos, __resetGitHub } from "./github";

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const status = (code: number) => Promise.resolve(new Response("", { status: code }));

const user = {
  login: "vcavallo",
  name: "Vinney Cavallo",
  bio: "Builds Tapestry",
  company: "@NosFabrica",
  location: "New York",
  blog: "https://vinney.xyz",
  avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
  followers: 120,
  public_repos: 42,
  created_at: "2012-03-04T00:00:00Z",
};
const repos = [
  {
    name: "tapestry",
    html_url: "https://github.com/vcavallo/tapestry",
    description: "Trust",
    stargazers_count: 30,
    language: "JavaScript",
    pushed_at: "2026-10-01T00:00:00Z",
    fork: false,
  },
  {
    name: "dotfiles",
    html_url: "https://github.com/vcavallo/dotfiles",
    description: null,
    stargazers_count: 2,
    language: "Shell",
    pushed_at: "2026-09-01T00:00:00Z",
    fork: false,
  },
  {
    name: "nostr-tools",
    html_url: "https://github.com/vcavallo/nostr-tools",
    description: "a fork",
    stargazers_count: 900,
    language: "TypeScript",
    pushed_at: "2026-09-20T00:00:00Z",
    fork: true,
  },
  {
    name: "brainstorm",
    html_url: "https://github.com/vcavallo/brainstorm",
    description: "WoT",
    stargazers_count: 30,
    language: "TypeScript",
    pushed_at: "2026-10-05T00:00:00Z",
    fork: false,
  },
];
const events = [{ type: "PushEvent", created_at: "2026-10-10T12:00:00Z" }];

function route(handler: (url: string) => Promise<Response>) {
  fetchMock.mockImplementation((input) => handler(String(input)));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetGitHub();
});

describe("fetchGitHubAccount", () => {
  it("asks our origin for the user, their repos and their latest public activity, and returns the facts", async () => {
    route((url) => {
      if (url === "/github/users/vcavallo") return ok(user);
      if (url.startsWith("/github/users/vcavallo/repos?")) return ok(repos);
      if (url.startsWith("/github/users/vcavallo/events/public?")) return ok(events);
      return status(404);
    });
    const facts = await fetchGitHubAccount("vcavallo");
    expect(facts).toMatchObject({
      handle: "vcavallo",
      name: "Vinney Cavallo",
      bio: "Builds Tapestry",
      company: "@NosFabrica",
      location: "New York",
      blog: "https://vinney.xyz",
      avatar: "https://avatars.githubusercontent.com/u/1?v=4",
      followers: 120,
      publicRepos: 42,
      joinedAt: "2012-03-04T00:00:00Z",
      lastActiveAt: "2026-10-10T12:00:00Z",
    });
    expect(facts!.repos.map((r) => r.name)).toEqual(["tapestry", "dotfiles", "nostr-tools", "brainstorm"]);
    // Only our origin was asked: no absolute URL, no api.github.com.
    for (const [url] of fetchMock.mock.calls) expect(url).toMatch(/^\/github\//);
  });

  it("an account GitHub doesn't know is null; repos or events that fail leave the facts without them", async () => {
    route((url) => (url === "/github/users/nobody" ? status(404) : status(500)));
    expect(await fetchGitHubAccount("nobody")).toBeNull();

    __resetGitHub();
    route((url) => (url === "/github/users/vcavallo" ? ok(user) : status(500)));
    const facts = await fetchGitHubAccount("vcavallo");
    expect(facts).toMatchObject({ handle: "vcavallo", repos: [], lastActiveAt: null });
  });

  it("asks once per handle for the session", async () => {
    route((url) => (url === "/github/users/vcavallo" ? ok(user) : ok([])));
    await fetchGitHubAccount("vcavallo");
    await fetchGitHubAccount("vcavallo");
    expect(fetchMock.mock.calls.filter(([u]) => u === "/github/users/vcavallo")).toHaveLength(1);
  });
});

describe("topRepos", () => {
  it("the account's own repos by stars, then by last push — forks are someone else's work", () => {
    const all = repos.map((r) => ({
      name: r.name,
      url: r.html_url,
      description: r.description,
      stars: r.stargazers_count,
      language: r.language,
      pushedAt: r.pushed_at,
      fork: r.fork,
    }));
    expect(topRepos(all, 2).map((r) => r.name)).toEqual(["brainstorm", "tapestry"]);
    expect(topRepos(all, 5).map((r) => r.name)).toEqual(["brainstorm", "tapestry", "dotfiles"]);
  });
});
