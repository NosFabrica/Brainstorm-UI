/**
 * A list's Items tab: every item filed under it (useListItems), checked under
 * a definition of the list (lib/listHealth), as a health summary, a table and,
 * for the one item the address names, a side panel. Read-only: it publishes
 * nothing.
 *
 * `&item=<event id>` opens an item, so an item has a link. It is read on every
 * render and never copied into state; opening, closing and stepping replace
 * the address, so Back leaves the list. An id the list doesn't hold opens the
 * panel to say so, once the read has settled. Every address is built from the
 * `list` value this one was opened with, so a list opened by an naddr or an
 * id stays at it.
 *
 * The check runs under the definition that governs for the reader, or another
 * one chosen (useListDefinitions), as adding an item previews under one.
 * Nothing is checked or counted until it can be said of the list: the read
 * has settled here once (items the store already held are only part of it),
 * the definitions have settled, and a definition with links has its URL
 * templates in hand, so no item is called short of a template that is only on
 * its way. Until then the tab says it is reading.
 */
import { useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { Link, useLocation, useSearch } from "wouter";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { curatorKey, shortCuratorKey } from "@/components/lists/curatorKey";
import { SOURCE_LABEL } from "@/components/lists/definitionLabels";
import { ItemInspector } from "@/components/lists/ItemInspector";
import { ItemTable } from "@/components/lists/ItemTable";
import { CutOffNotice, ListHealth } from "@/components/lists/ListHealth";
import { listManagerPath } from "@/components/lists/listManagerPath";
import { useLinkTemplates } from "@/hooks/useLinkTemplates";
import { useListDefinitions } from "@/hooks/useListDefinitions";
import { useListItems } from "@/hooks/useListItems";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import type { DefinitionSource } from "@/lib/conceptResolution";
import { headerReference } from "@/lib/dlistFields";
import type { UrlTemplate } from "@/lib/linkTemplates";
import {
  EMPTY_QUERY,
  checkList,
  filterItems,
  sortItems,
  summarize,
  type ItemQuery,
  type ItemSort,
} from "@/lib/listHealth";

/** One map for every render without templates, so the check isn't run again for want of them. */
const NO_TEMPLATES: ReadonlyMap<string, UrlTemplate> = new Map();

/** A curator by profile name, or a short npub. Never a rank. */
const curatorName = (pubkey: string, profiles: Map<string, ProfileContent>) => {
  const p = profiles.get(pubkey);
  return p?.display_name || p?.name || shortCuratorKey(pubkey);
};

export function ListItems({
  header,
  listRef,
}: {
  header: NostrEvent;
  /** The `list` value of the address this list was opened by: every address built here keeps it. */
  listRef: string;
}) {
  const openId = new URLSearchParams(useSearch()).get("item") || null;
  const [, navigate] = useLocation();
  /** To the Items tab with `item` open, or with none. */
  const show = (item?: string) => navigate(listManagerPath(listRef, { view: "items", item }), { replace: true });

  const { items, truncated, cutOff, settled, reload } = useListItems(header);
  // Whether this list's read has settled here once. Until it has, what the store already held is
  // part of the list and not the list; after it, a read in flight keeps what is on screen.
  const reference = headerReference(header) ?? header.id;
  const [readOf, setReadOf] = useState<string | null>(null);
  if (settled && readOf !== reference) setReadOf(reference);
  const readOnce = settled || readOf === reference;

  const { definitions, governing, settled: definitionsSettled } = useListDefinitions(header);
  const [chosen, setChosen] = useState<DefinitionSource | null>(null);
  const shown = definitions.find((d) => d.source === (chosen ?? governing)) ?? definitions[0];
  const def = shown.resolved.governing;
  const linkTemplates = useLinkTemplates(def.links);
  const templates = linkTemplates.data ?? NO_TEMPLATES;
  // Templates that can't be read are done without: "template not given" is then true.
  const awaitingTemplates = def.links.length > 0 && linkTemplates.data === undefined && !linkTemplates.isError;
  // A copy still on its way would change the numbers under the reader, as a template would.
  const waiting = !readOnce || !definitionsSettled || awaitingTemplates;

  const [query, setQuery] = useState<ItemQuery>(EMPTY_QUERY);
  const [sort, setSort] = useState<ItemSort>("newest");
  const [page, setPage] = useState(1);
  // Whatever changes the rows starts them from the first page again.
  const onQuery = (q: ItemQuery) => {
    setQuery(q);
    setPage(1);
  };
  const onSort = (s: ItemSort) => {
    setSort(s);
    setPage(1);
  };
  // A problem is keyed by what one definition declares, and another may not have it.
  const onDefinition = (s: DefinitionSource) => {
    setChosen(s);
    setQuery({ ...query, problem: null });
    setPage(1);
  };

  const checked = useMemo(() => (waiting ? [] : checkList(def, items, templates)), [waiting, def, items, templates]);
  const summary = useMemo(() => summarize(def, checked), [def, checked]);
  // A problem the list no longer has (another definition governs, a read took it away) filters nothing.
  const filter = useMemo(
    () =>
      query.problem !== null && !summary.problems.some((p) => p.key === query.problem)
        ? { ...query, problem: null }
        : query,
    [query, summary],
  );
  const filtered = useMemo(() => filterItems(def, checked, filter), [def, checked, filter]);
  const rows = useMemo(() => sortItems(filtered, sort), [filtered, sort]);

  const authors = useMemo(() => [...new Set(items.map((i) => i.pubkey))], [items]);
  const profiles = useLiveProfiles(authors);
  // An author with no key can't be filtered to; their items still show, with the key's fallback text.
  const curators = useMemo(
    () =>
      authors
        .filter((pubkey) => curatorKey(pubkey) !== "")
        .map((pubkey) => ({ pubkey, name: curatorName(pubkey, profiles) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [authors, profiles],
  );

  // The open item is looked for among every item, so a link to one opens it whatever
  // the table is filtered to; its neighbours are the rows the table is showing.
  const entry = openId ? (checked.find((c) => c.item.id === openId) ?? null) : null;
  const at = openId ? rows.findIndex((c) => c.item.id === openId) : -1;

  return (
    <div className="space-y-6" data-testid="list-items">
      {/* The switch and Read again stay put through every state, so neither is lost from under a press. */}
      {definitionsSettled && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {definitions.length > 1 && (
            <div className="space-y-1.5">
              <Label>Check it as</Label>
              <Tabs value={shown.source} onValueChange={(v) => onDefinition(v as DefinitionSource)}>
                <TabsList className="flex-wrap" aria-label="Check it as">
                  {definitions.map((d) => (
                    <TabsTrigger key={d.source} value={d.source} data-testid={`list-items-as-${d.source}`}>
                      {SOURCE_LABEL[d.source]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={reload} disabled={!settled} data-testid="list-items-reload">
              {settled ? <RefreshCw /> : <Loader2 className="animate-spin" />}
              Read again
            </Button>
          </div>
        </div>
      )}

      {items.length > 0 && !waiting ? (
        <>
          <ListHealth
            summary={summary}
            truncated={truncated}
            cutOff={cutOff}
            activeProblem={filter.problem}
            onProblem={(problem) => onQuery({ ...filter, problem })}
          />

          <section className="space-y-3">
            <SectionHeader kicker="Items" />
            <ItemTable
              rows={rows}
              total={items.length}
              partial={truncated || cutOff}
              singular={def.singular}
              curators={curators}
              query={filter}
              onQuery={onQuery}
              sort={sort}
              onSort={onSort}
              page={page}
              onPage={setPage}
              onOpen={show}
            />
          </section>
        </>
      ) : items.length === 0 && settled && definitionsSettled ? (
        <div className="space-y-3" data-testid="list-items-empty">
          {/* ListHealth is not drawn for no items, and a read cut off short of its answer may be empty only for that. */}
          {cutOff && <CutOffNotice />}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No items found for this list on the hub or our index.
          </p>
          <Link
            href={listManagerPath(listRef, { view: "add" })}
            className="inline-block text-sm font-medium text-brand-link underline-offset-4 hover:underline"
          >
            Add an item
          </Link>
        </div>
      ) : (
        <p
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
          data-testid="list-items-reading"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the list's items…
        </p>
      )}

      {/* An id not found says so only once the read has settled: until then it may yet arrive. */}
      <ItemInspector
        open={openId !== null && !waiting && (entry !== null || settled)}
        entry={entry}
        resolved={shown.resolved}
        curatorName={entry ? curatorName(entry.item.pubkey, profiles) : ""}
        onClose={() => show()}
        onPrev={at > 0 ? () => show(rows[at - 1].item.id) : null}
        onNext={at >= 0 && at < rows.length - 1 ? () => show(rows[at + 1].item.id) : null}
      />
    </div>
  );
}
