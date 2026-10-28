/**
 * URL templates drafted alongside a list's definition (List Management, and
 * a Dictionary entry's "Edit"): written in the form, linked and bound like an
 * existing template, previewed live — and published, as items of the URL
 * Templates list, just before the header that pins them (lib/listPublish).
 *
 * A draft has a stand-in id, 64 hex like a real one, so its links parse and
 * preview as any other; publishing swaps in the id its signed event has.
 * Templates are kind 9999, never 39999: a header pins one by id, and an
 * addressable template could be edited out from under every list that
 * depends on it (the team, 2026-10-11).
 *
 * A draft that builds the same links as an existing template (lib/linkTemplates
 * `similarTemplates`) isn't published: the form offers the existing one.
 */
import { URL_TEMPLATES_CONCEPT } from "@/config/dictionary";
import type { CopyDraft, EventTemplate } from "@/lib/conceptCopy";
import { similarTemplates, templatePlaceholders, type UrlTemplate } from "@/lib/linkTemplates";

export interface DraftTemplate {
  /** A stand-in id until it's signed. */
  id: string;
  name: string;
  template: string;
}

export function draftTemplateId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A draft as the renderers read a template: no author yet. */
export const asTemplate = (t: DraftTemplate): UrlTemplate => ({
  id: t.id,
  pubkey: "",
  name: t.name.trim() || "New link",
  template: t.template.trim(),
});

/** The drafts a link uses with every placeholder bound to a field the draft includes: the ones to publish. */
export function templatesToPublish(draft: CopyDraft): DraftTemplate[] {
  const enabled = new Set(draft.fields.filter((f) => f.enabled).map((f) => f.name.trim()));
  const used = new Set(
    draft.links.filter((l) => l.bindings.every(([, f]) => f && enabled.has(f))).map((l) => l.templateId),
  );
  return draft.templates.filter((t) => used.has(t.id));
}

/** The draft with published templates' real ids in its links, and those drafts gone. */
export function resolveDraftTemplates(draft: CopyDraft, ids: ReadonlyMap<string, string>): CopyDraft {
  return {
    ...draft,
    links: draft.links.map((l) => ({ ...l, templateId: ids.get(l.templateId) ?? l.templateId })),
    templates: draft.templates.filter((t) => !ids.has(t.id)),
  };
}

/** A draft as an item of the URL Templates list — the shape the existing templates have. */
export function templateItem(t: DraftTemplate): EventTemplate {
  return {
    kind: 9999,
    content: "",
    tags: [
      ["z", URL_TEMPLATES_CONCEPT ?? ""],
      ["name", t.name.trim()],
      ["url-template", t.template.trim()],
      ["alt", `URL template: ${t.name.trim()}`],
    ],
  };
}

/** What stops the drafts a draft would publish, in words: unnamed, malformed, or one that already exists. */
export function draftTemplateProblems(draft: CopyDraft, existing: readonly UrlTemplate[]): string[] {
  const out: string[] = [];
  if (!URL_TEMPLATES_CONCEPT && draft.templates.length)
    out.push("No URL Templates list is configured to file a new template in.");
  const drafts = templatesToPublish(draft);
  for (const [i, t] of drafts.entries()) {
    const label = t.name.trim() || t.template.trim() || "A new URL template";
    if (!t.name.trim()) out.push(`Name the new URL template ${t.template.trim() || ""}`.trim() + ".");
    if (!templatePlaceholders(t.template.trim()))
      out.push(`${label} isn't a usable template: start with https:// and the site, then use {placeholders}.`);
    const { same } = similarTemplates(t.template, existing);
    if (same) out.push(`${label} is the same as the existing "${same.name}": use that one.`);
    else if (similarTemplates(t.template, drafts.slice(0, i).map(asTemplate)).same)
      out.push(`${label} is drafted twice: keep one.`);
  }
  return out;
}
