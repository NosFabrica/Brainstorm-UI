/**
 * Instructions for an AI to author a list header that List Management can
 * import (lib/listImport): the tag grammar — condensed from
 * docs/dictionary/dlist-presentation-conventions.md, so a model reaches for the
 * newer conventions (display roles, facts, field types, URL templates) — the
 * URL templates that exist right now with their ids, since a `link` pins one
 * by id and a model can't invent one, and the JSON to reply with.
 *
 * A link no existing template builds, the model may propose: a template in
 * "templates", which a `link` names by a `ref` of its own until the import
 * gives it a draft's id (lib/listImport); it's published with the list
 * (lib/listPublish). One that matches an existing template becomes that one.
 *
 * Copied from the editor and pasted into any chat ahead of a request; nothing
 * here calls a model.
 */
import type { UrlTemplate } from "@/lib/linkTemplates";

const format = (relay: string) => `{
  "d": "books",
  "tags": [
    ["names", "Book", "Books"],
    ["description", "Books worth reading"],
    ["required", "title", "Title"],
    ["recommended", "author", "Author"],
    ["optional", "olid", "Open Library ID"],
    ["display", "title", "title"],
    ["display", "summary", "author"],
    ["link", "open-library-work", "${relay}", "olid", "olid"]
  ],
  "templates": [
    { "ref": "open-library-work", "name": "Open Library work", "template": "https://openlibrary.org/works/{olid}" }
  ],
  "example": { "title": "Dune", "author": "Frank Herbert", "olid": "OL893415W" },
  "notes": []
}`;

export function listAuthoringPrompt(templates: UrlTemplate[], relay: string): string {
  const available = templates.length
    ? templates.map((t) => `- ${t.id} — ${t.name} — ${t.template}`).join("\n")
    : '(none yet: propose any you need in "templates")';
  return `You're helping author a list for Brainstorm, a Nostr app. A list is a Decentralized List header: a Nostr event of kind 39998 whose tags say what its items (kind 39999 events) record and how they read. Reply with one JSON object in a \`\`\`json block, shaped like this, and nothing else:

${format(relay)}

- "d": the list's identifier — lowercase words joined by hyphens.
- "tags": the header's tags, below.
- "templates": URL templates you propose, for links none of the existing ones below can build. An empty array if none.
- "example": a realistic example item, a value for every field you declare.
- "notes": anything you couldn't do. An empty array if none.

The tags:

- ["names", "<Singular>", "<Plural>"] and ["description", "<what the list is>"].
- One per thing an item records: ["required" | "recommended" | "optional", "<field>", "<description>"]. A field's name is the tag an item carries it in: lowercase, hyphenated, no spaces, and not d, z or b. Its description is a short label ("Website", "ISBN-13"): it labels the field's link. Require only what every item must have.
- A field's type, when it isn't plain text: ["field-type", "<field>", "url" | "tel" | "email" | "address"]. url: its values are web addresses, shown as links. tel: phone numbers, which call. email: email addresses, which mail. address: its values name another Nostr list or event as kind:pubkey:d, shown by that event's name. A phone number or an email address in a field left as text stays text: type it.
- How an item reads. Each names one declared field, once per role:
  ["display", "title", "<field>"] — the item's name.
  ["display", "summary", "<field>"] — the line under its name.
  ["display", "image", "<field>"] — its picture (a url field).
  ["display", "link", "<field>"] — its own page elsewhere (a url field).
  ["display", "media", "<field>"] — a playable file (a url field whose values end in .mp3, .mp4, …).
  ["display", "location", "<field>"] — where it is, as a geohash (call the field "g", as NIP-52 does).
- Facts: other fields worth listing on an item's page as "label: value" — as many as are useful, in order: ["display", "fact", "<field>", "<Label>"].
- The list's own icon: ["image", "<https URL>"]. A Twemoji pinned by version works well: https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/<codepoint>.svg (📚 is 1f4da).
- Links built from URL templates: ["link", "<template id>", "${relay}", "<placeholder>", "<field>", …] — the template's id, then each of its {placeholders} paired with the declared field whose value fills it. A placeholder's field should hold exactly what the template expects (an ISBN-10 for {isbn10}, a username for {username}). Use the templates below by their ids, and never invent an id.

When none of the templates below builds a link the list needs, propose a template in "templates": { "ref": "<a short name of your own>", "name": "<what the link opens, e.g. Open Library work>", "template": "<the URL>" }, and name it in the link by its ref where the id would go. The URL must start with https:// and the site, its {placeholders} only after the site — never in it — each a bare name of letters, digits or _: https://openlibrary.org/works/{olid}, not https://{host}/… nor {+path} or {?q}. Values are percent-encoded, so a placeholder fills one piece of the path or query, never adds slashes. Only propose a template for a site whose URL pattern you're sure of; don't propose one an existing template already builds. A proposed template becomes a permanent, shared event others can reuse: name it for what it opens, not for this list.

URL templates available (id — name — template):
${available}

Every hint, fact, type and link must name a field the tags declare. Don't put "d" or "b" tags in "tags".

The list I want:
`;
}
