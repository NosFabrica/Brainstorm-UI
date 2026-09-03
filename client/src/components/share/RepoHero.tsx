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
import { ExternalLink, FolderGit2, GitBranch } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { eventStore } from "@/lib/eventStore";
import { fetchProfileMap } from "@/services/nostr";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { Chip } from "@/components/ui/chip";
import { eventPath } from "@/lib/shareId";
import { fetchRepoActivity, kind0ToSearchResult } from "@/services/search";

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

  const [activity, setActivity] = useState<NostrEvent[]>([]);
  const address = d ? `30617:${event.pubkey}:${d}` : null;
  useEffect(() => {
    if (!address) return;
    let alive = true;
    void fetchRepoActivity(address).then((items) => {
      if (alive) setActivity(items);
    });
    return () => {
      alive = false;
    };
  }, [address]);

  const publisher = usePublisher(event.pubkey);
  const scoreOf = useAuthorScores([event.pubkey]);
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
        </div>
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800 shadow-sm">
          <FolderGit2 className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        </div>
      </div>

      {/* Actions: browse the code, or take the clone URL. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {web && (
          <a
            href={web}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
            data-testid="repo-hero-web"
          >
            Browse code <ExternalLink className="h-3 w-3" />
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
            {activity.slice(0, 8).map((item) => (
              <li key={item.id}>
                <Link
                  href={eventPath(item)}
                  className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  data-testid={`repo-activity-${item.id}`}
                >
                  <Chip size="sm" tone={item.kind === 1617 ? "info" : "warning"}>
                    {item.kind === 1617 ? "Patch" : "Issue"}
                  </Chip>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                    {item.tags.find((t) => t[0] === "subject")?.[1] ?? item.content.slice(0, 80) ?? "Untitled"}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{ago(item.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
