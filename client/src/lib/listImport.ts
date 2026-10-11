/**
 * A list header pasted into List Management — most often what an AI wrote from
 * the instructions lib/listPrompt builds — read into the editor's draft as if
 * its form had been filled in by hand (lib/listDraft `listDraftOf`), with a
 * report of whatever didn't make it.
 *
 * It takes, leniently:
 * - `{ "d": …, "tags": [[…], …], "example": { field: value }, "notes": [ … ] }`
 * - a bare array of tags, or a whole event (`{ "kind": 39998, "tags": … }`)
 * - any of those inside a Markdown code fence, as chats tend to reply.
 *
 * What the form can't set but a header may carry (`license`, `r`, …) is kept,
 * as editing keeps it. A `b` pointing at the list itself — whoever wrote it,
 * as long as it names the same `d` — says the paste was put forward as a
 * community concept, and ticks that choice for the list; a `b` pointing at
 * another list is dropped and said so: a list here is one's own, and one's
 * version of someone else's is made from its Dictionary entry. What a reader would ignore — a hint naming a field the
 * list doesn't declare, a role that isn't one — is dropped and said so, so an
 * AI's mistake doesn't vanish without a word.
 */
import type { CopyDraft } from "@/lib/conceptCopy";
import { definitionOf, type HeaderEvent } from "@/lib/conceptResolution";
import { DISPLAY_ROLES, FACT_ROLE } from "@/lib/displayHints";
import { httpUrl } from "@/lib/dlistFields";
import { listDraftOf, listHeaderTemplate } from "@/lib/listDraft";
import { parseCoordinate } from "@/lib/dlistFields";

export interface ListImport {
  d: string | null;
  tags: string[][];
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
  return { ok: true, value: { d, tags, example, notes } };
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
    if (!/^[0-9a-f]{64}$/i.test(a ?? "")) return "a link pins a URL template by its 64-hex event id";
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
export function importIntoDraft(value: ListImport, author: string): ImportResult {
  const d = value.d ?? "";
  const given = value.tags.filter((t) => t[0] !== "d" && t[0] !== "b");
  const header: HeaderEvent = {
    id: "0".repeat(64),
    pubkey: author,
    kind: 39998,
    created_at: 0,
    tags: [["d", d], ...given],
  };
  const def = definitionOf(header);
  const draft = listDraftOf(def);
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
  };
}
