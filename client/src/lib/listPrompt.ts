/**
 * Instructions for an AI to author a list header that List Management can
 * import (lib/listImport): the tag grammar — condensed from
 * docs/dictionary/dlist-presentation-conventions.md, so a model reaches for the
 * newer conventions (display roles, facts, field types, URL templates) — the
 * URL templates that exist right now with their ids, since a `link` pins one
 * by id and a model can't invent one, and the JSON to reply with.
 *
 * Copied from the editor and pasted into any chat ahead of a request; nothing
 * here calls a model.
 */
import type { UrlTemplate } from "@/lib/linkTemplates";

const FORMAT = `{
  "d": "books",
  "tags": [
    ["names", "Book", "Books"],
    ["description", "Books worth reading"],
    ["required", "title", "Title"],
    ["recommended", "author", "Author"],
    ["display", "title", "title"],
    ["display", "summary", "author"]
  ],
  "example": { "title": "Dune", "author": "Frank Herbert" },
  "notes": []
}`;

export function listAuthoringPrompt(templates: UrlTemplate[], relay: string): string {
  const available = templates.length
    ? templates.map((t) => `- ${t.id} — ${t.name} — ${t.template}`).join("\n")
    : '(none yet: describe any link you\'d want in "notes")';
  return `You're helping author a list for Brainstorm, a Nostr app. A list is a Decentralized List header: a Nostr event of kind 39998 whose tags say what its items (kind 39999 events) record and how they read. Reply with one JSON object in a \`\`\`json block, shaped like this, and nothing else:

${FORMAT}

- "d": the list's identifier — lowercase words joined by hyphens.
- "tags": the header's tags, below.
- "example": a realistic example item, a value for every field you declare.
- "notes": anything you couldn't do, such as a link no template below can build. An empty array if none.

The tags:

- ["names", "<Singular>", "<Plural>"] and ["description", "<what the list is>"].
- One per thing an item records: ["required" | "recommended" | "optional", "<field>", "<description>"]. A field's name is the tag an item carries it in: lowercase, hyphenated, no spaces, and not d, z or b. Its description is a short label ("Website", "ISBN-13"): it labels the field's link. Require only what every item must have.
- A field's type, when it isn't plain text: ["field-type", "<field>", "url" | "address"]. url: its values are web addresses, shown as links. address: its values name another Nostr list or event as kind:pubkey:d, shown by that event's name.
- How an item reads. Each names one declared field, once per role:
  ["display", "title", "<field>"] — the item's name.
  ["display", "summary", "<field>"] — the line under its name.
  ["display", "image", "<field>"] — its picture (a url field).
  ["display", "link", "<field>"] — its own page elsewhere (a url field).
  ["display", "media", "<field>"] — a playable file (a url field whose values end in .mp3, .mp4, …).
  ["display", "location", "<field>"] — where it is, as a geohash (call the field "g", as NIP-52 does).
- Facts: other fields worth listing on an item's page as "label: value" — as many as are useful, in order: ["display", "fact", "<field>", "<Label>"].
- The list's own icon: ["image", "<https URL>"]. A Twemoji pinned by version works well: https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/<codepoint>.svg (📚 is 1f4da).
- Links built from URL templates: ["link", "<template id>", "${relay}", "<placeholder>", "<field>", …] — the template's id, then each of its {placeholders} paired with the declared field whose value fills it. Use only the templates below, by their ids; never invent an id. A placeholder's field should hold exactly what the template expects (an ISBN-10 for {isbn10}, a username for {username}).

URL templates available (id — name — template):
${available}

Every hint, fact, type and link must name a field the tags declare. Don't put "d" or "b" tags in "tags".

The list I want:
`;
}
