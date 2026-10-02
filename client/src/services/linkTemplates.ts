/**
 * URL templates, fetched (lib/linkTemplates). By id for a header's links —
 * an id names one frozen event, so an answer is kept for the session — and
 * by list for the version tester's choices: every item filed under the URL
 * Templates concept.
 *
 * Asked of the header's relay hints and the tag hub. A template that can't
 * be found is simply no link; its author may have deleted it.
 */
import { DLIST_ITEM_KINDS, isDListItem } from "@/lib/dlistFields";
import { templateOf, templatePlaceholders, type LinkRef, type UrlTemplate } from "@/lib/linkTemplates";
import { URL_TEMPLATES_CONCEPT, dictionaryRelays } from "@/config/dictionary";
import { fetchEventsByFilter } from "@/services/nostr";

const TIMEOUT_MS = 8000;
const byId = new Map<string, UrlTemplate>();

/** The templates these links pin, by id. Only well-formed templates are kept. */
export async function fetchTemplates(refs: LinkRef[]): Promise<Map<string, UrlTemplate>> {
  const missing = [...new Set(refs.map((r) => r.templateId))].filter((id) => !byId.has(id));
  if (missing.length) {
    const relays = [...new Set([...refs.map((r) => r.relay).filter(Boolean), ...dictionaryRelays()])];
    const events = await fetchEventsByFilter({ ids: missing }, relays, TIMEOUT_MS).catch(() => []);
    for (const ev of events as { id: string; pubkey: string; tags: string[][] }[]) {
      const tpl = templateOf(ev);
      if (tpl && templatePlaceholders(tpl.template)) byId.set(ev.id, tpl);
    }
  }
  return new Map(refs.flatMap((r) => (byId.has(r.templateId) ? [[r.templateId, byId.get(r.templateId)!]] : [])));
}

/** Every well-formed template filed under the URL Templates concept, newest first. */
export async function fetchAvailableTemplates(): Promise<UrlTemplate[]> {
  if (!URL_TEMPLATES_CONCEPT) return [];
  const events = (await fetchEventsByFilter(
    { kinds: [...DLIST_ITEM_KINDS], "#z": [URL_TEMPLATES_CONCEPT], limit: 200 },
    dictionaryRelays(),
    TIMEOUT_MS,
  ).catch(() => [])) as { id: string; pubkey: string; kind: number; created_at: number; tags: string[][] }[];
  const out: UrlTemplate[] = [];
  for (const ev of events.filter(isDListItem).sort((a, b) => b.created_at - a.created_at)) {
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
