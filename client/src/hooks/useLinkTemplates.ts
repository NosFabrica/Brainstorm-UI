import { useMemo } from "react";
import { useDraftTemplates } from "@/hooks/draftTemplates";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useConceptItems } from "@/hooks/useConceptItems";
import { useDictionaryEntries } from "@/hooks/useDictionaryEntries";
import { readTemplateEvents, templatesById } from "@/services/linkTemplates";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import { URL_TEMPLATES_CONCEPT } from "@/config/dictionary";
import type { LinkRef, UrlTemplate } from "@/lib/linkTemplates";
import type { CopyDraft } from "@/lib/conceptCopy";
import { draftTemplateProblems, templatesToPublish } from "@/lib/templateDrafts";

/** An id names one frozen event: once read, nothing to refresh. */
const FROZEN = { minMs: Infinity };

/**
 * The templates a definition's links pin (services/linkTemplates), by id. A
 * template drafted in the form (hooks/draftTemplates) answers from there; the
 * rest are template events read from the EventStore while the relays are
 * asked for them (docs/adr/0005), so one published here shows at once.
 * `data` is undefined until the ask has answered, or the store held them.
 */
export function useLinkTemplates(refs: LinkRef[]): {
  data: Map<string, UrlTemplate> | undefined;
  isPending: boolean;
  isError: boolean;
} {
  const drafts = useDraftTemplates();
  const wanted = [...new Set(refs.map((r) => r.templateId))].sort();
  const ids = wanted.filter((id) => !drafts.has(id));
  const idsKey = ids.join(",");
  const filters = useMemo(() => (ids.length ? [{ ids }] : null), [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const read = useStoreEvents(
    ids.length ? `link-templates:${idsKey}` : null,
    filters,
    () => readTemplateEvents(refs.filter((r) => !drafts.has(r.templateId))),
    FROZEN,
  );
  const held = useMemo(
    () => (ids.length && (read.settled || read.events.length === ids.length) ? templatesById(read.events) : undefined),
    // `idsKey` is `ids`, as a value: what the events are read by.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [read.events, read.settled, idsKey],
  );
  const drafted = wanted.filter((id) => drafts.has(id));
  const draftedKey = drafted.join(",");
  const data = useMemo(
    () =>
      drafted.length ? new Map([...(held ?? new Map()), ...drafted.map((id) => [id, drafts.get(id)!] as const)]) : held,
    // `draftedKey` is `drafted`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [held, drafts, draftedKey],
  );
  return { data, isPending: data === undefined, isError: false };
}

/**
 * The URL templates the link picker offers: every well-formed template in the
 * reader's governing URL Templates list, newest first. URL Templates is just
 * another Dictionary concept: its governing list for this reader — their
 * copy, their Assistant's, Brainstorm's, else the community's (ADR 0004) — is
 * resolved from the store (hooks/useDictionaryEntries), and its items are the
 * ones filed under that chain (hooks/useConceptItems). A template published
 * here lands in the store and joins them.
 */
export function useAvailableTemplates(enabled = true): { data: UrlTemplate[] | undefined; isPending: boolean } {
  const { pubkey, taPubkey, settled } = useDictionaryReader();
  const reader = useMemo(() => ({ pubkey, taPubkey }), [pubkey, taPubkey]);
  const concept = useMemo(() => (URL_TEMPLATES_CONCEPT ? [URL_TEMPLATES_CONCEPT] : []), []);
  const asking = enabled && settled && !!URL_TEMPLATES_CONCEPT;
  const list = useDictionaryEntries(reader, concept, { enabled: asking, prefix: "url-templates" });
  const entry = list.entries?.[0];
  const items = useConceptItems(entry, asking && !!entry);
  const data = useMemo(() => {
    if (enabled && settled && !URL_TEMPLATES_CONCEPT) return [];
    return items.data && [...templatesById(items.data).values()];
  }, [enabled, settled, items.data]);
  return { data, isPending: data === undefined };
}

/**
 * What stops a draft's new URL templates being published (lib/templateDrafts),
 * checked against the ones that exist — so it waits for them: a template
 * that's already there mustn't be published again for want of looking.
 */
export function useDraftTemplateProblems(draft: CopyDraft, enabled = true): string[] {
  const available = useAvailableTemplates(enabled);
  if (!templatesToPublish(draft).length) return [];
  if (available.isPending) return ["Checking the URL templates that already exist…"];
  return draftTemplateProblems(draft, available.data ?? []);
}
