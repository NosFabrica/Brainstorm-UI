/**
 * A reader's own version of a community concept, as a draft and as the
 * event it becomes — the grammar behind "Publish my own version" in the
 * Dictionary (offered per concept by config `ownVersion`; begun 2026-10-01 as a demo,
 * likely the seed of a general list editor).
 *
 * The event is a local copy (lib/conceptResolution): a kind-39998 at the
 * community concept's `d`, signed by the reader, pointing back with
 * `["b", <community coordinate>, "pointer"]`. Its fields are whatever the
 * reader chose; the renderer draws items from them (ADR 0004), so turning
 * on `description` makes every item page show it, and making it required
 * flags the items that lack it.
 *
 * The form follows dlist-ui's create-list (dlist-ui.netlify.app), minus
 * "from list", contexts, and the allowed / recommended / disallowed levels:
 * a field here is required or optional.
 *
 * Withdrawing replaces the copy rather than deleting it: the same coordinate
 * republished with `["b", "b-tag-deferred"]` — Tapestry's reserved value for
 * "considered, chose none" (inherit-from.md § The b tag) — in place of its
 * pointer. Every reader that knows the vocabulary treats it as dispositioned,
 * never as a copy; replaceable state is surer than a NIP-09 deletion relays
 * may or may not honour (the hub does take kind 5); and it says a decision was
 * made, where a header with no `b` looks like one that never was a copy.
 */
import { httpUrl, undeclaredFields, type FieldDecl } from "@/lib/dlistFields";
import { displayHintTags } from "@/lib/displayHints";
import { linkTags, type LinkRef } from "@/lib/linkTemplates";
import { B_DEFERRED, type ConceptDefinition } from "@/lib/conceptResolution";

/** Where a row in the form came from. */
export type FieldOrigin = "definition" | "items" | "custom";

export interface DraftField {
  name: string;
  required: boolean;
  /** Part of the version being published. */
  enabled: boolean;
  origin: FieldOrigin;
  /** For a field seen on items: how many carry it. */
  seenOn?: number;
  /** The field's value type — `text` unless set (`url`: its values are links). */
  type?: string;
}

/** The provisional display hints (lib/displayHints) as the form holds them. */
export interface DraftDisplay {
  title: string | null;
  summary: string | null;
  image: string | null;
  link: string | null;
  media: string | null;
  /** As typed; published only when it's an http(s) URL. */
  listImage: string;
}

export interface CopyDraft {
  singular: string;
  plural: string;
  description: string;
  fields: DraftField[];
  display: DraftDisplay;
  /** Provisional URL-template links (lib/linkTemplates); a binding with no field yet is "". */
  links: LinkRef[];
}

export interface EventTemplate {
  kind: number;
  content: string;
  tags: string[][];
}

type TaggedItem = { tags: string[][] };

/** Tags an item's `d`/`z` say where it lives; `b` is a header's. Never fields. */
const RESERVED = new Set(["d", "z", "b"]);
const FIELD_NAME = /^\S+$/;

/**
 * Fields the items carry that the definition doesn't declare, with how many
 * items carry each — most used first, ties by first appearance.
 */
export function fieldsSeenOnItems(items: TaggedItem[], declared: FieldDecl[]): { name: string; count: number }[] {
  const seen = new Map<string, { count: number; first: number }>();
  let order = 0;
  for (const item of items) {
    for (const name of new Set(undeclaredFields(item, declared).map((f) => f.name))) {
      const cur = seen.get(name);
      if (cur) cur.count += 1;
      else seen.set(name, { count: 1, first: order++ });
    }
  }
  return [...seen]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .map(([name, { count }]) => ({ name, count }));
}

/**
 * The form's starting point: the reader's current version when they have
 * one, else the community's. Every field the community declares gets a row
 * (on when the starting version has it); fields the items carry come next,
 * off unless the starting version declares them; anything else the
 * starting version declares follows as a custom row.
 */
export function initialDraft(
  community: ConceptDefinition,
  current: ConceptDefinition | null,
  items: TaggedItem[],
): CopyDraft {
  const base = current ?? community;
  const inBase = new Map(base.fields.map((f) => [f.name, f]));
  const seen = fieldsSeenOnItems(items, community.fields);
  const rows: DraftField[] = [];
  for (const f of community.fields) {
    const own = inBase.get(f.name);
    rows.push({
      name: f.name,
      enabled: !!own,
      required: (own ?? f).requirement === "required",
      origin: "definition",
      type: (own ?? f).type,
    });
  }
  for (const { name, count } of seen) {
    const own = inBase.get(name);
    rows.push({
      name,
      enabled: !!own,
      required: own?.requirement === "required",
      origin: "items",
      seenOn: count,
      type: own?.type ?? "text",
    });
  }
  const listed = new Set(rows.map((r) => r.name));
  for (const f of base.fields) {
    if (!listed.has(f.name))
      rows.push({
        name: f.name,
        enabled: true,
        required: f.requirement === "required",
        origin: "custom",
        type: f.type,
      });
  }
  const { title, summary, image, link, media, listImage } = base.display;
  return {
    singular: base.singular,
    plural: base.plural,
    description: base.description ?? "",
    fields: rows,
    display: { title, summary, image, link, media, listImage: listImage ?? "" },
    links: base.links.map((l) => ({ ...l, bindings: l.bindings.map(([p, f]) => [p, f] as [string, string]) })),
  };
}

/** What stops a draft from publishing, in words; empty when it can go. */
export function draftProblems(draft: CopyDraft): string[] {
  const out: string[] = [];
  if (!draft.singular.trim() || !draft.plural.trim()) out.push("Give the concept a singular and a plural name.");
  const names = draft.fields.filter((f) => f.enabled).map((f) => f.name.trim());
  if (names.some((n) => !n)) out.push("Every field needs a name.");
  const bad = names.filter((n) => n && (!FIELD_NAME.test(n) || RESERVED.has(n)));
  if (bad.length) out.push(`Not a field name: ${[...new Set(bad)].join(", ")} (no spaces; d, z and b are taken).`);
  const dupes = names.filter((n, i) => n && names.indexOf(n) !== i);
  if (dupes.length) out.push(`Listed twice: ${[...new Set(dupes)].join(", ")}.`);
  const listImage = draft.display.listImage.trim();
  if (listImage && !httpUrl(listImage)) out.push("The list image must be an http(s) URL.");
  if (draft.links.some((l) => l.bindings.some(([, f]) => !f))) out.push("Every link placeholder needs a field.");
  const enabled = new Set(names);
  const unused = draft.links.flatMap((l) => l.bindings.map(([, f]) => f)).filter((f) => f && !enabled.has(f));
  if (unused.length) out.push(`A link uses a field this version doesn’t include: ${[...new Set(unused)].join(", ")}.`);
  return out;
}

/**
 * The copy as an unsigned event. Fields in the form's order; a field the
 * community typed keeps its `field-type`, verbatim.
 */
export function copyTemplate(community: ConceptDefinition, draft: CopyDraft): EventTemplate {
  const d = community.event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  const typed = new Map(
    community.event.tags.filter((t) => t[0] === "field-type" && t[1] && t[2]).map((t) => [t[1], t]),
  );
  const tags: string[][] = [
    ["d", d],
    ["names", draft.singular.trim(), draft.plural.trim()],
  ];
  if (draft.description.trim()) tags.push(["description", draft.description.trim()]);
  for (const f of draft.fields.filter((f) => f.enabled)) {
    const name = f.name.trim();
    tags.push([f.required ? "required" : "optional", name]);
    // A field the community typed keeps a type tag; any other only when it isn't plain text.
    const type = f.type ?? "text";
    if (typed.has(name) || type !== "text") tags.push(["field-type", name, type]);
  }
  // A hint may only name a field this version declares — the rule a reader holds it to.
  const enabled = new Set(draft.fields.filter((f) => f.enabled).map((f) => f.name.trim()));
  const pick = (field: string | null) => (field && enabled.has(field) ? field : null);
  tags.push(
    ...displayHintTags({
      title: pick(draft.display.title),
      summary: pick(draft.display.summary),
      image: pick(draft.display.image),
      link: pick(draft.display.link),
      media: pick(draft.display.media),
      listImage: draft.display.listImage.trim() || null,
    }),
  );
  // Links whose every placeholder has a field this version includes.
  const usable = draft.links.filter((l) => l.bindings.every(([, f]) => f && enabled.has(f)));
  const linkKey = (t: string[]) => JSON.stringify(t);
  tags.push(...linkTags(usable).filter((t, i, all) => all.findIndex((u) => linkKey(u) === linkKey(t)) === i));
  tags.push(["b", community.coordinate, "pointer"]);
  return { kind: 39998, content: "", tags };
}

/** The same coordinate, no longer a copy of anything: what withdrawing publishes. */
export function withdrawnTemplate(copy: ConceptDefinition): EventTemplate {
  const d = copy.event.tags.find((t) => t[0] === "d")?.[1] ?? "";
  return {
    kind: 39998,
    content: "",
    tags: [
      ["d", d],
      ["b", B_DEFERRED],
      ["alt", "A withdrawn concept copy: considered, and affiliated with no community concept."],
    ],
  };
}
