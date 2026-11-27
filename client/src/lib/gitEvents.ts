/**
 * The NIP-34 events around an issue, a patch or a pull request that are not
 * one themselves, read by the tags NIP-34 gives them:
 *
 * - **Status** (1630 open, 1631 applied/merged/resolved, 1632 closed, 1633
 *   draft). `["e", <item>, "", "root"]` names the issue, PR or original root
 *   patch; `["e", <revision>, "", "reply"]` the accepted revision root;
 *   `["a", "30617:…"]` the repo (optional); a 1631 may add `["q", <patch>]` for
 *   each applied patch, `["merge-commit", <id>]` when merged, and
 *   `["applied-as-commits", <id>, …]` when applied. The content is markdown.
 *   Only the newest status from the item's author or a maintainer counts.
 * - **Repository state** (30618): `d` is the repo's identifier, each
 *   `["refs/heads/<branch>" | "refs/tags/<tag>", <commit>]` a ref, and
 *   `["HEAD", "ref: refs/heads/<branch>"]` the default branch.
 * - **Git reply** (1622): no longer in NIP-34, whose replies are NIP-22
 *   comments (1111) rooted at the issue or patch. Older clients wrote it with
 *   the repo's `a` and NIP-10 `e` markers (`root`, `reply`); it is read as that
 *   legacy comment, nothing more.
 */
import { gitStateOf, GIT_STATE_LABEL, type GitState } from "@/lib/gitStatus";

export const GIT_REPLY_KIND = 1622;
export const REPO_STATE_KIND = 30618;
export const GIT_STATUS_KIND_SET: ReadonlySet<number> = new Set([1630, 1631, 1632, 1633]);

const HEX64 = /^[0-9a-f]{64}$/i;

export interface GitRef {
  id: string;
  relay?: string;
}

export interface GitStatusEvent {
  kind: number;
  /** The issue, pull request or original root patch: the `e` marked `root`. */
  target: GitRef | null;
  /** Accepted revision roots: the `e` tags marked `reply`. */
  revisions: GitRef[];
  /** The repo, `30617:<owner>:<id>`, when the status names it. */
  repo: string | null;
  /** 1631 only: the patches applied or merged (`q`). */
  appliedPatches: GitRef[];
  /** 1631 only: the merge commit. */
  mergeCommit: string | null;
  /** 1631 only: the commits a patch was applied as. */
  appliedCommits: string[];
  /** The content: markdown. */
  note: string;
}

const relayOf = (t: string[]) => (t[2] && /^wss?:\/\//i.test(t[2]) ? t[2] : undefined);
const refOf = (t: string[]): GitRef | null => {
  if (!HEX64.test(t[1] ?? "")) return null;
  const relay = relayOf(t);
  return { id: t[1].toLowerCase(), ...(relay ? { relay } : {}) };
};
const repoOf = (tags: string[][]) => tags.find((t) => t[0] === "a" && t[1]?.startsWith("30617:"))?.[1] ?? null;
const commitId = (v: string | undefined) => (v && /^[0-9a-f]{7,64}$/i.test(v.trim()) ? v.trim().toLowerCase() : null);

export function readGitStatus(ev: { kind: number; tags: string[][]; content: string }): GitStatusEvent {
  const marked = (marker: string) =>
    ev.tags.filter((t) => t[0] === "e" && t[3] === marker).flatMap((t) => refOf(t) ?? []);
  const applied = ev.kind === 1631;
  return {
    kind: ev.kind,
    target: marked("root")[0] ?? null,
    revisions: marked("reply"),
    repo: repoOf(ev.tags),
    appliedPatches: applied ? ev.tags.filter((t) => t[0] === "q").flatMap((t) => refOf(t) ?? []) : [],
    mergeCommit: applied ? commitId(ev.tags.find((t) => t[0] === "merge-commit")?.[1]) : null,
    appliedCommits: applied
      ? ev.tags
          .filter((t) => t[0] === "applied-as-commits")
          .flatMap((t) => t.slice(1))
          .flatMap((v) => commitId(v) ?? [])
      : [],
    note: ev.content.trim(),
  };
}

/**
 * The state a status sets, in words. 1631 is "merged" for a patch or PR and
 * "resolved" for an issue: once the target is known it says which; before,
 * a merge commit, applied commits or applied patches mean a patch.
 */
export function gitStatusState(status: GitStatusEvent, targetKind?: number): GitState {
  const kind =
    targetKind ??
    (status.mergeCommit || status.appliedCommits.length || status.appliedPatches.length ? 1617 : undefined);
  if (status.kind === 1631 && kind === undefined) return "resolved";
  return gitStateOf(status.kind, kind ?? 1621);
}

/** "Merged", "Resolved" — "Merged or resolved" for a 1631 whose target is not known yet. */
export function gitStatusLabel(status: GitStatusEvent, targetKind?: number): string {
  if (status.kind === 1631 && targetKind === undefined && !status.mergeCommit && !status.appliedCommits.length)
    return status.appliedPatches.length ? "Applied" : "Merged or resolved";
  return GIT_STATE_LABEL[gitStatusState(status, targetKind)];
}

/**
 * Whether a status counts: NIP-34 takes the newest one "from either the
 * issue/patch author or a maintainer". The maintainers are the repo
 * announcement's author and its `maintainers` tag.
 */
export function statusFromAuthority(
  statusAuthor: string,
  targetAuthor: string | undefined,
  repo: { pubkey: string; tags: string[][] } | undefined,
): boolean | null {
  if (targetAuthor && statusAuthor === targetAuthor) return true;
  if (repo && (repo.pubkey === statusAuthor || maintainersOf(repo).includes(statusAuthor))) return true;
  // Neither, and both are known: it does not count. Otherwise it cannot be told yet.
  return targetAuthor && repo ? false : null;
}

/** A repo's maintainers: its announcement's author, then its `maintainers` tag. */
export function maintainersOf(repo: { pubkey: string; tags: string[][] }): string[] {
  const listed = repo.tags.filter((t) => t[0] === "maintainers").flatMap((t) => t.slice(1));
  return [...new Set([repo.pubkey, ...listed.filter((pk) => HEX64.test(pk)).map((pk) => pk.toLowerCase())])];
}

export interface RepoState {
  /** The repo's identifier: the `d` of its announcement. */
  repoId: string;
  /** Its announcement's address, by the same author. */
  repo: string;
  branches: { name: string; commit: string }[];
  tags: { name: string; commit: string }[];
  /** The branch HEAD names, when it does. */
  head: string | null;
}

/** A ref name git would accept: never a peeled `^{}` entry or one with spaces. */
const REF_NAME = /^[^\s~^:?*[\\]+$/;

export function readRepoState(ev: { pubkey: string; tags: string[][] }): RepoState {
  const repoId = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
  const branches: RepoState["branches"] = [];
  const tags: RepoState["tags"] = [];
  const seen = new Set<string>();
  for (const t of ev.tags) {
    const commit = commitId(t[1]);
    if (!commit || seen.has(t[0])) continue;
    const m = /^refs\/(heads|tags)\/(.+)$/.exec(t[0]);
    if (!m || !REF_NAME.test(m[2])) continue;
    seen.add(t[0]);
    (m[1] === "heads" ? branches : tags).push({ name: m[2], commit });
  }
  const headTag = ev.tags.find((t) => t[0] === "HEAD")?.[1] ?? "";
  const head = /^ref:\s*refs\/heads\/(.+)$/.exec(headTag.trim())?.[1] ?? null;
  // The default branch first; tags newest-looking first (a state carries no dates).
  branches.sort((a, b) => (a.name === head ? -1 : b.name === head ? 1 : a.name.localeCompare(b.name)));
  tags.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  return { repoId, repo: `30617:${ev.pubkey}:${repoId}`, branches, tags, head };
}

export interface GitReply {
  repo: string | null;
  /** The issue or patch the thread is under: NIP-10's `root` marker. */
  root: GitRef | null;
  /** What it answers, when not the root: the `reply` marker. */
  parent: GitRef | null;
}

export function readGitReply(ev: { tags: string[][] }): GitReply {
  const marked = (marker: string) =>
    ev.tags.find((t) => t[0] === "e" && t[3] === marker && HEX64.test(t[1] ?? "")) ?? null;
  const root = marked("root");
  const parent = marked("reply");
  return {
    repo: repoOf(ev.tags),
    root: root ? refOf(root) : null,
    parent: parent && parent[1] !== root?.[1] ? refOf(parent) : null,
  };
}

/** A commit as people write it: the first seven characters. */
export const shortCommit = (id: string) => id.slice(0, 7);
