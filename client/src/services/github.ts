/**
 * A GitHub account's public facts, for the account's own page (ADR 0007,
 * tier three): who they are, how followed, how many repos, when last active,
 * and their repos with stars and language.
 *
 * Asked of our own origin — `GET /github/users/<handle>` and so on, which
 * nginx proxies to api.github.com and caches — never of GitHub from the
 * reader's browser: the link-preview rule (services/unfurl). One upstream
 * call per account an hour, not one per reader against GitHub's limit of 60
 * an hour per address, and a reader never contacts GitHub. In development
 * Vite proxies the same path.
 *
 * What GitHub gives without a token: the user, the repo list, public events.
 * Pinned repos and the contribution graph need one; they arrive once the
 * proxy holds a token, through the same path. Memoised for the session,
 * failures included; a page is asked once.
 */

export interface GitHubRepo {
  name: string;
  url: string;
  description: string | null;
  stars: number;
  language: string | null;
  /** ISO 8601. */
  pushedAt: string | null;
  fork: boolean;
}

export interface GitHubAccountFacts {
  handle: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  avatar: string | null;
  followers: number;
  publicRepos: number;
  /** ISO 8601. */
  joinedAt: string | null;
  /** The newest public event's time, ISO 8601; null when GitHub lists none (90 days). */
  lastActiveAt: string | null;
  /** Every repo GitHub listed, in GitHub's order (last push first). */
  repos: GitHubRepo[];
}

import { gistProves, pubkeysNamedIn, type GitHubEvidence } from "@/lib/githubLink";
import { fetchGitHubClaimants } from "@/services/itemEngagement";

const TIMEOUT_MS = 8000;
const cache = new Map<string, Promise<GitHubAccountFacts | null>>();

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function repoOf(r: Record<string, unknown>): GitHubRepo | null {
  const name = str(r.name);
  const url = str(r.html_url);
  if (!name || !url) return null;
  return {
    name,
    url,
    description: str(r.description),
    stars: num(r.stargazers_count),
    language: str(r.language),
    pushedAt: str(r.pushed_at),
    fork: r.fork === true,
  };
}

async function ask(handle: string): Promise<GitHubAccountFacts | null> {
  const base = `/github/users/${encodeURIComponent(handle)}`;
  const user = await getJson<Record<string, unknown>>(base);
  if (!user) return null;
  const [repos, events] = await Promise.all([
    getJson<Record<string, unknown>[]>(`${base}/repos?per_page=100&sort=pushed`),
    getJson<Record<string, unknown>[]>(`${base}/events/public?per_page=1`),
  ]);
  return {
    handle: str(user.login) ?? handle,
    name: str(user.name),
    bio: str(user.bio),
    company: str(user.company),
    location: str(user.location),
    blog: str(user.blog),
    avatar: str(user.avatar_url),
    followers: num(user.followers),
    publicRepos: num(user.public_repos),
    joinedAt: str(user.created_at),
    lastActiveAt: Array.isArray(events) && events[0] ? str(events[0].created_at) : null,
    repos: Array.isArray(repos) ? repos.map(repoOf).filter((r): r is GitHubRepo => !!r) : [],
  };
}

export function fetchGitHubAccount(handle: string): Promise<GitHubAccountFacts | null> {
  const key = handle.toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = ask(handle);
    cache.set(key, p);
  }
  return p;
}

/** The account's own work, best first: by stars, then by last push. A fork is someone else's. */
export function topRepos(repos: GitHubRepo[], n: number): GitHubRepo[] {
  return repos
    .filter((r) => !r.fork)
    .sort((a, b) => b.stars - a.stars || (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""))
    .slice(0, n);
}

const evidenceCache = new Map<string, Promise<GitHubEvidence>>();

/** "https://www.Example.com/about" → "example.com"; null for no website. */
function hostOf(blog: string | null): string | null {
  if (!blog) return null;
  try {
    return new URL(/^https?:\/\//i.test(blog) ? blog : `https://${blog}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function gatherEvidence(handle: string): Promise<GitHubEvidence> {
  const base = `/github/users/${encodeURIComponent(handle)}`;
  const [user, social, claimants] = await Promise.all([
    getJson<Record<string, unknown>>(base),
    getJson<{ url?: unknown }[]>(`${base}/social_accounts`),
    fetchGitHubClaimants(handle).catch(() => []),
  ]);
  const links = Array.isArray(social) ? social.map((a) => str(a.url)) : [];
  const proofs = await Promise.all(
    claimants
      .filter((c) => c.proof)
      .map(async (c) => {
        const gist = await getJson<{ owner?: { login?: unknown }; files?: Record<string, { content?: unknown }> }>(
          `/github/gists/${encodeURIComponent(c.proof!)}`,
        );
        const text = Object.values(gist?.files ?? {})
          .map((f) => str(f.content) ?? "")
          .join("\n");
        return gist && gistProves({ owner: str(gist.owner?.login), text }, handle, c.pubkey) ? c.pubkey : null;
      }),
  );
  return {
    checked: !!user,
    named: user ? pubkeysNamedIn([str(user.blog), str(user.bio), ...links]) : [],
    blogHost: user ? hostOf(str(user.blog)) : null,
    claimants: claimants.map((c) => c.pubkey),
    provenClaimants: proofs.filter((p): p is string => !!p),
  };
}

/**
 * Who GitHub says owns an account (lib/githubLink): the npubs its profile
 * names, its website's host, and the profiles whose NIP-39 claim a gist on
 * the account proves. Asked of our origin like the rest; anything but JSON is
 * nothing known. Memoised for the session, failures included.
 */
export function fetchGitHubEvidence(handle: string): Promise<GitHubEvidence> {
  const key = handle.toLowerCase();
  let p = evidenceCache.get(key);
  if (!p) {
    p = gatherEvidence(handle);
    evidenceCache.set(key, p);
  }
  return p;
}

/** Test seam. */
export function __resetGitHub(): void {
  cache.clear();
  evidenceCache.clear();
}
