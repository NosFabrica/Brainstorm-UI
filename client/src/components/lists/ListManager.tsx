/**
 * List Management — authoring list headers, inside Settings › Dictionary
 * (admins-only while it's new; meant for everyone). The signed-in author's
 * lists, searchable by name, description and identifier; or a particular
 * list found by pasting its address (lib/listRef). "New list" starts one.
 *
 * `?manage=lists` opens it; `&list=<coordinate>` (or `new`) opens the editor,
 * so a list and its editor have a link. `&view=items` opens a list on its
 * items and `&view=add` on adding one; `&item=<event id>` opens one item
 * there (ListItems), so an item has a link too.
 */
import { useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemComposer } from "@/components/lists/ItemComposer";
import { ListEditor } from "@/components/lists/ListEditor";
import { ListItems } from "@/components/lists/ListItems";
import { listManagerPath } from "@/components/lists/listManagerPath";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useListAt, useMyLists } from "@/hooks/useLists";
import { coordinateOf, headerNames } from "@/lib/dlistFields";
import { parseListRef } from "@/lib/listRef";

export { listManagerPath } from "./listManagerPath";

export function ListManager() {
  const list = new URLSearchParams(useSearch()).get("list");
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const mine = useMyLists(me);

  return (
    <Card className="overflow-hidden" data-testid="list-manager">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
        <Link
          href={list ? listManagerPath() : "/settings?tab=dictionary"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-link hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {list ? "Your lists" : "Dictionary"}
        </Link>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">List Management</h2>
        {!list && me && (
          <Button asChild size="sm" className="ml-auto">
            <Link href={listManagerPath("new")} data-testid="list-manager-new">
              <Plus className="mr-1 h-4 w-4" /> New list
            </Link>
          </Button>
        )}
      </div>
      <div className="p-5">
        {!me ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Sign in to author lists.</p>
        ) : list ? (
          <EditorFor list={list} me={me} mine={mine.lists} />
        ) : (
          <ListIndex me={me} mine={mine.lists} settled={mine.settled} />
        )}
      </div>
    </Card>
  );
}

function EditorFor({ list, me, mine }: { list: string; me: string; mine: NostrEvent[] }) {
  const [, navigate] = useLocation();
  const takenDs = useMemo(
    () => new Set(mine.map((ev) => ev.tags.find((t) => t[0] === "d")?.[1] ?? "").filter(Boolean)),
    [mine],
  );
  const ref = useMemo(() => (list === "new" ? null : parseListRef(list)), [list]);
  const held = ref?.type === "address" ? mine.find((ev) => coordinateOf(ev) === ref.coordinate) : undefined;
  const found = useListAt(held ? null : ref);
  const onPublished = (coordinate: string) => {
    if (list === "new") navigate(listManagerPath(coordinate), { replace: true });
  };

  if (list === "new") return <ListEditor key="new" header={null} me={me} takenDs={takenDs} onPublished={onPublished} />;
  if (!ref)
    return <p className="text-sm text-slate-500 dark:text-slate-400">That isn&rsquo;t a list&rsquo;s address.</p>;
  const header = held ?? found.header;
  if (!header)
    return found.settled ? (
      <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="list-manager-not-found">
        No list found at that address on the hub or our index.
      </p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the list…
      </p>
    );
  return (
    <PublishedList key={coordinateOf(header) ?? header.id} header={header} listRef={list} me={me} takenDs={takenDs} />
  );
}

type Mode = "definition" | "item" | "items";

/**
 * A published list: its definition (editable when it's the author's own), a
 * form to add an item to it, and its items. The address says which when it
 * names one, and choosing a tab replaces the address; without one, someone
 * else's opens on adding and one's own on its definition.
 *
 * `listRef` is the address's own `list` value, and every address built here
 * and in the Items tab keeps it. One rebuilt from the header could name a
 * list the address never did: a 9998 opened by id that carries a `d` would
 * become a coordinate no list is found by, and an naddr would lose its relay
 * hints.
 */
function PublishedList({
  header,
  listRef,
  me,
  takenDs,
}: {
  header: NostrEvent;
  listRef: string;
  me: string;
  takenDs: ReadonlySet<string>;
}) {
  const view = new URLSearchParams(useSearch()).get("view");
  const [, navigate] = useLocation();
  // The tab when the address names no view. Definition has no `view` of its own, so
  // choosing it on someone else's list, which opens on adding, is kept here.
  const [unnamed, setUnnamed] = useState<"definition" | "item">(header.pubkey === me ? "definition" : "item");
  const mode: Mode = view === "items" ? "items" : view === "add" ? "item" : unnamed;
  const choose = (next: Mode) => {
    if (next !== "items") setUnnamed(next);
    const named = next === "items" ? "items" : next === "item" ? "add" : undefined;
    navigate(listManagerPath(listRef, { view: named }), { replace: true });
  };
  return (
    <div className="space-y-5">
      <Tabs value={mode} onValueChange={(v) => choose(v as Mode)}>
        <TabsList>
          <TabsTrigger value="definition" data-testid="list-manager-mode-definition">
            Definition
          </TabsTrigger>
          <TabsTrigger value="item" data-testid="list-manager-mode-item">
            Add an item
          </TabsTrigger>
          <TabsTrigger value="items" data-testid="list-manager-mode-items">
            Items
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === "definition" ? (
        <ListEditor header={header} me={me} takenDs={takenDs} onPublished={() => {}} />
      ) : mode === "item" ? (
        <ItemComposer header={header} me={me} />
      ) : (
        <ListItems header={header} listRef={listRef} />
      )}
    </div>
  );
}

/** The words a list is found by: its names, its description, its identifier. */
const searchableText = (ev: NostrEvent) => {
  const n = headerNames(ev);
  return [n.singular, n.plural, n.description ?? "", ev.tags.find((t) => t[0] === "d")?.[1] ?? ""]
    .join(" ")
    .toLowerCase();
};

function ListIndex({ me, mine, settled }: { me: string; mine: NostrEvent[]; settled: boolean }) {
  const [query, setQuery] = useState("");
  const ref = useMemo(() => parseListRef(query), [query]);
  const pasted = useListAt(ref);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = ref
    ? pasted.header
      ? [pasted.header]
      : []
    : mine.filter((ev) => words.every((w) => searchableText(ev).includes(w)));

  return (
    <div className="space-y-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your lists, or paste a list's address (naddr, nevent, or kind:pubkey:d)"
        className="h-9"
        data-testid="list-manager-search"
      />
      {ref && !pasted.header ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="list-manager-pasted-pending">
          {pasted.settled ? "No list found at that address." : "Looking for that list…"}
        </p>
      ) : !settled && !mine.length && !ref ? (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your lists…
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="list-manager-empty">
          {mine.length ? "None of your lists match." : "You haven't published a list yet."}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="list-manager-lists">
          {shown.map((ev) => (
            <ListRow key={ev.id} header={ev} theirs={ev.pubkey !== me} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ListRow({ header, theirs }: { header: NostrEvent; theirs: boolean }) {
  const names = headerNames(header);
  const coordinate = coordinateOf(header) ?? header.id;
  const d = header.tags.find((t) => t[0] === "d")?.[1] ?? "";
  const fields = header.tags.filter((t) => ["required", "recommended", "optional", "allowed"].includes(t[0])).length;
  // A header pointing at another list is someone's own version of it.
  const copyOf = header.tags.find((t) => t[0] === "b" && t[1] && t[1] !== coordinate)?.[1];
  return (
    <li>
      <Link
        href={listManagerPath(coordinate)}
        className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-brand-accent/40"
        data-testid="list-manager-list"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{names.plural || d}</span>
            <code className="font-mono text-xs text-slate-400">{d}</code>
          </div>
          {names.description && (
            <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{names.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="slate" size="sm">
              {fields} {fields === 1 ? "field" : "fields"}
            </Chip>
            {copyOf && (
              <Chip tone="slate" size="sm">
                your version of a community list
              </Chip>
            )}
            {theirs && (
              <Chip tone="slate" size="sm">
                someone else&rsquo;s
              </Chip>
            )}
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
      </Link>
    </li>
  );
}
