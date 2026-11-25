/**
 * The NIP-34 pages around an issue, a patch or a pull request (lib/gitEvents):
 *
 * - a **status** (1630–1633): what it set, on what — the item drawn as its
 *   card — in which repo, the merge facts a 1631 carries, the maintainer's
 *   note, and whether it counts: NIP-34 takes a status only from the item's
 *   author or a maintainer;
 * - a **repository state** (30618): the repo, its default branch, its
 *   branches and its tags, each at its commit;
 * - a legacy **git reply** (1622): a comment, with the repo and the issue or
 *   patch it was under.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { GitBranch, GitCommitHorizontal, GitMerge, Tag } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { MarkdownBody } from "@/components/share/MarkdownBody";
import { useRefEvents } from "@/hooks/useRefEvents";
import type { EventRef } from "@/lib/activity";
import {
  gitStatusLabel,
  gitStatusState,
  readGitReply,
  readGitStatus,
  readRepoState,
  shortCommit,
  statusFromAuthority,
} from "@/lib/gitEvents";
import { gitItemTitleOf } from "@/lib/gitPatch";
import { GIT_STATE_TONE } from "@/lib/gitStatus";
import type { MinimalEvent } from "@/lib/noteRefs";
import { eventPath } from "@/lib/shareId";

const REFS_FOLD = 12;

const repoName = (address: string | null) => address?.split(":").slice(2).join(":") || null;

/** The repo by name, linked once its announcement answers. */
function RepoLine({ address, repo }: { address: string; repo?: MinimalEvent }) {
  const name = repo?.tags.find((t) => t[0] === "name")?.[1]?.trim() || repoName(address);
  return (
    <span className="inline-flex items-center gap-1" data-testid="git-event-repo">
      <GitBranch className="h-3 w-3" /> in{" "}
      {repo ? (
        <Link href={eventPath(repo)} className="font-medium text-brand-link hover:underline">
          {name}
        </Link>
      ) : (
        <span className="font-medium">{name}</span>
      )}
    </span>
  );
}

/** A found event as its card; a way to it while it is not. */
function Referenced({ refd, ev, noun, testId }: { refd: EventRef; ev?: MinimalEvent; noun: string; testId: string }) {
  if (ev) return <EmbeddedNoteCard event={ev} href={eventPath(ev)} nested />;
  return (
    <Link
      href={refd.id ? `/e/${refd.id}` : "#"}
      className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-500 hover:border-slate-300 hover:text-brand-link dark:border-slate-700 dark:text-slate-400"
      data-testid={testId}
    >
      <span>{noun}</span>
      {refd.id && <span className="font-mono text-xs">{refd.id.slice(0, 8)}…</span>}
    </Link>
  );
}

export function GitStatusHero({ event }: { event: MinimalEvent }) {
  const status = useMemo(() => readGitStatus(event), [event]);
  const refs = useMemo<EventRef[]>(
    () => [...(status.target ? [status.target] : []), ...(status.repo ? [{ addr: status.repo }] : [])],
    [status],
  );
  const found = useRefEvents(refs);
  const target = status.target ? found.get(status.target) : undefined;
  // The repo the status names, else the one its item names.
  const repoAddress = status.repo ?? target?.tags.find((t) => t[0] === "a" && t[1]?.startsWith("30617:"))?.[1] ?? null;
  const repoFound = useRefEvents(
    useMemo(() => (repoAddress && !status.repo ? [{ addr: repoAddress }] : []), [repoAddress, status.repo]),
  );
  const repo = repoAddress ? (found.get({ addr: repoAddress }) ?? repoFound.get({ addr: repoAddress })) : undefined;
  const state = gitStatusState(status, target?.kind);
  const label = gitStatusLabel(status, target?.kind);
  const counts = statusFromAuthority(event.pubkey, target?.pubkey, repo);

  return (
    <div className="space-y-4" data-testid="git-status-hero">
      <div>
        <h1
          className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="git-status-title"
        >
          {target ? `${label}: ${gitItemTitleOf(target)}` : `Marked ${label.toLowerCase()}`}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Chip size="sm" tone={GIT_STATE_TONE[state]} data-testid="git-status-pill">
            {label}
          </Chip>
          <span>Status</span>
          {repoAddress && <RepoLine address={repoAddress} repo={repo} />}
        </div>
        {counts === false && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" data-testid="git-status-unauthorised">
            Not set by its author or a maintainer of the repo, so it does not change the item's status.
          </p>
        )}
      </div>

      {status.target ? (
        <Referenced refd={status.target} ev={target} noun="The item it is about" testId="git-status-target-pending" />
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="git-status-no-target">
          It names no issue, patch or pull request.
        </p>
      )}

      {(status.mergeCommit || status.appliedCommits.length > 0 || status.appliedPatches.length > 0) && (
        <div
          className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
          data-testid="git-status-merge"
        >
          {status.mergeCommit && (
            <Chip size="sm" tone="slate" icon={GitMerge} title={status.mergeCommit}>
              merged as <span className="font-mono">{shortCommit(status.mergeCommit)}</span>
            </Chip>
          )}
          {status.appliedCommits.length > 0 && (
            <Chip size="sm" tone="slate" icon={GitCommitHorizontal} title={status.appliedCommits.join("\n")}>
              applied as {status.appliedCommits.map(shortCommit).join(", ")}
            </Chip>
          )}
          {status.appliedPatches.length > 0 && (
            <span>
              {status.appliedPatches.length} {status.appliedPatches.length === 1 ? "patch" : "patches"} applied
            </span>
          )}
        </div>
      )}
      {status.revisions.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="git-status-revisions">
          Accepts {status.revisions.length === 1 ? "a revision" : `${status.revisions.length} revisions`} of it
        </p>
      )}

      {status.note && (
        <div data-testid="git-status-note">
          <MarkdownBody text={status.note} tags={event.tags} />
        </div>
      )}
    </div>
  );
}

function RefList({
  kicker,
  icon: Icon,
  refs,
  head,
  testId,
}: {
  kicker: string;
  icon: typeof GitBranch;
  refs: { name: string; commit: string }[];
  head?: string | null;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? refs : refs.slice(0, REFS_FOLD);
  return (
    <section className="space-y-2" data-testid={testId}>
      <SectionHeader kicker={kicker} />
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {shown.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate font-mono text-[13px] text-slate-800 dark:text-slate-100">{r.name}</span>
              {head === r.name && (
                <Chip size="sm" tone="info" data-testid="repo-state-head">
                  default
                </Chip>
              )}
            </span>
            <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400" title={r.commit}>
              {shortCommit(r.commit)}
            </span>
          </li>
        ))}
      </ul>
      {refs.length > REFS_FOLD && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-brand-primary hover:underline dark:text-brand-link"
        >
          {open ? "Show fewer" : `Show all ${refs.length}`}
        </button>
      )}
    </section>
  );
}

export function RepoStateHero({ event }: { event: MinimalEvent }) {
  const state = useMemo(() => readRepoState(event), [event]);
  const found = useRefEvents(useMemo(() => [{ addr: state.repo }], [state.repo]));
  const repo = found.get({ addr: state.repo });
  const name = repo?.tags.find((t) => t[0] === "name")?.[1]?.trim() || state.repoId || "A repository";
  return (
    <div className="space-y-5" data-testid="repo-state-hero">
      <div>
        <h1
          className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
          data-testid="repo-state-title"
        >
          {name}
        </h1>
        <div
          className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
          data-testid="repo-state-line"
        >
          <span>Repository state</span>
          {state.head && (
            <Chip size="sm" tone="slate" icon={GitBranch}>
              HEAD → {state.head}
            </Chip>
          )}
          <span>
            {state.branches.length} {state.branches.length === 1 ? "branch" : "branches"} · {state.tags.length}{" "}
            {state.tags.length === 1 ? "tag" : "tags"}
          </span>
        </div>
      </div>
      {repo && <EmbeddedNoteCard event={repo} href={eventPath(repo)} nested />}
      {state.branches.length > 0 && (
        <RefList
          kicker="Branches"
          icon={GitBranch}
          refs={state.branches}
          head={state.head}
          testId="repo-state-branches"
        />
      )}
      {state.tags.length > 0 && <RefList kicker="Tags" icon={Tag} refs={state.tags} testId="repo-state-tags" />}
      {state.branches.length === 0 && state.tags.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="repo-state-empty">
          It lists no branches or tags.
        </p>
      )}
    </div>
  );
}

/** A legacy NIP-34 reply (1622): the thread it is in, then its words, read as a comment's. */
export function GitReplyHero({ event, children }: { event: MinimalEvent; children?: React.ReactNode }) {
  const reply = useMemo(() => readGitReply(event), [event]);
  const refs = useMemo<EventRef[]>(
    () => [...(reply.root ? [reply.root] : []), ...(reply.repo ? [{ addr: reply.repo }] : [])],
    [reply],
  );
  const found = useRefEvents(refs);
  const root = reply.root ? found.get(reply.root) : undefined;
  return (
    <div className="space-y-3" data-testid="git-reply-hero">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Chip size="sm" tone="slate">
          Git reply
        </Chip>
        {reply.repo && <RepoLine address={reply.repo} repo={found.get({ addr: reply.repo })} />}
        <span title="NIP-34 now threads replies as NIP-22 comments">· an older kind of reply</span>
      </div>
      {reply.root && (
        <Referenced refd={reply.root} ev={root} noun="The issue or patch it answers" testId="git-reply-root-pending" />
      )}
      <div data-testid="git-reply-body">{children ?? <MarkdownBody text={event.content} tags={event.tags} />}</div>
    </div>
  );
}
