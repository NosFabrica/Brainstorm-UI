# Renderers read the governing concept, never the community header directly

**Status:** accepted, 2026-10-01

A Decentralized List item, such as a GitHub account, says nothing about how to show
itself. Its header does. The item is filed under a kind-39998 header with a `z` tag, and
the header declares the fields its items carry (`lib/dlistFields.ts`). The header is
also a **concept**. When many people use one header, it is a **community concept**.
Anyone can hold a **local copy** of it: a header of their own that carries
`["b", <community coordinate>, "pointer"]`. A user's Brainstorm Assistant authors their
copies (Settings › Dictionary; `docs/dictionary/ADMIN-ASKS.md`).

Today nobody can edit their copy. A copy repeats the community's names, description and
fields, so rendering straight from the community header gives the right answer. It
would also make every copy decorative, and that would be forgotten. The day a copy can
say "my GitHub accounts also have a display name", a renderer that reads the community
header would still draw the community's fields. Nothing would look broken, and
decentralized concepts would quietly never have shipped.

## Decision

Rendering a concept goes through one resolution step,
`resolveConcept` in `lib/conceptResolution.ts`. Nothing renders from a header it fetched
for itself.

1. **Which definition governs:**
   1. the reader's personally signed copy;
   2. else their Tapestry Assistant's copy;
   3. else Brainstorm's own copy (the house's: `houseConceptAuthors` in
      `config/dictionary.config.json`);
   4. else the community header itself.

   This is tapestry's dual-author rule (`protocols/drafts/assistant-designation.md`)
   with the house added before the fallback. Copies from different authors are **never
   ranked by timestamp**: a stale assistant must not shadow a deliberate edit. A header
   counts as a copy only if it points at the community concept. Sharing its `d` is not
   enough.

2. **Renderers receive the governing definition**: its names and its field declarations,
   with the community definition beside it. They do not fetch headers.
3. **The reader is told how the two relate.** `agreement` is `agrees`, `differs` (and in
   what: names, description, fields), `no-local-copy` (the community governs) or `unknown`
   (the community header couldn't be fetched to compare). The Dictionary shows it as a
   chip ("Agrees with the community"), and an item page will too.
4. **Renderers are chosen by concept, along a chain.** `ResolvedConcept.chain` lists
   coordinates from the governing copy out to the community concept. A renderer
   registered for any coordinate on the chain applies, nearest first. Anything with no
   registered renderer gets the generic one, which draws the governing field declarations.

## Where this goes next (not built)

- **The server does the join.** Today the client resolves each concept on screen itself:
  the community header, the reader's copies, and the URL templates, batched per render
  and read from our relay first. When list items come back as search results, the search
  API should return each item with its resolved governing definition already attached,
  so a results page fetches nothing extra per concept. The rule stays the one above; it
  just runs next to the index.
- **Brainstorm's concepts in lockstep with its renderers.** Brainstorm publishes its own
  copy of each concept it renders and registers its renderers against that copy. A user's
  copy can then declare "I render with Brainstorm's concept", one more link on the chain,
  so out of the box every concept Brainstorm has a renderer for renders correctly, and
  anything else falls back to the generic view.
- **Pointing at someone else's definition.** The same link to another author's concept,
  for concepts Brainstorm doesn't render. In effect, a decentralized app store for
  renderers. The chain is what lets that be added without touching the renderers.
- **Divergent copies.** When users can edit their copies, the generic renderer already
  follows them. A registered renderer built for the community's fields has to decide what
  to do with a copy that differs: fall back to generic, or render what it knows and list
  the rest. `agreement` and `differences` are there for that decision.

## Consequences

- An item page costs one more read: the reader's copies of the item's concept, by
  `#b`, from the tag hub. The Dictionary already makes it, and the result is cached per
  reader.
- The anonymous reader sees Brainstorm's definition, or the community's until
  Brainstorm publishes its own. A signed-in reader with no copy sees the same.
- `differences` compares field name, requirement and type, the parts that change
  rendering, plus the concept's names and description, because that is what the reader
  reads. A field's own description is wording within the field and is not compared.
