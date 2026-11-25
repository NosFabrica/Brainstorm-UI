/**
 * Cards for the kinds whose meaning is in their tags and that had none: a
 * NIP-34 status (1630–1633), a repository state (30618) and a software
 * release (30063). One card per kind for every surface that draws a card —
 * the search grid, a quote (EmbeddedKindCard), a top-page row (SerpRow) —
 * each reading the event through the one reader its page uses (lib/gitEvents,
 * lib/release), so they agree with it.
 *
 * What a card names beside its event (a status's item, a state's or a
 * release's app) is asked in the page's batch (services/refBatch): a page of
 * cards is one request, not one per card.
 */
import { memo, useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { GitBranch, Package, Tag } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { KindPill } from "@/components/ui/kind-pill";
import { AuthorRow, CardShell } from "@/components/search/cards";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useReleaseAssets } from "@/hooks/useReleaseAssets";
import type { EventRef } from "@/lib/activity";
import { gitStatusLabel, gitStatusState, readGitStatus, readRepoState, shortCommit } from "@/lib/gitEvents";
import { gitItemTitleOf } from "@/lib/gitPatch";
import { GIT_STATE_TONE } from "@/lib/gitStatus";
import { formatBytes } from "@/lib/formatBytes";
import { parseATag } from "@/lib/noteRefs";
import type { SearchResult } from "@/lib/profileSearch";
import { platformFamilies, readRelease, readReleaseAsset, releaseName, runtimeOf } from "@/lib/release";
import { fetchRefBatched } from "@/services/refBatch";

type CardProps = { event: NostrEvent; author: SearchResult | null; score?: number | null };

/** One event a card names, from the store, asked in the page's batch. */
function useNamedEvent(ref: EventRef | null): NostrEvent | undefined {
  const filters = useMemo(() => {
    if (ref?.id) return [{ ids: [ref.id] }];
    const a = ref?.addr ? parseATag(ref.addr) : null;
    return a ? [{ kinds: [a.kind], authors: [a.pubkey], "#d": [a.identifier] }] : null;
  }, [ref?.id, ref?.addr]);
  const key = ref ? `card-ref:${ref.id ?? ref.addr}` : null;
  const found = useStoreEvents(key, filters, () => (ref ? fetchRefBatched(ref) : Promise.resolve([])));
  // The newest version of an address.
  return found.events.reduce<NostrEvent | undefined>(
    (best, e) => (!best || e.created_at > best.created_at ? e : best),
    undefined,
  );
}

const nameTag = (ev: NostrEvent | undefined) => ev?.tags.find((t) => t[0] === "name")?.[1]?.trim() || null;
const addrName = (addr: string | null | undefined) => addr?.split(":").slice(2).join(":") || null;

/** A status: what it set, on which issue, patch or PR, in which repo. */
export const GitStatusCard = memo(function GitStatusCard({ event, author, score }: CardProps) {
  const status = useMemo(() => readGitStatus(event), [event]);
  const target = useNamedEvent(status.target);
  const state = gitStatusState(status, target?.kind);
  const repo = addrName(status.repo ?? target?.tags.find((t) => t[0] === "a" && t[1]?.startsWith("30617:"))?.[1]);
  return (
    <CardShell event={event} testId={`git-status-card-${event.id}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Chip size="sm" tone={GIT_STATE_TONE[state]} data-testid={`git-status-card-pill-${event.id}`}>
          {gitStatusLabel(status, target?.kind)}
        </Chip>
        <p
          className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
          data-testid={`git-status-card-target-${event.id}`}
        >
          {target ? gitItemTitleOf(target) : status.target ? "An issue or patch" : "Status"}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        {repo && <span className="truncate">↳ in {repo}</span>}
        {status.mergeCommit && <span className="font-mono">merged as {shortCommit(status.mergeCommit)}</span>}
      </div>
      {status.note && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{status.note}</p>}
      <div className="mt-2">
        <AuthorRow
          author={author}
          score={score}
          created_at={event.created_at}
          trailing={<KindPill event={event} mixed={false} />}
        />
      </div>
    </CardShell>
  );
});

/** A repository state: the repo, HEAD, and how many branches and tags — the newest few named. */
export const RepoStateCard = memo(function RepoStateCard({ event, author, score }: CardProps) {
  const state = useMemo(() => readRepoState(event), [event]);
  const repo = useNamedEvent(useMemo(() => ({ addr: state.repo }), [state.repo]));
  const name = nameTag(repo) ?? (state.repoId || "A repository");
  return (
    <CardShell event={event} testId={`repo-state-card-${event.id}`}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
        <KindPill event={event} mixed={false} />
      </div>
      <div
        className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"
        data-testid={`repo-state-card-facts-${event.id}`}
      >
        {state.head && (
          <Chip size="sm" tone="slate" icon={GitBranch}>
            {state.head}
          </Chip>
        )}
        <span>
          {state.branches.length} {state.branches.length === 1 ? "branch" : "branches"} · {state.tags.length}{" "}
          {state.tags.length === 1 ? "tag" : "tags"}
        </span>
        {state.tags.slice(0, 3).map((t) => (
          <Chip key={t.name} size="sm" tone="info" icon={Tag}>
            {t.name}
          </Chip>
        ))}
      </div>
      <div className="mt-2">
        <AuthorRow author={author} score={score} created_at={event.created_at} />
      </div>
    </CardShell>
  );
});

/** A release: the app and version, its channel, and its files by what they run on. */
export const ReleaseCard = memo(function ReleaseCard({ event, author, score }: CardProps) {
  const release = useMemo(() => readRelease(event), [event]);
  const app = useNamedEvent(
    useMemo(() => (release.app ? { addr: release.app.address, relay: release.app.relay } : null), [release]),
  );
  const { assets } = useReleaseAssets(release);
  const files = useMemo(() => assets.map((a) => readReleaseAsset(a)), [assets]);
  const appName = nameTag(app) ?? addrName(release.app?.address);
  // What it runs on: NIP-82's platforms, else what each file's MIME type implies (NIP-82 Appendix C).
  const runtimes = [
    ...new Set([
      ...platformFamilies(release.platforms),
      ...files.flatMap((f) => (f.platforms.length ? platformFamilies(f.platforms) : (runtimeOf(f.mime) ?? []))),
    ]),
  ];
  const biggest = files.reduce((n, f) => Math.max(n, f.size ?? 0), 0);
  return (
    <CardShell event={event} testId={`release-card-${event.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p
              className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
              data-testid={`release-card-title-${event.id}`}
            >
              {appName ? `${appName} ${releaseName(release)}` : releaseName(release)}
            </p>
            {release.channel && (
              <Chip size="sm" tone={release.channel === "main" ? "success" : "warning"}>
                {release.channel}
              </Chip>
            )}
          </div>
          <p
            className="mt-1 text-[11px] text-slate-500 dark:text-slate-400"
            data-testid={`release-card-files-${event.id}`}
          >
            {[
              `${release.assets.length} ${release.assets.length === 1 ? "file" : "files"}`,
              runtimes.slice(0, 4).join(", ") || null,
              biggest ? `up to ${formatBytes(biggest)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {release.notes && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{release.notes}</p>
          )}
          <div className="mt-2">
            <AuthorRow
              author={author}
              score={score}
              created_at={event.created_at}
              trailing={<KindPill event={event} mixed={false} />}
            />
          </div>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
          <Package className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
      </div>
    </CardShell>
  );
});
