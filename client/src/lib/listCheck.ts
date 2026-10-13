/**
 * List Management's checks as functions a script can call — tags in, plain
 * JSON out — for tools outside the app that write lists and want them held to
 * the rules the form and the renderers hold them to, by the same code.
 * Nothing here reads a relay: a caller fetches the URL templates a header's
 * links pin (`templateIds`) and passes their events in.
 *
 * - `checkHeader`: what importing the header would drop, and why
 *   (lib/listImport), and what would stop it publishing (conceptCopy
 *   `draftProblems`, listDraft `listProblems`).
 * - `checkItem`: how an item reads under a header (lib/itemPresentation), the
 *   links it builds (listDraft `linkReadouts`), and what doesn't come through
 *   — a renderer leaves those out without a word, so they're named here.
 * - `checkItemUnder`: the same check for the app, which already holds a list's
 *   definition and its templates by id; `checkItem` reads its arguments into
 *   those and calls it.
 *
 * `blocking` is the one judgment made here: the form won't publish it.
 * Weighing the rest is the caller's; `code` is stable for it.
 */
import { draftProblems } from "@/lib/conceptCopy";
import { definitionOf, type ConceptDefinition, type HeaderEvent } from "@/lib/conceptResolution";
import { fieldCell, httpUrl, undeclaredFields } from "@/lib/dlistFields";
import { presentItem, type ItemPresentation } from "@/lib/itemPresentation";
import { linkReadouts, listProblems, type LinkReadout } from "@/lib/listDraft";
import { importIntoDraft } from "@/lib/listImport";
import { templateOf, type UrlTemplate } from "@/lib/linkTemplates";

export type ProblemCode =
  // a header's
  | "unpublishable"
  | "dropped-tag"
  // an item's
  | "required-missing"
  | "untitled"
  | "not-a-url"
  | "not-an-address"
  | "not-a-phone"
  | "not-an-email"
  | "image-unusable"
  | "link-unusable"
  | "media-unusable"
  | "location-unusable"
  | "repeated"
  | "undeclared"
  | "template-not-given"
  | "template-invalid"
  | "template-unfilled";

export interface Problem {
  code: ProblemCode;
  /** The field it's about, when it's about one. */
  field: string | null;
  message: string;
  /** The form won't publish it. */
  blocking: boolean;
}

export interface HeaderCheck {
  problems: Problem[];
  /** The URL templates the header's links pin: the events to fetch for `checkItem`. */
  templateIds: string[];
}

export interface ItemCheck {
  problems: Problem[];
  /** The item as the renderers draw it, and each link it builds (a template not passed in reads as `loading`). */
  resolved: ItemPresentation & { links: LinkReadout[] };
}

const NOBODY = "0".repeat(64);

const headerOf = (tags: string[][]): HeaderEvent => ({ id: NOBODY, pubkey: NOBODY, kind: 39998, created_at: 0, tags });

/** A header's tags — its `d` among them — checked as the import would read them. */
export function checkHeader(tags: string[][]): HeaderCheck {
  const d = tags.find((t) => t[0] === "d")?.[1]?.trim() || null;
  const { draft, ignored } = importIntoDraft({ d, tags, templates: [], example: {}, notes: [] }, NOBODY);
  const blocking = [...listProblems(d ?? ""), ...draftProblems(draft)];
  return {
    problems: [
      ...blocking.map((message): Problem => ({ code: "unpublishable", field: null, message, blocking: true })),
      ...ignored.map(({ tag, why }): Problem => ({
        code: "dropped-tag",
        field: null,
        message: `${JSON.stringify(tag)} is dropped: ${why}.`,
        blocking: false,
      })),
    ],
    templateIds: [...new Set(definitionOf(headerOf(tags)).links.map((l) => l.templateId))],
  };
}

const ROLE_LOSS = { image: "no picture", link: "no link", media: "nothing to play", location: "no location" } as const;
type ValueRole = keyof typeof ROLE_LOSS;

/** An item's tags checked under a header's, with the URL template events its links pin. */
export function checkItem(
  headerTags: string[][],
  itemTags: string[][],
  templateEvents: { id: string; pubkey: string; tags: string[][] }[] = [],
): ItemCheck {
  const templates = new Map(
    templateEvents.flatMap((ev): [string, UrlTemplate][] => {
      const t = templateOf(ev);
      return t ? [[t.id, t]] : [];
    }),
  );
  return checkItemUnder(definitionOf(headerOf(headerTags)), itemTags, templates);
}

/** An item's tags checked under a list's definition, with its URL templates by id. */
export function checkItemUnder(
  def: ConceptDefinition,
  itemTags: string[][],
  templates: ReadonlyMap<string, UrlTemplate>,
): ItemCheck {
  const item = { tags: itemTags };
  const shown = presentItem(item, def);
  const links = linkReadouts(def, item, templates);
  const problems: Problem[] = [];
  const add = (code: ProblemCode, field: string | null, message: string, blocking = false) =>
    problems.push({ code, field, message, blocking });

  const missing = new Set<string>();
  for (const f of def.fields) {
    const cell = fieldCell(item, f);
    const value = cell.value?.trim();
    if (!value) {
      if (f.requirement === "required") {
        missing.add(f.name);
        add("required-missing", f.name, `${def.plural} require "${f.name}".`, true);
      }
      continue;
    }
    // A field a role reads says what the role lost; its type, only when no role already has.
    const role = (Object.keys(ROLE_LOSS) as ValueRole[]).find((r) => def.display[r] === f.name);
    if (role && shown[role] == null) {
      const why =
        role === "location"
          ? "isn't a geohash"
          : role === "media" && httpUrl(value)
            ? "doesn't end in an audio or video extension (.mp3, .mp4, …)"
            : "isn't an http(s) URL";
      add(`${role}-unusable`, f.name, `"${f.name}" ${why}, so the item has ${ROLE_LOSS[role]}.`);
    } else if (f.type === "url" && !cell.href) add("not-a-url", f.name, `"${f.name}" isn't an http(s) URL.`);
    else if (f.type === "tel" && !cell.href)
      add("not-a-phone", f.name, `"${f.name}" isn't a phone number, so it doesn't call.`);
    else if (f.type === "email" && !cell.href)
      add("not-an-email", f.name, `"${f.name}" isn't an email address, so it doesn't mail.`);
    if (f.type === "address" && !cell.address)
      add("not-an-address", f.name, `"${f.name}" doesn't name an event as kind:pubkey:d or an naddr.`);
    // A location gives a geohash per precision; anything else shows its first value only.
    if (cell.extra > 0 && f.name !== def.display.location)
      add("repeated", f.name, `"${f.name}" is given ${cell.extra + 1} times; only the first shows.`);
  }

  if (!shown.title?.trim() && !(shown.titleField && missing.has(shown.titleField)))
    add(
      "untitled",
      shown.titleField,
      shown.titleField
        ? `"${shown.titleField}", the title, is empty.`
        : `${def.plural} declare no field to title an item by.`,
    );

  for (const name of new Set(undeclaredFields(item, def.fields).map((u) => u.name)))
    add("undeclared", name, `${def.plural} don't declare "${name}": it shows apart from the list's own fields.`);

  for (const l of links) {
    const which = l.name ? `The ${l.name} link` : `The link to template ${l.templateId.slice(0, 8)}…`;
    if (l.problem === "loading")
      add("template-not-given", null, `${which} builds nothing: its template ${l.templateId} wasn't passed in.`);
    else if (l.problem === "invalid")
      add("template-invalid", null, `${which} builds nothing: its template is malformed.`);
    else if (l.problem === "missing") {
      const empty = l.bindings.filter((b) => !b.value).map((b) => `"${b.field}"`);
      const why = empty.length
        ? `${empty.join(", ")} ${empty.length > 1 ? "are" : "is"} empty`
        : "a placeholder has no field to fill it";
      add("template-unfilled", null, `${which} builds nothing: ${why}.`);
    }
  }

  return { problems, resolved: { ...shown, links } };
}
