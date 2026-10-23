/**
 * A list header pasted into List Management — most often what an AI wrote from
 * the instructions lib/listPrompt builds — read into the editor's draft as if
 * its form had been filled in by hand (lib/listDraft `listDraftOf`), with a
 * report of whatever didn't make it.
 *
 * It takes, leniently:
 * - `{ "d": …, "tags": [[…], …], "templates": [ … ], "example": { field: value }, "notes": [ … ] }`
 * - a bare array of tags, or a whole event (`{ "kind": 39998, "tags": … }`)
 * - any of those inside a Markdown code fence, as chats tend to reply.
 *
 * What the form can't set but a header may carry (`license`, `r`, …) is kept,
 * as editing keeps it. Pasted into a list already published, it's the paste's
 * by name (`withImported`): the paste's `license` replaces the list's, while a
 * name the paste doesn't carry stays as the list had it — an AI writing from
 * the instructions never saw the list's license.
 *
 * A `b` pointing at the list itself — whoever wrote it,
 * as long as it names the same `d` — says the paste was put forward as a
 * community concept, and ticks that choice for the list; a `b` pointing at
 * another list is dropped and said so: a list here is one's own, and one's
 * version of someone else's is made from its Dictionary entry. What a reader would ignore — a hint naming a field the
 * list doesn't declare, a role that isn't one — is dropped and said so, so an
 * AI's mistake doesn't vanish without a word.
 *
 * "templates" are URL templates the AI proposes, each named in a `link` by a
 * `ref` of its own. A proposal becomes a drafted template (lib/templateDrafts),
 * published with the list — unless an existing template builds the same links
 * (lib/linkTemplates `similarTemplates`): then the link uses that one, its
 * placeholders renamed to match. What became of each is reported.
 */
import type { CopyDraft } from "@/lib/conceptCopy";
import { definitionOf, type HeaderEvent } from "@/lib/conceptResolution";
import { DISPLAY_ROLES, FACT_ROLE } from "@/lib/displayHints";
import { httpUrl } from "@/lib/dlistFields";
import { listDraftOf, listHeaderTemplate } from "@/lib/listDraft";
import { parseCoordinate } from "@/lib/dlistFields";
import { LINK_TAG, rebind, similarTemplates, templatePlaceholders, type UrlTemplate } from "@/lib/linkTemplates";
import { asTemplate, draftTemplateId, type DraftTemplate } from "@/lib/templateDrafts";

/** A URL template an import proposes; its `link`s name it by `ref`. */
export interface ProposedTemplate {
  ref: string;
  name: string;
  template: string;
}

export interface ListImport {
  d: string | null;
  tags: string[][];
  templates: ProposedTemplate[];
  example: Record<string, string>;
  notes: string[];
}

export type ParsedImport = { ok: true; value: ListImport } | { ok: false; error: string };

const isTag = (t: unknown): t is string[] =>
  Array.isArray(t) && t.length > 0 && t.every((x) => typeof x === "string") && t[0] !== "";

/** The JSON inside a reply: a fenced block if there is one, else the text from its first { or [. */
function jsonIn(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) return fenced[1].trim();
  const start = text.search(/[[{]/);
  return start < 0 ? text.trim() : text.slice(start).trim();
}

export function parseListImport(text: string): ParsedImport {
  if (!text.trim()) return { ok: false, error: "Paste a list's tags, or the JSON an AI gave you." };
  let raw: unknown;
  try {
    raw = JSON.parse(jsonIn(text));
  } catch {
    return { ok: false, error: "That isn't JSON." };
  }
  const obj = Array.isArray(raw) ? { tags: raw } : (raw as Record<string, unknown> | null);
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.tags))
    return { ok: false, error: 'Expected a "tags" array: [["names", "Book", "Books"], …].' };
  const bad = (obj.tags as unknown[]).findIndex((t) => !isTag(t));
  if (bad >= 0) return { ok: false, error: `Tag ${bad + 1} isn't a list of strings.` };
  const tags = obj.tags as string[][];
  const d =
    (typeof obj.d === "string" && obj.d.trim()) || tags.find((t) => t[0] === "d" && t[1]?.trim())?.[1]?.trim() || null;
  const example: Record<string, string> = {};
  if (obj.example && typeof obj.example === "object" && !Array.isArray(obj.example)) {
    for (const [field, value] of Object.entries(obj.example as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") example[field] = String(value);
    }
  }
  const notes = Array.isArray(obj.notes) ? obj.notes.filter((n): n is string => typeof n === "string") : [];
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const templates = (Array.isArray(obj.templates) ? obj.templates : [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !Array.isArray(t))
    .map((t) => ({
      ref: str(t.ref) || str(t.id),
      name: str(t.name),
      template: str(t.template) || str(t["url-template"]) || str(t.url),
    }));
  return { ok: true, value: { d, tags, templates, example, notes } };
}

export interface ImportResult {
  draft: CopyDraft;
  d: string | null;
  /**
   * What the header carries as if it were the version being edited: tags the
   * form can't set (`license`, `r`, …), which it keeps, and the pasted
   * `field-type`s, so a field typed `text` on purpose stays typed.
   */
  kept: string[][];
  /** Tags dropped, each with why. */
  ignored: { tag: string[]; why: string }[];
  example: Record<string, string>;
  notes: string[];
  /** True when the paste pointed the list at itself; null when it said nothing about it. */
  selfPointer: true | null;
  /** What became of each URL template the import proposed. */
  templates: TemplateOutcome[];
}

/** A proposed template: drafted, to publish with the list; an existing one used instead; or dropped, with why. */
export type TemplateOutcome =
  | { proposed: ProposedTemplate; outcome: "new" }
  | { proposed: ProposedTemplate; outcome: "existing"; existing: UrlTemplate }
  | { proposed: ProposedTemplate; outcome: "dropped"; why: string };

/** Where a link naming a ref goes: the template's id, and the text its placeholders were named in and are now. */
interface Target {
  id: string;
  from: string;
  to: string;
}

/** The proposals, read against the templates that exist and each other. */
function adoptTemplates(proposals: ProposedTemplate[], existing: readonly UrlTemplate[]) {
  const outcomes: TemplateOutcome[] = [];
  const drafts: DraftTemplate[] = [];
  const byRef = new Map<string, Target>();
  for (const proposed of proposals) {
    const ref = proposed.ref.trim();
    const template = proposed.template.trim();
    const drop = (why: string) => outcomes.push({ proposed, outcome: "dropped", why });
    if (!ref) {
      drop("it has no ref for a link to name it by");
      continue;
    }
    if (byRef.has(ref)) {
      drop(`another proposed template is "${ref}" too`);
      continue;
    }
    if (!templatePlaceholders(template)) {
      drop("a template starts with https:// and the site, then uses {placeholders} — nothing else");
      continue;
    }
    const { same } = similarTemplates(template, existing);
    if (same) {
      byRef.set(ref, { id: same.id, from: template, to: same.template });
      outcomes.push({ proposed, outcome: "existing", existing: same });
      continue;
    }
    const twin = similarTemplates(template, drafts.map(asTemplate)).same;
    if (twin) {
      byRef.set(ref, { id: twin.id, from: template, to: twin.template });
      drop(`it's the same as "${twin.name}", also proposed: its links use that one`);
      continue;
    }
    const id = draftTemplateId();
    drafts.push({ id, name: proposed.name.trim(), template });
    byRef.set(ref, { id, from: template, to: template });
    outcomes.push({ proposed, outcome: "new" });
  }
  return { outcomes, drafts, byRef };
}

/** A link naming a proposed template by ref, naming its id instead — placeholders renamed for an existing one. */
function relink(tag: string[], byRef: ReadonlyMap<string, Target>): string[] {
  const target = tag[0] === LINK_TAG ? byRef.get(tag[1]) : undefined;
  if (!target) return tag;
  const pairs: [string, string][] = [];
  for (let i = 3; i + 1 < tag.length; i += 2) pairs.push([tag[i], tag[i + 1]]);
  const bindings = target.from === target.to ? pairs : rebind(target.from, target.to, pairs).filter(([, f]) => f);
  return [LINK_TAG, target.id, tag[2] ?? "", ...bindings.flat()];
}

/** The tags the editor's form writes or the list manages itself (its `d`, its `b`). */
const FORM_TAGS = new Set([
  "d",
  "b",
  "names",
  "description",
  "required",
  "recommended",
  "optional",
  "allowed",
  "disallowed",
  "field-type",
  "display",
  "link",
  "image",
  "client",
]);

const sameTag = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Why a reader drops a tag the import gave — the rules lib/displayHints, lib/linkTemplates and dlistFields hold. */
function whyDropped(tag: string[], declared: Set<string>): string {
  const [name, a, b] = tag;
  if (name === "display") {
    if (a !== FACT_ROLE && !DISPLAY_ROLES.includes(a as never)) return `"${a}" isn't a display role`;
    if (!declared.has(b)) return `"${b}" isn't a field the list declares`;
    return "another hint already has that role";
  }
  if (name === "field-type") return `"${a}" isn't a field the list declares`;
  if (name === "link") {
    if (!/^[0-9a-f]{64}$/i.test(a ?? ""))
      return `"${a}" is neither a URL template's id nor the ref of one proposed in "templates"`;
    return "every placeholder needs a field the list declares";
  }
  if (name === "image") return httpUrl(a) ? "a list has one image" : "the list's image must be an http(s) URL";
  if (name === "allowed") return "read as optional";
  if (name === "disallowed") return "the form doesn't set disallowed fields";
  if (name === "names" || name === "description")
    return `a list has one ${name === "names" ? "pair of names" : "description"}`;
  if (["required", "recommended", "optional"].includes(name)) return `"${a}" is declared twice`;
  return "the form can't set this one";
}

/** The pasted header as the editor's draft, as though its form had been filled in. */
export function importIntoDraft(
  value: ListImport,
  author: string,
  existing: readonly UrlTemplate[] = [],
): ImportResult {
  const d = value.d ?? "";
  const adopted = adoptTemplates(value.templates, existing);
  const given = value.tags.filter((t) => t[0] !== "d" && t[0] !== "b").map((t) => relink(t, adopted.byRef));
  const header: HeaderEvent = {
    id: "0".repeat(64),
    pubkey: author,
    kind: 39998,
    created_at: 0,
    tags: [["d", d], ...given],
  };
  const def = definitionOf(header);
  const read = listDraftOf(def);
  // A link to a proposed template has a binding for each of its placeholders, filled or not, as the form makes it.
  const textOf = new Map([...adopted.byRef.values()].map((t) => [t.id, t.to]));
  const links = read.links.map((l) => {
    const text = textOf.get(l.templateId);
    if (!text) return l;
    const bound = new Map(l.bindings);
    return {
      ...l,
      bindings: (templatePlaceholders(text) ?? []).map((p) => [p, bound.get(p) ?? ""] as [string, string]),
    };
  });
  const used = (id: string) => links.some((l) => l.templateId === id);
  const draft = { ...read, links, templates: adopted.drafts.filter((t) => used(t.id)) };
  const templates = adopted.outcomes.map((o): TemplateOutcome => {
    const id = adopted.byRef.get(o.proposed.ref.trim())?.id;
    return o.outcome === "new" && id && !used(id)
      ? { proposed: o.proposed, outcome: "dropped", why: "no link of the list's names it" }
      : o;
  });
  const kept = given.filter((t) => !FORM_TAGS.has(t[0]) || t[0] === "field-type");
  const made = listHeaderTemplate(draft, { d, author, previous: { tags: kept } }).tags;
  const declared = new Set(def.fields.map((f) => f.name));
  const ignored = given
    .filter((t) => FORM_TAGS.has(t[0]) && !made.some((m) => sameTag(m, t)))
    .map((tag) => ({ tag, why: whyDropped(tag, declared) }));
  // A b at the list's own d is its self-pointer, whoever wrote it; any other names another list.
  const pointers = value.tags.filter((t) => t[0] === "b" && t[1]);
  const isSelf = (t: string[]) => !!value.d && parseCoordinate(t[1])?.d === value.d;
  for (const tag of pointers.filter((t) => !isSelf(t)))
    ignored.push({
      tag,
      why: "a list here is your own: make your version of another list from its Dictionary entry",
    });
  // Example values only for fields the list declares: the preview has no input for the rest.
  const example = Object.fromEntries(Object.entries(value.example).filter(([field]) => declared.has(field)));
  return {
    draft,
    d: value.d,
    kept,
    ignored,
    example,
    notes: value.notes,
    selfPointer: pointers.some(isSelf) ? true : null,
    templates,
  };
}

/**
 * A published list's tags with an import's `kept` in place of those of the
 * same name, as the version being edited: the one way to change what the
 * form can't set. A name the import doesn't carry stays as it was.
 */
export function withImported(own: string[][], kept: string[][]): string[][] {
  const named = new Set(kept.map((t) => t[0]));
  return [...own.filter((t) => !named.has(t[0])), ...kept];
}
