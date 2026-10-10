# Rendering concepts and DList items: what a UI can read and write

**For:** anyone building a UI for Decentralized Lists (DCoSL) or Tapestry concepts:
**From:** Brainstorm-UI, which implements all of this (PR #151, 2026-10-02).
**Status:** a working description, not a ratified spec. Each convention below is marked:

| Mark               | Meaning                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| **NIP**            | In the Decentralized Lists NIP. "Working copy" means only in its unpublished working copy.          |
| **Convention**     | Written or read by at least one client (named), not in the NIP.                                     |
| **Tapestry draft** | In tapestry's `protocols/drafts/`, pre-NIP.                                                         |
| **Provisional**    | Brainstorm's own; names and shapes are expected to change once settled with the protocol's authors. |

Readers that don't know a tag ignore it. Nothing here changes how a list stores its items;
it only adds tags to **headers** that say how items should read.

---

## 1. The model in one paragraph

A **list header** is a kind-39998 event (9998 is the non-addressable variant). Its
**items** are kind-39999 or 9999 events that name the header by `z`:
`["z", "39998:<header author>:<d>"]`, or, for a 9998 header, `["z", <its event id>]`. **NIP.** A 39999
or 9999 is itself a header only when it says so, with `["z", "list"]` or a `z` naming a
`…:concept-header` coordinate. **Tapestry draft**, `dlist-header-declaration.md` (the
`["z", "list"]` string form is the NIP's own). A **concept** is its header. A **community
concept** is a header other people point at.
A **copy** is someone's own header pointing at a community concept (§4).

Refer to headers **by coordinate** (`kind:pubkey:d`), never by event id: ids change on
every republish. Split a coordinate at the first two colons only, because `d` may contain
colons.

## 2. Fields: what an item carries

### 2.1 Declarations

```
["required" | "recommended" | "allowed" | "disallowed", <item tag name>, <description?>]   NIP
["optional", <item tag name>, <description?>]                                              Convention
```

- **NIP:** `required`, `recommended`, `allowed`, `disallowed`.
- **Convention:** `optional` isn't in the NIP.
- **Reader choices (Convention, from Tapestry's `dlistFields.js`; Brainstorm does the
  same):**
  - `allowed` reads as optional;
  - a field declared twice keeps its strongest requirement;
  - order is required, then recommended, then optional, in header order within each group;
  - a `disallowed` field is never rendered as declared.
- **Element 3 is the field's description:** **NIP (working copy, unpublished)**. The
  published NostrHub version (2026-02-26) doesn't have it. Brainstorm uses it to label links
  (§5.4).

### 2.2 Value type (**Convention**: observed from one client, curate)

```
["field-type", <declared field>, "text" | "url" | "address"]
```

- It types a field that is already declared. It never declares one by itself.
- `text` is the default when there's no tag.
- **`url`** means the field's values are links. Render one as a link only when the value
  parses as an http(s) URL.
- **`address`** (**Provisional**, Brainstorm 2026-10-10) means the field's values are
  Nostr addresses, `kind:pubkey:d`: each names another event, usually the field `a`. It
  says to a renderer "there's something to fetch here". A renderer may look the address
  up and show what it names (its title, a link to its page) in place of the raw string.
  Brainstorm renders it as text for now. It's an assertion made ahead of a spec, in the
  hope that one takes it up. `event`, for event ids, would be its sibling, but no list uses
  one yet.
- Unknown types render as text.

The **tag** is emitted by the curate client (curate-psi.vercel.app) and tracked by
Tapestry's worksheet item "field-type header tag: in the wild, not in the NIP" (on
Tapestry's `feat/tags` branch; cite it by title, because worksheet numbers differ between
branches). The **behaviour** (text by default, url links only if http(s), unknown means
text) is Tapestry's reader (`dlistFields.js`), which Brainstorm follows. The worksheet item
doesn't define it.

### 2.3 Fields the header doesn't declare

An item may carry tags its header never declared. Show them, but **apart** from the
declared fields, labelled as outside the definition. Brainstorm folds them into "More
fields". Skip these:

- single-letter tags (`d`, `z`, `p`, `e`, …), which are protocol tags, not fields;
- empty values;
- the NIP metadata every event may carry (`alt`, `client`, `expiration`).

A reader can still promote a single-letter tag to a field by declaring it in their own
copy.

## 3. How an item reads: display hints (**Provisional**)

The header says which declared field plays which part. The tag is role-first, one field per
role, except `fact`, which repeats (§3.5):

```
["display", "title" | "summary" | "image" | "link" | "media" | "location", <declared field>]
["display", "fact", <declared field>, <label?>]
```

| Role       | Meaning                                | Value must be                        |
| ---------- | -------------------------------------- | ------------------------------------ |
| `title`    | The item's name, its largest text      | any                                  |
| `summary`  | The line or snippet under the title    | any                                  |
| `image`    | The item's own picture (avatar, cover) | http(s) URL                          |
| `link`     | The item's own page somewhere          | http(s) URL                          |
| `media`    | A playable file                        | http(s) URL to audio or video (§3.2) |
| `location` | Where the item is, offered as a map    | a geohash (§3.4)                     |
| `fact`     | A field listed as "label: value"       | any (§3.5)                           |

Rules:

- A hint may only name a **declared** field. It decorates a field the way `field-type`
  does, and never invents one.
- If a role is named twice, the first one wins. `fact` repeats: each tag names a field, and
  the first tag per field wins.
- Unknown roles are ignored.
- A value that fails its rule (not http(s), not media, not a geohash) means "no such thing"
  for that item. It is not an error.

### 3.1 Without hints

| Part                         | Default                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| title                        | the first **required** field, else the first declared field                  |
| summary                      | a declared `summary`, else a declared `description`, never the title's field |
| image, link, media, location | none                                                                         |
| facts                        | none                                                                         |

**The choice is per definition, never per item.** An item missing its title field reads
"Untitled \<singular name\>". It does not borrow another field, so the same field always
fills the same slot down a list.

### 3.2 Media

The kind is decided by the URL's file extension:

- **audio:** `mp3`, `m4a`, `ogg`, `wav`, `flac`, `aac`, `opus`
- **video:** `mp4`, `webm`, `mov`, `m3u8`

Anything else is not media. Brainstorm plays audio in its track card (one sound at a time,
app-wide) and video inline, using the item's title, summary and image as track title,
artist and cover.

### 3.3 The list's own image (**Provisional**, NIP-51's tag)

```
["image", <http(s) url>]      on the header
```

One image every item of the list wears: a logo or an icon. It's used where an item has no
`image` of its own (tiles, the kicker on an item page). Prefer a content-addressed URL
(e.g. Blossom `https://…/<sha256>.png`) so the bytes can't change under the list. Serve it
through an image proxy if you have one, so readers don't contact the image's host.

### 3.4 Location

The field's values are [geohashes](https://en.wikipedia.org/wiki/Geohash): base 32, each
character a smaller cell (6 characters ≈ 1 km, 9 ≈ 5 m). That's NIP-52's `g` tag, which an
event often carries once per precision (`["g","6ex01945p"]`, `["g","6ex019"]`, …), so:

- **The most precise value counts:** the longest that decodes, wherever it sits among the
  field's values. A value outside the geohash alphabet is skipped.
- **A geohash, not coordinates.** It keeps the one-field-per-role rule; a pair of `lat`/`lon`
  fields would need a role naming two fields. Lists that carry both can still link out by
  coordinates through a URL template (§5.2).

Brainstorm offers the place on the item's page as OpenStreetMap's embedded map, **loaded
only when the reader asks**, so opening a page contacts no map server. A cell of 6
characters or more (≈ 1 km and under) is a spot and gets a pin; a coarser one is framed as
the area it is, with no pin to suggest a precision it doesn't have.

### 3.5 Facts

```
["display", "fact", "phone"]
["display", "fact", "opening-hours", "Hours"]
["display", "fact", "accepts-bitcoin"]
```

The fields an item's page lists as "label: value": a place's phone, hours and payment, say.
Read the tag as "display this fact, labelled …".

- **As many as the header likes,** listed in the header's order. A field named twice keeps
  its first tag.
- **The label is the optional 4th element.** Without one, the field's name reads as words:
  `opening-hours` → "Opening hours", `accepts-bitcoin` → "Accepts bitcoin". A field's
  description (§2.1) isn't used: descriptions tend to be sentences ("Phone number,
  international format"), not labels.
- **Never a field another role shows.** A field that's already the title, summary,
  picture, link, media or location isn't listed again as a fact.
- An item that lacks a fact's field simply doesn't list it. A `url`-typed fact (§2.2) is a
  link.

Brainstorm lists facts on the item's own page only, under the title. Results cards and
list rows don't show them, because a list may name many and those rows have room for few.

## 4. Concepts, copies, and which definition governs

### 4.1 A copy (**Tapestry draft**, `assistant-designation.md`, `inherit-from.md`)

A reader's own definition of a community concept is a 39998, signed by the reader or their
Tapestry Assistant, with:

```
["b", "39998:<community author>:<d>", "pointer"]
```

- **The `b` is what makes it a copy,** not the `d`. A copy **should** reuse the
  community's `d` (the contract for a TA curation header), but a header with a different
  `d` and the right `b` is still a copy. A header that only shares the `d` isn't one.
- **What it should carry:** the spec's header contract says a copy "SHOULD copy the
  community header's names, description, and schema at creation". Schema means field
  declarations and `field-type`s. Brainstorm also carries display hints, the list image and
  links (Provisional).
  - Tapestry's own copier currently copies only names, slug and json, a known divergence
    from its own spec that Tapestry is tracking.
- **A canonical concept** points at itself: `["b", <its own coordinate>, "pointer"]`.
  Tapestry's shared-concept search keys on that.
- **The `b` type:** an absent or unknown type reads as `pointer`.

### 4.2 Precedence: the governing definition

For one reader and one community concept, the definition that governs is the first of:

1. the reader's **own** copy (their key);
2. their **Tapestry Assistant's** copy;
3. the **app's own** copy (the "house"): **Provisional**, Brainstorm's addition;
4. the **community** header: **Provisional**, Brainstorm's addition.

Tiers 1 and 2, and "never by timestamp", are the spec's dual-author rule
(`assistant-designation.md` § Dual-author lookup and precedence). The spec keys them on
the same slug (`39998:<user>:<S>`, then `39998:<TA>:<S>`) and discovers the Assistant
from the user's kind-10040 `["39998:dlist-header", <TA>, <relay>]`. It doesn't require a
`b`. Brainstorm requires the `b`, finds the Assistant through its own server, and adds
tiers 3 and 4 and the agreement display below.

The house tier applies to every reader, signed in or not, and comes before the community
header. The house is the same account the app already uses as its default perspective for
trust: the deployment's default observer, which the server publishes under the reserved
NIP-05 name `_` (`/.well-known/nostr.json?name=_`). Its copies count, and so do those of
the Assistant its kind-10040 names. Nothing in the app's config names the house; it is
discovered. A house with no copy of a concept leaves that tier empty, and the community
header governs. So "the house accepts the community's definition as it is" needs no event,
though a copy that agrees says so explicitly.

Never pick by timestamp across authors. A stale assistant must not shadow a deliberate
edit. A header counts as a copy only if its `b` points at the community concept; sharing
the `d` is not enough.

**Renderers draw only from the governing definition**, with the community's beside it for
comparison. Tell the reader how they relate:

- _agrees_;
- _differs_, and in what: names, description, fields, display, links;
- _community's own_ (there's no copy);
- _unknown_ (the community header couldn't be fetched).

### 4.3 Withdrawing a copy (**Tapestry draft** vocabulary)

Republish the copy at the same coordinate with **`["b", "b-tag-deferred"]`** in place of
its pointer. That's Tapestry's reserved value for "considered, chose none" (`inherit-from.md`
§ The b tag; `shared-concepts.md` § Deliberate non-affiliation). Every Tapestry reader
treats such a header as dispositioned, and never as a copy or a Dictionary row.

Why this rather than a NIP-09 deletion (kind 5): the tag hub does accept kind 5, but
replaceable state is more robust than a deletion request that relays may or may not honour.
It also states a decision, where a header with no `b` at all looks like one that was never
a copy. For a TA curation header, also remove the user's kind-10040 per-list entry
(`["39998:<d>", <TA>, <relay>]`), or the Map keeps advertising a header that is no longer
a copy.

## 5. Links from data

An item can link out in two ways, shown in this order and with duplicate addresses
dropped.

### 5.1 Its own URL field: `display` `link` (**Provisional**)

The item's author supplies the whole URL. The definition can't fix the host. What guards
the reader is the web-of-trust filter on items (§6) plus the http(s) rule. Label the link
with the field's description from the declaration (§2.1), else the URL's host. Always show
the host.

### 5.2 A URL template (**Provisional**)

The definition fixes the destination, and the item fills in the blanks:

```
["link", <template event id>, <relay hint>, <placeholder>, <field>, <placeholder>, <field>, …]
```

- **The template** is an item of the **URL Templates** concept:
  `39998:2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331:url-templates`
  (canonical; its header points at itself). A template item carries
  `["url-template", "https://github.com/{username}"]` and `["name", "GitHub profile"]`.
- **Pinned by event id, never by address.** An address follows its author's edits, so a
  template could be re-pointed under every list that uses it. An id is frozen, like a
  dependency pinned by hash. The safer kind for a template is therefore 9999; a 39999
  pinned by id works too. If the template is deleted, there's simply no link.
- **Pairs are named, not positional.** Each pair may only bind a declared field.
- **The URL Templates concept is itself a concept like any other.** A reader's own copy of
  it decides which templates they're offered.

### 5.3 Template syntax and safety

The syntax is **RFC 6570, level 1 only**: `{name}`, where a name is letters, digits and `_`.
Nothing else is allowed (`{+path}`, `{?q}`, `{a,b}` are all invalid).

1. A template must begin with a **literal `https://host/`**. Placeholders may appear only
   after the host, so no value can choose where a link goes.
2. **Values are percent-encoded** (everything but RFC 3986's unreserved characters), so a
   value can't add a path segment, a query or a fragment. `../evil?x#y` becomes
   `..%2Fevil%3Fx%23y`.
3. The expanded URL must parse as https **on the template's host**.
4. If any placeholder has no value on the item, there's no link.
5. Render links with `rel="noopener noreferrer nofollow"` and show the destination host.

### 5.4 Label

A template link is labelled by the template's `name` ("GitHub profile"). A field link is
labelled by its field's description (§5.1).

## 6. Rendering guidance

These aren't protocol rules, but they're what makes the conventions above read well.

- **Show each field once.** A field used as title, summary, image, link, media, location or
  a fact, or bound in a link template, isn't listed again. Declared fields nothing uses, plus undeclared
  tags (§2.3), go in a collapsed "More fields". An item the definition fully covers shows
  no table at all.
- **Flag a missing required field** on the item, once.
- **Filter items by web of trust.** Show items whose **authors** rank at or above your
  verified line from the reader's perspective. Brainstorm reads NIP-85 kind-30382 `rank`
  from the reader's own 10040-designated scorer and falls back to the house's. Put the rest
  behind "N more from accounts outside your web of trust".
- **The lister is secondary.** On a list item's or a header's own page, who filed it is a
  quiet "Listed by" footer, not the author header a post gets.
- **Dedupe:** addressable items by coordinate (newest wins), regular items by id. A
  curation copy (`d` = `copy-…`, with `q` naming its original) counts as its original:
  `assistant-designation.md` § Curation copies (a copy is detected by a `q` equal to the
  original's address for 39999 originals, or its id for others).
- **Read both the index and the hub.** If you read from an index (a search relay) as well
  as the hub, read both **in parallel** and merge. "Not indexed yet" and "doesn't exist"
  look identical, so reading the index alone, or the index first, hides fresh copies.

## 7. Two worked examples

### 7.1 GitHub Accounts, rendered with a templated link

The community header (Avi's) declares only `["required", "github-username"]`. A reader's
copy:

```json
["d", "github-accounts"]
["names", "GitHub Account", "GitHub Accounts"]
["required", "github-username"]
["field-type", "github-username", "text"]
["optional", "description", "Who it belongs to"]
["display", "title", "description"]
["display", "summary", "github-username"]
["image", "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"]
["link", "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4", "wss://dcosl.brainstorm.world", "username", "github-username"]
["b", "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts", "pointer"]
```

An item `["github-username","vcavallo"]`, `["description","Vinney Cavallo"]` renders as:

- title **Vinney Cavallo**, summary `vcavallo`, the GitHub logo;
- a **GitHub profile · github.com** link to `https://github.com/vcavallo`;
- no leftover fields.

### 7.2 V4V Songs, a list with no declarations, made playable

The community header (`39998:77599c5c…:da216f8f…`) has a `name` and a description and
declares nothing, so its items render as "Untitled". A reader's copy:

```json
["names", "Value 4 Value Song", "Value 4 Value Songs"]
["optional", "title"]
["optional", "artist"]
["optional", "url"]
["field-type", "url", "url"]
["optional", "artwork"]
["display", "title", "title"]
["display", "summary", "artist"]
["display", "image", "artwork"]
["display", "media", "url"]
["image", "<a music-note icon URL>"]
["b", "39998:77599c5c4a7ba08456679d812a414037f4b01c975fb4f577187df11d189f80d3:da216f8f-6a99-460a-801c-62e7217f7acd", "pointer"]
```

Each song renders with its title, artist and cover art, and plays in the page. Adding
`["optional", "t", "Podcast Index page"]`, `["field-type", "t", "url"]` and
`["display", "link", "t"]` would add a "Podcast Index page" link to each song's page on
podcastindex.org.

## 8. Open questions for the spec

1. **Names.** `display`, its seven roles, the header's `image`, `link`, `url-template`: are
   these the right names, and do they belong in the DList NIP, in
   `decentralized-lists-compat.md` beside `item-kind`, or in a separate draft?
2. **Element 3 of a field declaration:** a description or a source
   list?
3. **`field-type`** graduating into the NIP, and whether `url` is the only type that
   changes rendering. Should `address` (and `event`) become reference types a renderer
   resolves (§2.2)?
4. **Template on the header vs. on the field's type.** Tapestry's worksheet item "Field
   types as a DList: portable actions, not portable rendering" (`feat/tags`) proposes
   templates on a field **type**. That needs no placeholder mapping but can't express
   multi-field links. The Tapestry review's suggestion: keep this document's header-level
   `link` as the binding mechanism, and make the type-level idea a shortcut onto the
   **same** template object. A type would say "my values fill template `<id>` at
   placeholder `<p>`" (a one-pair `link` implied by the type). That gives one template
   syntax, one template store, two ways to bind. §5.3's safety rules answer the open
   problems that worksheet item lists (scheme allowlist, percent-encoding, no
   `javascript:`/`data:`).
5. **Withdrawing a copy** (§4.3): is `["b", "b-tag-deferred"]` the convention for
   withdrawing, with NIP-09 kind 5 reserved for true deletions?
6. **Copy contents:** should a copy carry the community's display hints and links verbatim,
   as this document says (§4.1)?

## Where this should live

The Tapestry review suggests `protocols/drafts/` in Tapestry, split by maturity:

- `field-type`: a section in `decentralized-lists-compat.md` beside `item-kind`;
- element 3: the DList NIP's next published version;
- `display`, the header `image`, `link` and URL Templates: a new pre-NIP draft
  (e.g. `dlist-presentation.md`).

The first step is a worksheet item (💭 idea) in `protocols/worksheet.md` linking this guide,
then the Protocol-Spec docs-mode workflow.

## Where to look in Brainstorm-UI

| Topic                          | File                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| Field grammar                  | `client/src/lib/dlistFields.ts`                              |
| Display hints, list image      | `client/src/lib/displayHints.ts`                             |
| How an item reads (defaults)   | `client/src/lib/itemPresentation.ts`                         |
| Link templates and safety      | `client/src/lib/linkTemplates.ts`                            |
| Media kind                     | `client/src/lib/mediaKind.ts` (`mediaKindOfUrl`)             |
| Geohash, the map of a place    | `client/src/lib/geohash.ts`                                  |
| Precedence and agreement       | `client/src/lib/conceptResolution.ts`, `docs/adr/0004-…`     |
| Writing a copy, withdrawing it | `client/src/lib/conceptCopy.ts`                              |
| Reading (index and hub)        | `client/src/services/listReads.ts`, `services/dictionary.ts` |
