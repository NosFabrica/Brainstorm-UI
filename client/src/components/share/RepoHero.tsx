/**
 * The repo page (kind 30617 on /e) — the git counterpart to AppHero:
 * identity + description from the announcement event, clone/web links,
 * a publisher row (who maintains this), and the live NIP-34 activity
 * feed — the "is anyone working on this?" signal nostrhub doesn't have.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";
import { ExternalLink, FolderGit2, GitBranch, GitFork } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { Chip } from "@/components/ui/chip";
import { eventPath } from "@/lib/shareId";
import { fetchGitCommentCounts, fetchGitStatuses, fetchRepoActivity, fetchRepoCounts, fetchRepoForks, kind0ToSearchResult, type RepoCounts } from "@/services/search";
import { repoLineageOf } from "@/lib/gitStatus";
import { Favicon } from "@/components/share/LinkPreview";
import { GIT_STATE_LABEL, GIT_STATE_TONE, gitAgentOf, gitItemLabel, gitStateOf, peopleBeforeAgents } from "@/lib/gitStatus";
import { MessageSquare } from "lucide-react";

// Structural minimum (EventPage hands heroes MinimalEvent, which has no sig).
type RepoEvent = {
  pubkey: string;
  tags: string[][];
  content: string;
  created_at: number;
};

function tagVal(event: RepoEvent, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

function ago(at: number): string {
  const days = Math.floor((Date.now() / 1000 - at) / 86400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Store-first publisher profile, one relay fallback — AppHero's move. */
function usePublisher(pubkey: string): SearchResult | null {
  const known = eventStore.getReplaceable(0, pubkey);
  const [fetched, setFetched] = useState<SearchResult | null>(null);
  useEffect(() => {
    if (known) return;
    let alive = true;
    void fetchProfileMap([pubkey]).then((map) => {
      const profile = map.get(pubkey);
      if (alive && profile) {
        setFetched(
          kind0ToSearchResult({
            kind: 0, pubkey, content: JSON.stringify(profile),
            tags: [], created_at: 0, id: "", sig: "",
          } as NostrEvent),
        );
      }
    });
    return () => {
      alive = false;
    };
  }, [known, pubkey]);
  if (known) return kind0ToSearchResult(known as NostrEvent);
  return fetched;
}

export function RepoHero({ event }: { event: RepoEvent }) {
  const d = tagVal(event, "d");
  const name = tagVal(event, "name") ?? d ?? "Unnamed repo";
  const description = tagVal(event, "description");
  const clone = tagVal(event, "clone");
  const web = tagVal(event, "web");
  const source = tagVal(event, "source");
  const forkedFrom = tagVal(event, "forkedFrom");
  const lineage = repoLineageOf(event);
  const hostOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  };
  /** "spearson78/gitnostr" for a GitHub-shaped URL, else the host. */
  const repoPathOf = (url: string) => {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/^\/+|\/+$|\.git$/g, "");
      return path.split("/").length >= 2 ? path.split("/").slice(0, 2).join("/") : u.hostname;
    } catch {
      return url;
    }
  };

  const [activity, setActivity] = useState<NostrEvent[]>([]);

  const [activityAuthors, setActivityAuthors] = useState<Map<string, { name?: string; displayName?: string; bot?: boolean }>>(new Map());
  const [activityStatuses, setActivityStatuses] = useState<Map<string, { kind: number; at: number }>>(new Map());
  const [activityComments, setActivityComments] = useState<Map<string, number>>(new Map());
  const [activityOpen, setActivityOpen] = useState(false);
  const address = d ? `30617:${event.pubkey}:${d}` : null;
  useEffect(() => {
    if (!address) return;
    let alive = true;
    void fetchRepoActivity(address).then(async (items) => {
      if (!alive) return;
      // Who filed each one — the profile says "agent" when the event does not.
      const pubkeys = [...new Set(items.map((i) => i.pubkey))];
      const profiles = pubkeys.length ? await fetchProfileMap(pubkeys).catch(() => new Map()) : new Map();
      if (!alive) return;
      const authors = new Map<string, { name?: string; displayName?: string; bot?: boolean }>();
      for (const [pk, c] of profiles as Map<string, { name?: string; display_name?: string; bot?: boolean }>) {
        authors.set(pk, { name: c.name, displayName: c.display_name, bot: c.bot === true });
      }
      setActivityAuthors(authors);
      // People's items first, agents' after — nothing hidden, each marked.
      setActivity(peopleBeforeAgents(items, (i) => ({ event: i, author: authors.get(i.pubkey) })));
      // What became of each, and how much talk it drew — one request each for the page.
      const ids = items.map((i) => i.id);
      if (ids.length) {
        void fetchGitStatuses(ids).then((m) => {
          if (alive) setActivityStatuses(m);
        });
        void fetchGitCommentCounts(ids).then((m) => {
          if (alive) setActivityComments(m);
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [address]);

  // The numbers: issues, patches, who contributed, when anything last happened.
  const [counts, setCounts] = useState<RepoCounts | null>(null);
  useEffect(() => {
    if (!address) return;
    let alive = true;
    void fetchRepoCounts(address).then((c) => {
      if (alive) setCounts(c);
    });
    return () => {
      alive = false;
    };
  }, [address]);
  // Forks on Nostr — announcements sharing this repo's earliest commit.
  const [forks, setForks] = useState<NostrEvent[]>([]);
  useEffect(() => {
    if (!address || !lineage) return;
    let alive = true;
    void fetchRepoForks(lineage, address).then((f) => {
      if (alive) setForks(f);
    });
    return () => {
      alive = false;
    };
  }, [address, lineage]);
  const contributors = counts?.contributors ?? [];
  const faces = contributors.slice(0, 3);
  const hasNumbers = !!counts && (counts.issues > 0 || counts.patches > 0 || contributors.length > 0 || !!counts.lastAt);

  const publisher = usePublisher(event.pubkey);
  const scoreOf = useAuthorScores([event.pubkey, ...faces]);
  const tierRing = useTierRing();
  let publisherNpub = "";
  try {
    publisherNpub = nip19.npubEncode(event.pubkey);
  } catch {
    /* malformed pubkey — row renders without a link target */
  }

  return (
    <div data-testid="repo-hero">
      {/* Identity flush left, repo glyph top-right — the app page's anatomy. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>
            {name}
          </h1>
          {publisherNpub && (
            <Link
              href={`/p/${publisherNpub}`}
              className="mt-0.5 inline-flex items-center gap-1.5 rounded-full py-0.5 pr-1.5 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
              data-testid="repo-hero-publisher"
            >
              <Avatar
                className={`h-[18px] w-[18px] border border-slate-200/80 dark:border-slate-800/80 ${tierRing(scoreOf(event.pubkey) ?? publisher?.wotRank ?? null, false, "sm", true) ?? ""}`}
              >
                {publisher?.picture ? <AvatarImage src={publisher.picture} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium text-brand-link">
                {publisher ? getDisplayLabel(publisher) : `${publisherNpub.slice(0, 12)}…`}
              </span>
            </Link>
          )}
          {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 break-words">{description}</p>}
          {/* Where it came from and where it went. */}
          {(forkedFrom || forks.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {forkedFrom && (
                <span className="inline-flex items-center gap-1" data-testid="repo-hero-fork-of">
                  <GitFork className="h-3 w-3" /> Fork of{" "}
                  <a href={forkedFrom} target="_blank" rel="noopener" className="font-medium text-brand-link hover:underline">
                    {repoPathOf(forkedFrom)}
                  </a>
                </span>
              )}
              {forks.length > 0 && (
                <Link href={`/?q=${encodeURIComponent(name)}&t=repos`} className="inline-flex items-center gap-1 hover:text-brand-link transition-colors" data-testid="repo-hero-forks">
                  <GitFork className="h-3 w-3" /> {forks.length} {forks.length === 1 ? "fork" : "forks"} on Nostr
                </Link>
              )}
            </div>
          )}
        </div>
        {/* The corner is decorative only while there is nothing to say. */}
        {!hasNumbers && (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800 shadow-sm" data-testid="repo-hero-glyph">
            <FolderGit2 className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          </div>
        )}
      </div>

      {/* Is it alive, and who is behind it — the numbers the card already has,
          one strip, the app page's anatomy. */}
      {hasNumbers && counts && (
        <div className="mt-3 grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 sm:grid-cols-4" data-testid="repo-hero-stats">
          <div className="px-3 py-2">
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">{counts.issues}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{counts.issues === 1 ? "issue" : "issues"}</div>
          </div>
          <div className="px-3 py-2">
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">{counts.patches}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{counts.patches === 1 ? "patch" : "patches"}</div>
          </div>
          <div className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="flex -space-x-1.5">
                {faces.map((pk) => (
                  <Avatar key={pk} className={`h-5 w-5 border border-white dark:border-slate-900 ${tierRing(scoreOf(pk) ?? null, false, "sm", true) ?? ""}`} data-testid={`repo-hero-contributor-${pk}`}>
                    <AvatarFallback className="overflow-hidden">
                      <DefaultAvatarImg />
                    </AvatarFallback>
                  </Avatar>
                ))}
              </span>
              <span className="text-base font-bold text-slate-900 dark:text-slate-100">{contributors.length}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{contributors.length === 1 ? "contributor" : "contributors"}</div>
          </div>
          <div className="px-3 py-2">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{counts.lastAt ? "active" : "activity"}</div>
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">{counts.lastAt ? ago(counts.lastAt) : "none yet"}</div>
          </div>
        </div>
      )}

      {/* Actions: browse the code, or take the clone URL. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {web && (
          <a
            href={web}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            data-testid="repo-hero-web"
          >
            Browse code <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {source && hostOf(source) && (
          <a
            href={source}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-accent/40 transition-colors"
            data-testid="repo-hero-source"
          >
            <Favicon host={hostOf(source)!} className="h-3.5 w-3.5 rounded-sm" /> Source <span className="font-normal text-slate-400">· {hostOf(source)}</span>
          </a>
        )}
        {clone && (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(clone).catch(() => {})}
            title="Copy clone URL"
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 hover:border-brand-accent/40 transition-colors"
            data-testid="repo-hero-clone"
          >
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="truncate">{clone.replace(/^https?:\/\//, "")}</span>
          </button>
        )}
      </div>

      {/* The live NIP-34 feed: issues and patches referencing this repo. */}
      {activity.length > 0 && (
        <div className="mt-5" data-testid="repo-hero-activity">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recent activity · {activity.length}
          </div>
          <ul className="mt-2 space-y-1">
            {(activityOpen ? activity : activity.slice(0, 8)).map((item) => (
              <li key={item.id}>
                <Link
                  href={eventPath(item)}
                  className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  data-testid={`repo-activity-${item.id}`}
                >
                  <Chip size="sm" tone={item.kind === 1617 || item.kind === 1618 ? "info" : "warning"}>
                    {gitItemLabel(item.kind)}
                  </Chip>
                  {(() => {
                    const st = gitStateOf(activityStatuses.get(item.id)?.kind, item.kind);
                    return (
                      <Chip size="sm" tone={GIT_STATE_TONE[st]} data-testid={`repo-activity-state-${item.id}`}>
                        {GIT_STATE_LABEL[st]}
                      </Chip>
                    );
                  })()}
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                    {item.tags.find((t) => t[0] === "subject")?.[1] ?? item.content.slice(0, 80) ?? "Untitled"}
                  </span>
                  {gitAgentOf(item, activityAuthors.get(item.pubkey)) && (
                    <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500" title={`Filed by ${gitAgentOf(item, activityAuthors.get(item.pubkey))}, an agent`} data-testid={`repo-activity-agent-${item.id}`}>
                      agent
                    </span>
                  )}
                  {(activityComments.get(item.id) ?? 0) > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-slate-400 dark:text-slate-500" title={`${activityComments.get(item.id)} comments`} data-testid={`repo-activity-comments-${item.id}`}>
                      <MessageSquare className="h-3 w-3" /> {activityComments.get(item.id)}
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{ago(item.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {!activityOpen && activity.length > 8 && (
            <button
              type="button"
              onClick={() => setActivityOpen(true)}
              className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-brand-link transition-colors"
              data-testid="repo-activity-more"
            >
              Show {activity.length - 8} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
