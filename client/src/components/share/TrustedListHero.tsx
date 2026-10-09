/**
 * A Trusted List of people (kind 30392 on /e) — a follow set with its
 * provenance. Each one is a tag's carriers as one perspective's web of trust
 * ranks them: the title and description, which tag it was built from and by
 * whom, whose perspective ranked it, the knobs it was built with, then the
 * people, best first, each with their 0–100 score on the tag.
 *
 * Everything is read from the tags. The content repeats the members as JSON
 * (with endorsement and dispute counts); the page does not read it.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { ShieldCheck } from "lucide-react";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { SetRoster } from "@/components/share/FollowSetHero";
import { readTrustedList } from "@/lib/trustedList";

// Structural minimum (EventPage hands heroes MinimalEvent, which has no sig).
type ListEvent = {
  pubkey: string;
  tags: string[][];
  content: string;
  created_at: number;
};

function npubOf(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return "";
  }
}

/** "tag-membership" → "Tag membership". */
const metricLabel = (metric: string) => {
  const words = metric.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function TrustedListHero({ event }: { event: ListEvent }) {
  const list = useMemo(() => readTrustedList(event), [event]);
  const pubkeys = useMemo(() => list.members.map((m) => m.pubkey), [list]);
  const scores = useMemo(() => new Map(list.members.map((m) => [m.pubkey, m.score])), [list]);
  const people = useMemo(
    () => [list.perspective, list.sourceTag?.authorPubkey].filter((pk): pk is string => !!pk),
    [list],
  );
  const profiles = useLiveProfiles(people);
  const nameOf = (pk: string) => {
    const p = profiles.get(pk);
    return p?.display_name || p?.name || `${npubOf(pk).slice(0, 12)}…`;
  };
  const scored = list.members.some((m) => m.score !== null);

  return (
    <div data-testid="trusted-list-hero">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <EmojiText text={list.title} tags={event} />
            </h1>
            <Chip size="sm" tone="info">
              {pubkeys.length} {pubkeys.length === 1 ? "member" : "members"}
            </Chip>
          </div>
          {list.description && (
            <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">
              <EmojiText text={list.description} tags={event} />
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <ShieldCheck className="h-5 w-5 text-slate-400 dark:text-slate-500" />
        </div>
      </div>

      {/* Where the list comes from: the tag, and whose web of trust ranked it. */}
      {(list.sourceTag || list.perspective) && (
        <dl className="mt-3 space-y-1 text-sm" data-testid="trusted-list-provenance">
          {list.sourceTag && (
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="text-slate-500 dark:text-slate-400">Built from the tag</dt>
              <dd className="min-w-0">
                <Link
                  href={`/tags/${npubOf(list.sourceTag.authorPubkey)}/${encodeURIComponent(list.sourceTag.slug)}`}
                  className="font-medium text-brand-primary hover:underline dark:text-brand-link"
                  data-testid="trusted-list-source-tag"
                >
                  {list.sourceTag.slug}
                </Link>
                <span className="text-slate-500 dark:text-slate-400"> by </span>
                <Link
                  href={`/p/${npubOf(list.sourceTag.authorPubkey)}`}
                  className="font-medium text-slate-800 hover:underline dark:text-slate-100"
                >
                  {nameOf(list.sourceTag.authorPubkey)}
                </Link>
              </dd>
            </div>
          )}
          {list.perspective && (
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="text-slate-500 dark:text-slate-400">Ranked through the web of trust of</dt>
              <dd className="min-w-0">
                <Link
                  href={`/p/${npubOf(list.perspective)}`}
                  className="font-medium text-slate-800 hover:underline dark:text-slate-100"
                  data-testid="trusted-list-perspective"
                >
                  {nameOf(list.perspective)}
                </Link>
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* The build, as published — a reader comparing two copies of a list
          wants to see why they differ. */}
      {(list.metric || list.params.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="trusted-list-params">
          {list.metric && <Chip tone="slate">{metricLabel(list.metric)}</Chip>}
          {list.params.map(([label, value]) => (
            <Chip key={label} tone="slate">
              {label} <span className="font-semibold tabular-nums">{value}</span>
            </Chip>
          ))}
        </div>
      )}

      {/* The people, best first, each with their score on the tag. */}
      <SetRoster
        members={pubkeys}
        trailing={
          scored
            ? (pk) => {
                const score = scores.get(pk);
                return score === null || score === undefined ? null : (
                  <span
                    className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200"
                    title={`Score ${score} of 100 on this tag`}
                    data-testid={`trusted-list-score-${pk}`}
                  >
                    {score}
                  </span>
                );
              }
            : undefined
        }
      />
    </div>
  );
}
