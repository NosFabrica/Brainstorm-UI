import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Server, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_TAG_RELAYS,
  isRelayUrl,
  isTagRelayOverrideActive,
  setTagRelays,
  tagRelays,
} from "@/config/tagging";
import { resetTagCaches } from "@/services/tags";

/**
 * Where tags are read from and published to.
 *
 * `core/ACCEPTANCE.md` Hygiene requires the tag-relay list to be editable and
 * to persist, and the kit's own config file asks for the same. Changing it
 * points the app at a different tag instance, so a save clears the session
 * caches and refetches everything — otherwise the old instance's tags would
 * linger and look like the new one's.
 *
 * Deliberately plain: this is the "most people never need this" corner of
 * Settings, and a relay URL is the one place we can't avoid showing one.
 */
export function TagRelaysCard() {
  const [relays, setRelays] = useState<string[]>(() => tagRelays());
  const [custom, setCustom] = useState(isTagRelayOverrideActive());
  const [draft, setDraft] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /** Persist, drop cached reads, and refetch every tag surface on screen. */
  function commit(next: string[], message: string) {
    const applied = setTagRelays(next);
    setRelays(applied);
    setCustom(isTagRelayOverrideActive());
    resetTagCaches();
    void queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("tag"),
    });
    toast({ title: message });
  }

  function add() {
    const url = draft.trim();
    if (!url) return;
    if (!isRelayUrl(url)) {
      toast({
        title: "That doesn't look like a relay address",
        description: "Relay addresses start with wss:// — for example wss://relay.example.com",
        variant: "destructive",
      });
      return;
    }
    if (relays.some((r) => r.replace(/\/+$/, "") === url.replace(/\/+$/, ""))) {
      setDraft("");
      return; // already listed; silently no-op rather than scold
    }
    setDraft("");
    commit([...relays, url], "Relay added");
  }

  function remove(url: string) {
    const next = relays.filter((r) => r !== url);
    // Emptying the list restores the defaults rather than leaving the app with
    // nowhere to read tags from — see setTagRelays.
    commit(next, next.length ? "Relay removed" : "Back to the standard list");
  }

  return (
    <Card className="overflow-hidden" data-testid="card-tag-relays">
      <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          <Server className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-tag-relays-title"
            >
              Where tags come from
            </h2>
            {custom && (
              <Chip tone="brand" size="sm" data-testid="chip-tag-relays-custom">
                Your list
              </Chip>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The servers Brainstorm checks for tags, and sends yours to.
          </p>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <ul className="space-y-2" data-testid="list-tag-relays">
          {relays.map((url) => (
            <li
              key={url}
              className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 dark:bg-slate-900"
              data-testid="row-tag-relay"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600 dark:text-slate-300">
                {url}
              </span>
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label={`Remove ${url}`}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                data-testid="button-remove-tag-relay"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="wss://relay.example.com"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 font-mono text-xs outline-none transition-colors placeholder:font-sans placeholder:text-slate-400 focus:border-brand-primary dark:bg-slate-900"
            data-testid="input-tag-relay"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
            data-testid="button-add-tag-relay"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {custom && (
          <button
            type="button"
            onClick={() => commit([], "Back to the standard list")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-brand-deep dark:text-slate-400"
            data-testid="button-reset-tag-relays"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Use the standard list ({DEFAULT_TAG_RELAYS.length})
          </button>
        )}
      </div>
    </Card>
  );
}
