import { useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { AllResults } from "@/components/search/AllResults";
import { FacetChip, FacetRow } from "@/components/search/sections";
import { TagFacets } from "@/components/search/TagFacets";
import { useResultTags } from "@/hooks/useResultTags";
import { fetchNamedTagRows, namedTagCount, type NamedTag } from "@/services/namedTags";
import { fetchAddressableEvents } from "@/services/nostr";
import type { SearchHit } from "@/services/search";
import { headerNames } from "@/lib/dlistFields";
import { groupOf } from "@/lib/tagTabGroups";
import type { TrustObserver } from "@/services/tags";

/**
 * A tag's tab in All's row: everything carrying the tag, people and things alike, most vouched
 * first — with a chip for each kind of thing among them (People, GitHub Accounts, Notes) to
 * keep just that kind, and the other tags they carry as filters, as All's own results offer theirs.
 * Everything carrying the tag is loaded, so a filter here is over the whole of it.
 */
export function TagTabResults({
  tag,
  scoreOf,
  query,
  observer,
}: {
  tag: NamedTag;
  scoreOf: (pubkey: string) => number | null | undefined;
  query: string;
  observer: TrustObserver;
}) {
  const [rows, setRows] = useState<{ key: string; events: NostrEvent[] } | null>(null);
  useEffect(() => {
    let current = true;
    void fetchNamedTagRows(tag).then((events) => {
      if (current) setRows({ key: tag.key, events });
    });
    return () => {
      current = false;
    };
  }, [tag]);
  const loaded = useMemo(() => (rows?.key === tag.key ? rows.events : null), [rows, tag.key]);

  // The other tags they carry (hooks/useResultTags), one pressed at a time; the tab's own is on every row.
  const all = useMemo<SearchHit[]>(
    () => (loaded ?? []).map((event) => ({ event, author: null, rank: null })),
    [loaded],
  );
  const resultTags = useResultTags(all, { observer, enabled: true });
  const otherTags = useMemo(() => resultTags.tags.filter((t) => t.key !== tag.key), [resultTags.tags, tag.key]);
  const [tagPressed, setTagPressed] = useState<string | null>(null);
  useEffect(() => setTagPressed(null), [tag.key]);
  const tagged = useMemo(
    () => (tagPressed ? all.filter((h) => resultTags.byHit.get(h.event.id)?.has(tagPressed)) : all),
    [all, tagPressed, resultTags.byHit],
  );

  // Each row's kind of thing, the commonest first; a list's named by its header, once read.
  const [groupPressed, setGroupPressed] = useState<string | null>(null);
  useEffect(() => setGroupPressed(null), [tag.key]);
  const [listNames, setListNames] = useState<Map<string, string>>(new Map());
  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; name: string; header?: string; n: number }>();
    for (const { event } of tagged) {
      const g = groupOf(event);
      const held = byKey.get(g.key);
      if (held) held.n++;
      else byKey.set(g.key, { ...g, n: 1 });
    }
    // A pressed kind that the pressed tag leaves none of stays, so it can be let go.
    if (groupPressed && !byKey.has(groupPressed)) {
      const held = (loaded ?? []).find((e) => groupOf(e).key === groupPressed);
      if (held) byKey.set(groupPressed, { ...groupOf(held), n: 0 });
    }
    return [...byKey.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [tagged, loaded, groupPressed]);
  useEffect(() => {
    const headers = groups.flatMap((g) => (g.header && !listNames.has(g.header) ? [g.header] : []));
    if (!headers.length) return;
    let current = true;
    void fetchAddressableEvents(
      headers.map((h) => {
        const [kind, pubkey, ...d] = h.split(":");
        return { kind: Number(kind), pubkey, identifier: d.join(":") };
      }),
    )
      .then((found) => {
        if (!current) return;
        setListNames((names) => {
          const next = new Map(names);
          for (const h of headers) {
            const header = found.get(h);
            next.set(h, header ? headerNames(header).plural : (groups.find((g) => g.header === h)?.name ?? h));
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [groups, listNames]);

  const hits = useMemo(
    () => (groupPressed ? tagged.filter((h) => groupOf(h.event).key === groupPressed) : tagged),
    [tagged, groupPressed],
  );
  const count = namedTagCount(tag);
  // What carries the tag counts whether or not its event could be found: the tag says so.
  const missing = loaded ? count - loaded.length : 0;
  const narrowed = !!groupPressed || !!tagPressed;

  return (
    <div data-testid="tag-tab-results">
      {(groups.length > 1 || !!groupPressed) && (
        <FacetRow className="mb-2" testId="tag-tab-kinds">
          <FacetChip pressed={!groupPressed} onClick={() => setGroupPressed(null)} testId="tag-tab-kind-all">
            All
          </FacetChip>
          {groups.map((g) => (
            <FacetChip
              key={g.key}
              pressed={groupPressed === g.key}
              onClick={() => setGroupPressed(groupPressed === g.key ? null : g.key)}
              count={g.n}
              testId={`tag-tab-kind-${(g.header ? (listNames.get(g.header) ?? g.name) : g.name).toLowerCase().replace(/\s+/g, "-")}`}
            >
              {g.header ? (listNames.get(g.header) ?? g.name) : g.name}
            </FacetChip>
          ))}
        </FacetRow>
      )}
      <TagFacets
        key={tag.key}
        tags={otherTags}
        pressed={tagPressed}
        settled={resultTags.settled}
        onPress={(t) => setTagPressed(t?.key ?? null)}
      />
      <p className="mb-2 px-1 text-xs text-slate-500 dark:text-slate-400" data-testid="tag-tab-count">
        {narrowed
          ? `${hits.length} of ${count} tagged ${tag.name}`
          : `${count} tagged ${tag.name}${missing > 0 ? ` · ${missing === 1 ? "1 isn't" : `${missing} aren't`} on the relays we can reach` : ""}`}
      </p>
      {loaded && (!tagPressed || resultTags.settled || hits.length > 0) ? (
        <AllResults hits={hits} settled scoreOf={scoreOf} query={query} />
      ) : (
        <div className="space-y-2.5" data-testid="tag-tab-loading">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-white/70 dark:border-slate-800/60 dark:bg-slate-900/70"
              style={{ animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
