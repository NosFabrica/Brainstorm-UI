NIP-XX
======

Profile Presentation Preferences
--------------------------------

`draft` `optional`

This NIP defines a user-owned, portable record of how a user prefers their
**profile page** to be presented: the order and visibility of content sections,
and the visibility of well-known profile regions. It lets a user's layout intent
travel across clients without any client or server owning that state.

## Motivation

Most Nostr clients render a "profile page" that aggregates a user's content —
notes, long-form articles, pictures, videos, live streams — alongside identity
metadata (bio, website, NIP-05, etc.). Today each client invents its own layout,
and the user has no portable way to say "lead with my pictures, hide my
long-form, don't show my bio." Presentation intent is lost the moment the user
switches clients.

This NIP standardizes a **minimal, opt-out** description of that intent so that
any client MAY honor it, while clients that don't understand it degrade
gracefully to their own defaults. It deliberately standardizes only *layout* —
it does not introduce new content, identity, list, or labeling primitives, and
reuses existing NIPs for those concerns.

## Terminology

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" are to be
interpreted as described in RFC 2119.

A **content section** is a region of a profile page that lists events of a
single content kind (e.g. `kind:1` notes, `kind:30023` long-form).

A **profile region** is a non-content element of a profile page (e.g. the bio,
the banner, the website link).

## The event

Presentation preferences are stored as a [NIP-78](78.md) application data event:

- `kind`: `30078` (addressable / parameterized-replaceable, per [NIP-01](01.md)).
- A single `d` tag with the reserved value `"nostr/profile-presentation"`.
- `content`: a JSON object (the *preferences object*), defined below.

Because the event is addressable, a relay retains only the newest event per
`(pubkey, kind, "nostr/profile-presentation")`; re-publishing overwrites the
prior preferences. The event is public and readable by anyone.

```jsonc
{
  "kind": 30078,
  "tags": [["d", "nostr/profile-presentation"]],
  "content": "<preferences object, JSON-encoded>"
  // ...pubkey, created_at, id, sig per NIP-01
}
```

## The preferences object

```jsonc
{
  "v": 1,
  "sections": [
    { "kind": 20 },
    { "kind": 1 },
    { "kind": 30023, "hidden": true }
  ],
  "hiddenFields": ["bio", "banner"]
}
```

| Field          | Type       | Req. | Meaning |
| -------------- | ---------- | ---- | ------- |
| `v`            | integer    | MUST | Schema version. MUST be `1` for this revision. |
| `sections`     | array      | MAY  | Ordered content sections, keyed by content event `kind`. |
| `hiddenFields` | string[]   | MAY  | Well-known profile regions the user has hidden. |

### `sections`

An ordered array. Each entry is an object:

| Key      | Type    | Req. | Meaning |
| -------- | ------- | ---- | ------- |
| `kind`   | integer | MUST | The content event kind this section lists. |
| `hidden` | boolean | MAY  | If `true`, the user has hidden this section. Default `false`. |

- **Order is array position.** The first entry is the topmost section.
- A `kind` MUST NOT appear more than once; if it does, clients MUST use the
  first occurrence and ignore the rest.
- Listing a `hidden: true` section preserves its position should the user later
  unhide it; clients MAY also simply omit hidden sections.

### `hiddenFields`

An array of well-known string tokens naming profile regions to hide. Clients
SHOULD hide the corresponding region for tokens they recognize and MUST ignore
tokens they do not. Initial registry (extensible by future revisions):

| Token         | Region |
| ------------- | ------ |
| `bio`         | The `about` field from `kind:0` |
| `banner`      | The `banner` image from `kind:0` |
| `website`     | The `website` field from `kind:0` |
| `nip05`       | The NIP-05 identifier |
| `lightning`   | Lightning address / LNURL (`lud16`/`lud06`) |
| `identities`  | External identities ([NIP-39](39.md)) |
| `followers`   | A followers list/count region |
| `following`   | A following list/count region |

Core identity — display name, picture, and the user's public key — represents
the minimum needed to recognize a profile. Clients SHOULD always render it, and
it is intentionally **not** hideable through this NIP.

## Client behavior

A client that renders a profile page and chooses to honor this NIP:

1. MUST fetch the author's newest `kind:30078` event with
   `d = "nostr/profile-presentation"` (see filter below) and, if present and
   valid, apply it.
2. For each content kind it can render, MUST consult `sections`:
   - present with `hidden: true` → MUST NOT render that section;
   - present otherwise → SHOULD render it at its array-derived position;
   - absent → SHOULD render it after all listed sections, in the client's own
     default order.
3. MUST ignore `sections` entries whose `kind` it does not render, and MUST
   ignore unknown object keys and unknown `hiddenFields` tokens (forward
   compatibility).
4. If the event is absent, has `v` it does not support, or fails to parse, the
   client MUST fall back to its own default presentation (opt-out).
5. MUST treat these preferences as advisory presentation only. They MUST NOT be
   used to authenticate, authorize, filter for safety, or otherwise change
   semantics beyond layout.

Filter:

```json
{ "kinds": [30078], "authors": ["<pubkey>"], "#d": ["nostr/profile-presentation"] }
```

Clients SHOULD read from, and publish to, the author's write relays as
advertised in their [NIP-65](65.md) relay list.

## Examples

**1 — Reorder and hide.** Lead with pictures, then notes; hide long-form and the
bio:

```json
{
  "v": 1,
  "sections": [
    { "kind": 20 },
    { "kind": 1 },
    { "kind": 30023, "hidden": true }
  ],
  "hiddenFields": ["bio"]
}
```

**2 — Minimal.** Hide only live streams; leave everything else at client
defaults:

```json
{ "v": 1, "sections": [{ "kind": 30311, "hidden": true }] }
```

**3 — Full event as published:**

```jsonc
{
  "id": "<32-byte-hex>",
  "pubkey": "<32-byte-hex>",
  "created_at": 1751990400,
  "kind": 30078,
  "tags": [["d", "nostr/profile-presentation"]],
  "content": "{\"v\":1,\"sections\":[{\"kind\":20},{\"kind\":1},{\"kind\":30023,\"hidden\":true}],\"hiddenFields\":[\"bio\"]}",
  "sig": "<64-byte-hex>"
}
```

## Related content and identity (out of scope, by reuse)

This NIP standardizes layout only. Adjacent concerns are covered by existing
NIPs and MUST NOT be duplicated here:

- **Featured / pinned content** — use [NIP-51](51.md) pinned notes (`kind:10001`)
  and curation sets (`kind:30004`/`30005`). A client MAY render such a list as a
  "Featured" section; referencing it is left to the client.
- **Self-declared roles / topics** — use [NIP-32](32.md) self-labels, or the
  `kind:0` metadata fields. This NIP does not define a role vocabulary. For
  migration, implementations MAY carry an optional `roles: string[]` in the
  preferences object, but it is non-normative and clients SHOULD prefer NIP-32.
- **Identity metadata** — `kind:0` ([NIP-01](01.md)) and [NIP-39](39.md).
- **Application-specific pinning** (e.g. curated "followed-by" faces derived
  from a client's own trust ranking) is explicitly out of scope and belongs in
  app-private [NIP-78](78.md) data.

## Security and Privacy Considerations

- The event is **public**. It expresses layout intent only and carries no
  secrets; it does, however, reveal that a user hides certain content types,
  which is a minor metadata signal. Implementers should not place sensitive
  data in this event.
- Preferences are **advisory**. A client MUST NOT rely on `hidden` for safety,
  moderation, or access control — hidden content remains publicly fetchable by
  its own kind. Hiding is a presentation choice, not a privacy guarantee.
- The event is signed by the author ([NIP-01](01.md)); clients MUST verify the
  signature and MUST only apply preferences authored by the profile's own
  pubkey. A client MUST NOT let one user's preferences affect another user's
  page.
- Because the object is small and validated field-by-field, malformed or
  hostile input degrades to defaults rather than failing the page.

## Backwards Compatibility

This NIP is strictly additive and opt-out:

- Clients that do not implement it ignore the `kind:30078` event and render
  their normal defaults — no user-visible breakage.
- Because sections are keyed by content **kind**, a client that supports a
  different set of kinds still interprets the subset it knows and ignores the
  rest.
- Future revisions bump `v`; clients that do not recognize a `v` fall back to
  defaults, so old clients never misinterpret new schemas.

## Rationale

- **Why `kind:30078` and not a new kind?** Presentation preferences are a
  single, replaceable, user-scoped settings object — exactly what
  parameterized-replaceable [NIP-78](78.md) data is for. Minting a new
  replaceable kind for this would add coordination cost without benefit, and is
  discouraged when a `d`-tagged record suffices.
- **Why a `nostr/`-prefixed `d` tag?** App-private NIP-78 records are
  conventionally namespaced by domain (e.g. `example.com/foo`). Reserving
  `nostr/profile-presentation` signals a **shared, standardized** record rather
  than one app's private state, reducing collision risk.
- **Why order-by-position instead of an explicit `order` field?** Array order is
  unambiguous, compact, and avoids inconsistent states (a hidden-yet-ordered
  entry). Absent kinds appending in client-default order preserves graceful
  degradation.

### Alternative considered: a dedicated kind

A dedicated addressable kind (some unused `3xxxx`) would make the record
self-describing without a reserved `d` tag. It is a valid design but raises the
coordination bar (kind-number allocation, broader buy-in) for no functional
gain over the reserved-`d`-tag approach, and is therefore not the primary
proposal. Implementers who prefer it can carry the identical preferences object
as the `content`.

## Reference Implementation

Brainstorm (a Nostr web-of-trust client) ships an end-to-end implementation of
this pattern — an owner-only inline editor that publishes the preferences object
and a public profile page that reads and applies it — currently under the
app-private `d` tag `brainstorm.world/profile-prefs`, which this NIP generalizes
to `nostr/profile-presentation`. A second independent implementation is sought
before this NIP advances beyond `draft`.

## References

NIP-01 (events & addressable kinds), NIP-32 (labeling), NIP-39 (external
identities), NIP-51 (lists / sets), NIP-65 (relay list metadata), NIP-78
(application-specific data), RFC 2119.
