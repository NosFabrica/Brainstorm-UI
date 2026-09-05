import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { fetchGitStatuses } from "@/services/search";
import { GIT_STATE_LABEL, GIT_STATE_TONE, gitRepoNameOf, gitStateOf } from "@/lib/gitStatus";

type GitItem = { id: string; kind: number; tags: string[][] };

/**
 * At the top of an issue or patch page: what became of it (the newest
 * NIP-34 status event; none means open) and which repo it belongs to.
 */
export function GitStatusLine({ event, className = "" }: { event: GitItem; className?: string }) {
  const [statusKind, setStatusKind] = useState<number | undefined | null>(null); // null = not yet answered
  useEffect(() => {
    let alive = true;
    setStatusKind(null);
    void fetchGitStatuses([event.id]).then((m) => {
      if (alive) setStatusKind(m.get(event.id)?.kind);
    });
    return () => {
      alive = false;
    };
  }, [event.id]);
  const repo = gitRepoNameOf(event);
  const kindLabel = event.kind === 1617 ? "Patch" : "Issue";
  if (statusKind === null) return null;
  const state = gitStateOf(statusKind, event.kind);
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 ${className}`} data-testid="git-status-line">
      <Chip size="sm" tone={GIT_STATE_TONE[state]} data-testid="git-status-state">
        {GIT_STATE_LABEL[state]}
      </Chip>
      <span>{kindLabel}</span>
      {repo && (
        <span className="inline-flex items-center gap-1" data-testid="git-status-repo">
          <GitBranch className="h-3 w-3" /> in {repo}
        </span>
      )}
    </div>
  );
}
