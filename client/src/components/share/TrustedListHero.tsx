/**
 * A Trusted List (kinds 30392–30395 on /e, lib/trustedList) — a set with its
 * provenance: the title and description, which tag it was built from and by
 * whom, whose perspective ranked it, the knobs it was built with, then the
 * members, best first, each with their 0–100 score. The kind says what the
 * members are: people (30392) as a roster, events (30393) as their cards,
 * addressable events (30394) as theirs, external ids (30395, NIP-73) as rows.
 * A list that says it is incomplete (`truncated`) or retracted says so.
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
import { ListAddresses, ListNotes } from "@/components/share/ItemListHero";
import { SectionHeader } from "@/components/ui/section-header";
import { readListItems } from "@/lib/listItems";
import { externalRef } from "@/lib/nip73";
import { addrCoord, parseATag } from "@/lib/noteRefs";
import { kindTypeLabel } from "@/lib/kindLabel";
import {
  TRUSTED_ADDRESSES_KIND,
  TRUSTED_EVENTS_KIND,
  TRUSTED_IDENTIFIERS_KIND,
  TRUSTED_PEOPLE_KIND,
  readTrustedList,
  trustedMemberNoun,
} from "@/lib/trustedList";

// Structural minimum (EventPage hands heroes MinimalEvent, which has no sig).
type ListEvent = {
  kind?: number;
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
  // The lists of things: their members read as a list of things (lib/listItems), scored by key.
  const items = useMemo(
    () => (list.kind === TRUSTED_PEOPLE_KIND ? null : readListItems({ ...event, kind: list.kind })),
    [event, list.kind],
  );
  const scoreByKey = useMemo(
    () =>
      new Map(
        list.entries.map((m) => {
          const a = list.kind === TRUSTED_ADDRESSES_KIND ? parseATag(m.value) : null;
          return [a ? addrCoord(a) : m.value, m.score];
        }),
      ),
    [list],
  );
  const count = list.entries.length;
  // brainstorm_server's tagging-target: a kind number says what was tagged, in words.
  const target = list.taggingTarget
    ? /^\d+$/.test(list.taggingTarget)
      ? kindTypeLabel(Number(list.taggingTarget))
      : list.taggingTarget
    : null;

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
            <Chip size="sm" tone="info" data-testid="trusted-list-count">
              {list.kind === TRUSTED_PEOPLE_KIND
                ? `${count} ${count === 1 ? "member" : "members"}`
                : `${count.toLocaleString()} ${trustedMemberNoun(list.kind, count)}`}
            </Chip>
            {target && (
              <Chip size="sm" tone="slate" data-testid="trusted-list-target">
                {target}
              </Chip>
            )}
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

      {/* Not the whole list, or no longer kept here: said before the members. */}
      {list.retracted && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400" data-testid="trusted-list-retracted">
          Retracted: its publisher no longer keeps this list here.
        </p>
      )}
      {!list.retracted && list.truncated && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400" data-testid="trusted-list-truncated">
          Not the whole list
          {list.truncated.total ? `: ${count.toLocaleString()} of ${list.truncated.total.toLocaleString()} shown` : ""}.
        </p>
      )}

      {/* The people, best first, each with their score on the tag. */}
      {list.kind === TRUSTED_PEOPLE_KIND && !list.retracted && (
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
      )}

      {/* The things, best first, each drawn as what it is, its score above it. */}
      {items && !list.retracted && (
        <div className="mt-5 space-y-5" data-testid="trusted-list-items">
          {list.kind === TRUSTED_EVENTS_KIND && items.notes.length > 0 && (
            <ListNotes notes={items.notes} scoreOf={(id) => scoreByKey.get(id)} />
          )}
          {list.kind === TRUSTED_ADDRESSES_KIND && items.addresses.length > 0 && (
            <ListAddresses addresses={items.addresses} scoreOf={(c) => scoreByKey.get(c)} />
          )}
          {list.kind === TRUSTED_IDENTIFIERS_KIND && list.entries.length > 0 && (
            <section className="space-y-2" data-testid="trusted-list-identifiers">
              <SectionHeader kicker="Identifiers" />
              <ul className="space-y-1">
                {list.entries.map((m) => {
                  const ref = externalRef(m.value);
                  if (!ref) return null;
                  const href = ref.href ?? (m.hint && /^https?:\/\//i.test(m.hint) ? m.hint : undefined);
                  return (
                    <li
                      key={m.value}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm"
                      data-testid="trusted-list-identifier"
                    >
                      <span className="min-w-0 truncate">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{ref.label} · </span>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener"
                            className="font-medium text-brand-link hover:underline"
                          >
                            {ref.text}
                          </a>
                        ) : (
                          <span className="font-medium text-slate-800 dark:text-slate-100">{ref.text}</span>
                        )}
                      </span>
                      {m.score !== null && (
                        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                          {m.score}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {count === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="trusted-list-empty">
              Nothing is on this list yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
