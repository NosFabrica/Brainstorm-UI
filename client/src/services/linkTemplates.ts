/**
 * URL templates, fetched (lib/linkTemplates). By id for a header's links —
 * an id names one frozen event, so an answer is kept for the session — and
 * by list for the link picker's choices: every item filed under the URL
 * Templates concept.
 *
 * Asked of our index and, beside it, the header's relay hints and the tag
 * hub (services/listReads). A template that can't
 * be found is simply no link; its author may have deleted it.
 */
import { templateOf, templatePlaceholders, type LinkRef, type UrlTemplate } from "@/lib/linkTemplates";
import { URL_TEMPLATES_CONCEPT, dictionaryRelays } from "@/config/dictionary";
import { readListEvents } from "@/services/listReads";
import { listHeaders, loadConceptItems, loadDictionary, type DictionaryReader } from "@/services/dictionary";

const TIMEOUT_MS = 8000;
const byId = new Map<string, UrlTemplate>();

/** The templates these links pin, by id. Only well-formed templates are kept. */
export async function fetchTemplates(refs: LinkRef[]): Promise<Map<string, UrlTemplate>> {
  const missing = [...new Set(refs.map((r) => r.templateId))].filter((id) => !byId.has(id));
  if (missing.length) {
    const relays = [...new Set([...refs.map((r) => r.relay).filter(Boolean), ...dictionaryRelays()])];
    const events = await readListEvents([{ ids: missing }], TIMEOUT_MS, relays);
    for (const ev of events as { id: string; pubkey: string; tags: string[][] }[]) {
      const tpl = templateOf(ev);
      if (tpl && templatePlaceholders(tpl.template)) byId.set(ev.id, tpl);
    }
  }
  return new Map(refs.flatMap((r) => (byId.has(r.templateId) ? [[r.templateId, byId.get(r.templateId)!]] : [])));
}

/**
 * Every well-formed template in the reader's URL Templates list, newest first.
 * URL Templates is just another Dictionary concept: the list read is its
 * governing one for this reader — their copy, their Assistant's, Brainstorm's,
 * else the community's (ADR 0004) — and its items are the ones filed under
 * that chain (services/dictionary).
 */
export async function fetchAvailableTemplates(reader: DictionaryReader): Promise<UrlTemplate[]> {
  if (!URL_TEMPLATES_CONCEPT) return [];
  const [entry] = await loadDictionary(reader, [URL_TEMPLATES_CONCEPT], undefined, { items: false });
  const events = await loadConceptItems(listHeaders(URL_TEMPLATES_CONCEPT, entry?.resolved ?? null));
  const out: UrlTemplate[] = [];
  for (const ev of events) {
    const tpl = templateOf(ev);
    if (tpl && templatePlaceholders(tpl.template)) {
      byId.set(ev.id, tpl);
      out.push(tpl);
    }
  }
  return out;
}

/** Test seam. */
export function __resetTemplateCache(): void {
  byId.clear();
}
