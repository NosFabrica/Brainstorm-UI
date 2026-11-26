/**
 * URL templates, read (lib/linkTemplates). By id for a header's links — an
 * id names one frozen event — as hooks/useLinkTemplates asks for them; the
 * link picker's choices are the items filed under the URL Templates concept
 * (hooks/useConceptItems), sifted the same way.
 *
 * Asked of our index and, beside it, the header's relay hints and the tag
 * hub (services/listReads). A template that can't
 * be found is simply no link; its author may have deleted it.
 */
import type { NostrEvent } from "nostr-tools";
import { templateOf, templatePlaceholders, type LinkRef, type UrlTemplate } from "@/lib/linkTemplates";
import { dictionaryRelays } from "@/config/dictionary";
import { readListEvents } from "@/services/listReads";

const TIMEOUT_MS = 8000;

/** The template events these links pin, by id, from our index, their relay hints and the tag hub. */
export async function readTemplateEvents(refs: LinkRef[]): Promise<NostrEvent[]> {
  const ids = [...new Set(refs.map((r) => r.templateId))];
  if (!ids.length) return [];
  const relays = [...new Set([...refs.map((r) => r.relay).filter(Boolean), ...dictionaryRelays()])];
  return readListEvents([{ ids }], TIMEOUT_MS, relays);
}

/** Of these events, the well-formed templates, by id. */
export function templatesById(events: { id: string; pubkey: string; tags: string[][] }[]): Map<string, UrlTemplate> {
  const out = new Map<string, UrlTemplate>();
  for (const ev of events) {
    const tpl = templateOf(ev);
    if (tpl && templatePlaceholders(tpl.template)) out.set(ev.id, tpl);
  }
  return out;
}
