import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Bot, GitBranch, GitCommitHorizontal, MessageSquare } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { Chip } from "@/components/ui/chip";
import { fetchGitCommentCounts, fetchGitStatuses, fetchRepoByAddress } from "@/services/search";
import { GIT_STATE_LABEL, GIT_STATE_TONE, gitAgentOf, gitLabelsOf, gitRepoNameOf, gitStateOf, type AgentAuthor } from "@/lib/gitStatus";
import { gitItemTitleOf, parsePatch } from "@/lib/gitPatch";
import { eventPath } from "@/lib/shareId";
import { MarkdownBody } from "./MarkdownBody";

type GitItem = { id: string; kind: number; pubkey: string; content: string; tags: string[][]; created_at: number };

const DIFF_FOLD = 120;

/**
 * An issue, patch or pull request page. A title first; then what became of
 * it (the newest NIP-34 status; none means open), its kind, the repo it
 * belongs to — linked once the announcement answers — its labels, who filed
 * it when that was an agent, and how much talk it drew. Then the body as it
 * was meant to be read: markdown rendered for issues and pull requests, a
 * patch shown as a patch — author, message, a change summary and the diff.
 */
export function GitItemHero({ event, author }: { event: GitItem; author?: AgentAuthor }) {
  const title = gitItemTitleOf(event);
  const kindLabel = event.kind === 1617 ? "Patch" : event.kind === 1618 ? "Pull request" : "Issue";
  const address = event.tags.find((t) => t[0] === "a")?.[1] ?? null;
  const repoName = gitRepoNameOf(event);
  const labels = gitLabelsOf(event);
  const agent = gitAgentOf(event, author);

  const [statusKind, setStatusKind] = useState<number | undefined | null>(null);
  const [comments, setComments] = useState<number>(0);
  const [repo, setRepo] = useState<NostrEvent | null>(null);
  useEffect(() => {
    let alive = true;
    setStatusKind(null);
    void fetchGitStatuses([event.id]).then((m) => {
      if (alive) setStatusKind(m.get(event.id)?.kind);
    });
    void fetchGitCommentCounts([event.id]).then((m) => {
      if (alive) setComments(m.get(event.id) ?? 0);
    });
    if (address) {
      void fetchRepoByAddress(address).then((r) => {
        if (alive) setRepo(r);
      });
    }
    return () => {
      alive = false;
    };
  }, [event.id, address]);

  const patch = useMemo(() => (event.kind === 1617 ? parsePatch(event.content || "") : null), [event.kind, event.content]);
  const [diffOpen, setDiffOpen] = useState(false);
  const state = gitStateOf(statusKind ?? undefined, event.kind);

  const branch = event.tags.find((t) => t[0] === "branch-name")?.[1];
  const target = event.tags.find((t) => t[0] === "target-branch")?.[1];
  const commits = event.tags.filter((t) => t[0] === "c").length;
  const clone = event.tags.find((t) => t[0] === "clone")?.[1];

  const repoLabel = repo ? (
    <Link href={eventPath(repo)} className="font-medium text-brand-link hover:underline" data-testid="git-status-repo">
      {repoName}
    </Link>
  ) : (
    <span data-testid="git-status-repo">{repoName}</span>
  );

  return (
    <div data-testid="git-item-hero">
      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }} data-testid="git-item-title">
        {title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400" data-testid="git-status-line">
        {statusKind !== null && (
          <Chip size="sm" tone={GIT_STATE_TONE[state]} data-testid="git-status-state">
            {GIT_STATE_LABEL[state]}
          </Chip>
        )}
        <span>{kindLabel}</span>
        {repoName && (
          <span className="inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3" /> in {repoLabel}
          </span>
        )}
        {agent && (
          <Chip size="sm" tone="slate" icon={Bot} title={`Filed by ${agent}, an agent`} data-testid="git-item-agent">
            agent
          </Chip>
        )}
        {comments > 0 && (
          <span className="inline-flex items-center gap-1" data-testid="git-item-comments">
            <MessageSquare className="h-3 w-3" /> {comments} {comments === 1 ? "comment" : "comments"}
          </span>
        )}
      </div>
      {labels.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1" data-testid="git-item-labels">
          {labels.map((l) => (
            <Chip key={l} size="sm" tone="slate">{l}</Chip>
          ))}
        </div>
      )}

      {/* A pull request's facts: where it comes from, how much it carries, how to fetch it. */}
      {event.kind === 1618 && (branch || commits > 0 || clone) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300" data-testid="git-pr-facts">
          {branch && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 font-mono text-[11px]">
              <GitBranch className="h-3 w-3" /> {branch}
              {target && <span className="text-slate-400"> → {target}</span>}
            </span>
          )}
          {commits > 0 && (
            <span className="inline-flex items-center gap-1">
              <GitCommitHorizontal className="h-3.5 w-3.5" /> {commits} {commits === 1 ? "commit" : "commits"}
            </span>
          )}
          {clone && (
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(clone).catch(() => {})}
              title="Copy clone URL"
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 transition-colors"
              data-testid="git-pr-clone"
            >
              <span className="truncate">{clone.replace(/^https?:\/\//, "")}</span>
            </button>
          )}
        </div>
      )}

      {/* The body. */}
      {patch ? (
        <div className="mt-4" data-testid="git-item-body">
          {(patch.author || patch.date || patch.commit) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400" data-testid="git-patch-meta">
              {patch.author && <span className="font-medium text-slate-700 dark:text-slate-200">{patch.author}</span>}
              {patch.date && <span>{patch.date}</span>}
              {patch.commit && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <GitCommitHorizontal className="h-3.5 w-3.5" /> {patch.commit.slice(0, 7)}
                </span>
              )}
            </div>
          )}
          {patch.message && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200" data-testid="git-patch-message">
              {patch.message}
            </p>
          )}
          {patch.diff && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs text-slate-500 dark:text-slate-400" data-testid="git-patch-summary">
                {patch.files} {patch.files === 1 ? "file" : "files"} changed, <span className="text-emerald-600 dark:text-emerald-400">+{patch.added}</span>{" "}
                <span className="text-rose-600 dark:text-rose-400">−{patch.removed}</span>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 font-mono text-[12px] leading-5" data-testid="git-patch-diff">
                {(diffOpen ? patch.diff.split("\n") : patch.diff.split("\n").slice(0, DIFF_FOLD)).map((line, i) => {
                  const kind = line.startsWith("+++") || line.startsWith("---") ? "file" : line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : line.startsWith("@@") ? "hunk" : line.startsWith("diff --git") ? "file" : "context";
                  const cls =
                    kind === "added"
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : kind === "removed"
                        ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300"
                        : kind === "hunk"
                          ? "text-sky-700 dark:text-sky-300"
                          : kind === "file"
                            ? "font-semibold text-slate-700 dark:text-slate-200"
                            : "text-slate-600 dark:text-slate-300";
                  return (
                    <div key={i} className={`-mx-3 px-3 ${cls}`} data-line={kind}>
                      {line || " "}
                    </div>
                  );
                })}
              </pre>
              {!diffOpen && patch.diff.split("\n").length > DIFF_FOLD && (
                <button type="button" onClick={() => setDiffOpen(true)} className="mt-1.5 text-xs font-medium text-slate-500 hover:text-brand-link" data-testid="git-patch-diff-more">
                  Show the full diff ({patch.diff.split("\n").length - DIFF_FOLD} more lines)
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        event.content?.trim() && (
          <div className="mt-3" data-testid="git-item-body">
            <MarkdownBody text={event.content} />
          </div>
        )
      )}
    </div>
  );
}
