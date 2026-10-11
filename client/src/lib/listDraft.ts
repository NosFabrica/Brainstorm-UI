/**
 * A list of one's own, as a draft and as the header it becomes — List
 * Management (components/lists). The draft is an own version's
 * (lib/conceptCopy) and the same form edits it (DefinitionForm); what differs
 * is the header around it:
 *
 * - its own `d`, a slug of its name until it's published, fixed after (a new
 *   `d` is a new list);
 * - a `b` pointing at itself, as a canonical concept's does (Avi's headers,
 *   Tapestry's shared-concept search) — unless it already has a `b`, which
 *   stays: a copy edited here is still a copy;
 * - every tag the form doesn't speak kept as it was when an existing list is
 *   edited (`r`, `license`, `item-kind`, `alt`, …): editing never drops what
 *   it can't show. `client` is the one exception — signing stamps a fresh one.
 *
 * And the preview: the list's definition built from the draft, and an example
 * item from values typed for its fields, so the real renderers draw it
 * (ADR 0004) — plus what each URL template expands to, spelled out.
 */
import { definitionTags, type CopyDraft, type EventTemplate } from "@/lib/conceptCopy";
import { resolveConcept, type ConceptDefinition, type ResolvedConcept } from "@/lib/conceptResolution";
import { NO_HINTS } from "@/lib/displayHints";
import { expandTemplate, templatePlaceholders, type UrlTemplate } from "@/lib/linkTemplates";

/** Tags the form writes, so an edit replaces rather than keeps them. `b` is handled on its own. */
const WRITTEN = new Set([
  "d",
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

const NOBODY = "0".repeat(64);

export function newListDraft(): CopyDraft {
  return {
    singular: "",
    plural: "",
    description: "",
    fields: [],
    display: { ...NO_HINTS, facts: [], listImage: "" },
    links: [],
  };
}

/** A published list as a draft: every field its own, so each can be renamed or dropped. */
export function listDraftOf(def: ConceptDefinition): CopyDraft {
  const { title, summary, image, link, media, location, facts, listImage } = def.display;
  return {
    singular: def.singular,
    plural: def.plural,
    description: def.description ?? "",
    fields: def.fields.map((f) => ({
      name: f.name,
      enabled: true,
      requirement: f.requirement,
      origin: "custom",
      type: f.type,
      description: f.description,
    })),
    display: {
      title,
      summary,
      image,
      link,
      media,
      location,
      facts: facts.map((f) => ({ field: f.field, label: f.label ?? "" })),
      listImage: listImage ?? "",
    },
    links: def.links.map((l) => ({ ...l, bindings: l.bindings.map(([p, f]) => [p, f] as [string, string]) })),
  };
}

/** A `d` from a list's name: lower case, words joined by hyphens (as tags' slugs are). */
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The list's header as an unsigned event. `previous` is the version being
 * edited, if any: its other tags are kept, and its `b`, if it has one.
 */
export function listHeaderTemplate(
  draft: CopyDraft,
  { d, author, previous }: { d: string; author: string; previous?: { tags: string[][] } | null },
): EventTemplate {
  const before = previous?.tags ?? [];
  const typed = new Set(before.filter((t) => t[0] === "field-type" && t[1] && t[2]).map((t) => t[1]));
  const kept = before.filter((t) => !WRITTEN.has(t[0]) && t[0] !== "b");
  const pointers = before.filter((t) => t[0] === "b");
  return {
    kind: 39998,
    content: "",
    tags: [
      ["d", d],
      ...definitionTags(draft, typed),
      ...kept,
      ...(pointers.length ? pointers : [["b", `39998:${author}:${d}`, "pointer"]]),
    ],
  };
}

/** What stops a list from publishing, beyond the draft's own problems (conceptCopy draftProblems). */
export function listProblems(d: string): string[] {
  return d.trim() ? [] : ["Give the list an identifier (its d tag)."];
}

/** The definition a header template makes, resolved as a reader with no copy of it would see it. */
export function previewDefinition(template: EventTemplate, author: string | null): ResolvedConcept {
  const header = {
    id: NOBODY,
    pubkey: author ?? NOBODY,
    kind: 39998,
    created_at: Math.floor(Date.now() / 1000),
    tags: template.tags,
  };
  const d = template.tags.find((t) => t[0] === "d")?.[1] ?? "";
  return resolveConcept({ community: header, communityCoordinate: `39998:${header.pubkey}:${d}` })!;
}

/** Example values, one per field name: renaming a field leaves its old value behind. */
export type ExampleValues = Record<string, string>;

/** An item on the list carrying the example values for the fields the definition declares. */
export function exampleItem(def: ConceptDefinition, values: ExampleValues, author: string | null) {
  return {
    id: "e".repeat(64),
    pubkey: author ?? NOBODY,
    kind: 39999,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    sig: "",
    tags: [
      ["d", "example"],
      ["z", def.coordinate],
      ...def.fields.flatMap((f) => (values[f.name]?.trim() ? [[f.name, values[f.name].trim()]] : [])),
    ],
  };
}

export interface LinkReadout {
  templateId: string;
  /** The template's name and text, once it's been read. */
  name: string | null;
  template: string | null;
  /** Each placeholder, the field it's bound to, and that field's value on the item. */
  bindings: { placeholder: string; field: string; value: string | null }[];
  /** The address it builds, or why there's none. */
  href: string | null;
  problem: "loading" | "invalid" | "missing" | null;
}

/** What each of a definition's links expands to for an item — the raw URLs behind its link buttons. */
export function linkReadouts(
  def: ConceptDefinition,
  item: { tags: string[][] },
  templates: Map<string, UrlTemplate>,
): LinkReadout[] {
  const valueOf = (field: string) => item.tags.find((t) => t[0] === field)?.[1]?.trim() || null;
  return def.links.map((ref) => {
    const tpl = templates.get(ref.templateId) ?? null;
    const bindings = ref.bindings.map(([placeholder, field]) => ({ placeholder, field, value: valueOf(field) }));
    const base = { templateId: ref.templateId, name: tpl?.name ?? null, template: tpl?.template ?? null, bindings };
    if (!tpl) return { ...base, href: null, problem: "loading" as const };
    if (!templatePlaceholders(tpl.template)) return { ...base, href: null, problem: "invalid" as const };
    const values = Object.fromEntries(bindings.map((b) => [b.placeholder, b.value]));
    const href = expandTemplate(tpl.template, values);
    return { ...base, href, problem: href ? null : ("missing" as const) };
  });
}
