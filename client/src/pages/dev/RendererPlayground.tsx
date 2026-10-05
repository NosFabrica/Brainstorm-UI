/**
 * /dev/renderers — dev only (the route exists only under `import.meta.env.DEV`,
 * so production builds don't carry it). Paste an nevent, naddr, note or hex
 * id and see one event the three ways a list item is drawn: its own page, a
 * results card, a search popup row — or all three at once. Built to iterate
 * on the Dictionary's renderers (the team, 2026-10-01); every future concept
 * renderer can be checked here the same way.
 *
 * `?id=` and `?view=` live in the URL, so a state is a link. Fetched from the
 * id's relay hints and the tag hub, where list items live.
 */
import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { nip19, type NostrEvent } from "nostr-tools";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DListItemHero } from "@/components/share/DListItemHero";
import { DListItemCard } from "@/components/dictionary/DListItemCard";
import { DListSuggestionRow } from "@/components/dictionary/DListSuggestionRow";
import { dictionaryRelays } from "@/config/dictionary";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import { dictionaryConceptOf, loadDictionary } from "@/services/dictionary";
import { eventPath } from "@/lib/shareId";

const VIEWS = ["single", "card", "popup", "all"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = {
  single: "Single view",
  card: "Results card",
  popup: "Search popup",
  all: "All three",
};

type Ref =
  | { type: "event"; id: string; relays: string[] }
  | { type: "address"; kind: number; pubkey: string; identifier: string; relays: string[] };

/** What the box holds, as something to fetch — or null. */
function parseRef(raw: string): Ref | null {
  const s = raw.trim().replace(/^nostr:/, "");
  if (/^[0-9a-f]{64}$/i.test(s)) return { type: "event", id: s.toLowerCase(), relays: [] };
  try {
    const d = nip19.decode(s);
    if (d.type === "note") return { type: "event", id: d.data, relays: [] };
    if (d.type === "nevent") return { type: "event", id: d.data.id, relays: d.data.relays ?? [] };
    if (d.type === "naddr") return { type: "address", ...d.data, relays: d.data.relays ?? [] };
  } catch {
    // not bech32
  }
  return null;
}

async function fetchRef(ref: Ref): Promise<NostrEvent | null> {
  const relays = [...new Set([...ref.relays, ...dictionaryRelays()])];
  if (ref.type === "event") return (await fetchEventsByIds([ref.id], relays))[0] ?? null;
  const found = await fetchAddressableEvents([ref], relays);
  return [...found.values()][0] ?? null;
}

export default function RendererPlayground() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const id = params.get("id") ?? "";
  const view = (VIEWS as readonly string[]).includes(params.get("view") ?? "") ? (params.get("view") as View) : "all";
  const [draft, setDraft] = useState(id);
  const go = (next: { id?: string; view?: View }) => {
    const q = new URLSearchParams({ id: next.id ?? id, view: next.view ?? view });
    navigate(`/dev/renderers?${q}`);
  };

  const ref = parseRef(id);
  const event = useQuery({
    queryKey: ["playground-event", id],
    // Parsed from the key's own `id`, so the key names everything the fetch reads.
    queryFn: () => fetchRef(parseRef(id)!),
    enabled: !!ref,
    staleTime: 60_000,
  });
  // Quick picks: the Dictionary's items, so there's always something to try.
  const picks = useQuery({
    queryKey: ["playground-picks"],
    queryFn: () => loadDictionary({ pubkey: null, taPubkey: null }),
    staleTime: 5 * 60_000,
  });
  const pickItems = (picks.data ?? []).flatMap((e) => e.items).slice(0, 12);

  return (
    <div className="min-h-page bg-[#F8FAFC] dark:bg-slate-950" data-testid="page-renderer-playground">
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="space-y-1">
          <SectionHeader kicker="Dev only" />
          <h1
            className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Renderer playground
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            One event, the three ways a list item is drawn. Paste an nevent, naddr, note or hex id.
          </p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go({ id: draft.trim() });
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="nevent1… / naddr1… / note1… / hex id"
            className="font-mono text-sm"
            data-testid="playground-input"
          />
          <Button type="submit" data-testid="playground-load">
            <Search className="mr-1 h-4 w-4" /> Load
          </Button>
        </form>

        {pickItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="playground-picks">
            <span className="text-slate-500 dark:text-slate-400">Dictionary items:</span>
            {pickItems.map((item) => {
              const nevent = eventPath(item, dictionaryRelays()).replace(/^\/e\//, "");
              const label = item.tags.find((t) => t[0] !== "d" && t[0] !== "z" && t[1])?.[1] ?? item.id.slice(0, 8);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDraft(nevent);
                    go({ id: nevent });
                  }}
                  className="rounded-full border border-border bg-card px-2.5 py-1 font-mono text-slate-700 hover:border-brand-accent/40 dark:text-slate-300"
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {!id ? null : !ref ? (
          <p className="text-sm text-slate-500" data-testid="playground-bad-id">
            That isn&rsquo;t an nevent, naddr, note or hex id.
          </p>
        ) : event.isPending ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching from {dictionaryRelays().join(", ")}…
          </p>
        ) : !event.data ? (
          <p className="text-sm text-slate-500" data-testid="playground-not-found">
            Not found on the id&rsquo;s relays or the tag hub.
          </p>
        ) : (
          <Rendered event={event.data} view={view} onView={(v) => go({ view: v })} />
        )}
      </main>
    </div>
  );
}

function Rendered({ event, view, onView }: { event: NostrEvent; view: View; onView: (v: View) => void }) {
  if (!dictionaryConceptOf(event)) {
    return (
      <Card className="p-5 text-sm text-slate-600 dark:text-slate-300" data-testid="playground-not-dlist">
        This is a kind-{event.kind} event, not an item of a Dictionary concept, so none of these renderers apply.{" "}
        <Link href={eventPath(event)} className="text-brand-link hover:underline">
          Open its page
        </Link>
        .
      </Card>
    );
  }
  const page = eventPath(event, dictionaryRelays());
  const single = (
    <div className="space-y-2">
      <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <DListItemHero event={event} />
      </div>
      <Link href={page} className="inline-flex items-center gap-1 text-xs text-brand-link hover:underline">
        Open the real page <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
  // A card at the width it gets on a results page: one cell of the tab grid.
  const card = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <DListItemCard event={event} />
    </div>
  );
  // The row as it sits in the popup: under a search box, in the dropdown panel.
  const popup = (
    <div className="max-w-xl">
      <div className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Search className="h-4 w-4" /> what someone typed…
      </div>
      <div className="mt-2 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:border-slate-800 dark:bg-slate-900">
        <DListSuggestionRow event={event} testId="playground-suggestion" />
      </div>
    </div>
  );
  return (
    <Tabs value={view} onValueChange={(v) => onView(v as View)}>
      <TabsList data-testid="playground-views">
        {VIEWS.map((v) => (
          <TabsTrigger key={v} value={v} data-testid={`playground-view-${v}`}>
            {VIEW_LABEL[v]}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="single" className="pt-4">
        {single}
      </TabsContent>
      <TabsContent value="card" className="pt-4">
        {card}
      </TabsContent>
      <TabsContent value="popup" className="pt-4">
        {popup}
      </TabsContent>
      <TabsContent value="all" className="space-y-8 pt-4">
        <section className="space-y-3">
          <SectionHeader kicker="Single view" />
          {single}
        </section>
        <section className="space-y-3">
          <SectionHeader kicker="Results card" />
          {card}
        </section>
        <section className="space-y-3">
          <SectionHeader kicker="Search popup" />
          {popup}
        </section>
      </TabsContent>
    </Tabs>
  );
}
