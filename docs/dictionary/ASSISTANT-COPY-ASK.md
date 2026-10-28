# Your Assistant's Dictionary — the server endpoints the UI is wired for

**For:** brainstorm_server
**From:** the UI, branch `feat/add-to-dictionary`, 2026-10-27
**Filed as:** [NosFabrica/brainstorm_server#112](https://github.com/NosFabrica/brainstorm_server/issues/112), for a PR of
its own after [#110](https://github.com/NosFabrica/brainstorm_server/pull/110)
**Settled in:** brainstorm_server's ADR `engineering-team/decisions/assistant-dictionary/0001-the-assistant-signs-concept-copies.md`
(accepted 2026-10-27, branch `feat/assistant-dictionary`). This doc follows it. Where the two differ, the ADR wins.
**Modelled on:** [ADMIN-ASKS.md](ADMIN-ASKS.md), the admin route for the same copies, which was never built (it isn't
in staging's or production's `/openapi.json`, checked 2026-10-27), and
[TREASURE-MAP-ASK.md](../assistant/TREASURE-MAP-ASK.md) for the `/user` router and the 404 convention

## What it's for

A concept is in someone's Dictionary when they hold a **local copy** of it: a kind-39998 header at the community
header's `d`, pointing back with `["b", <community coordinate>, "pointer"]` (CONTEXT.md, "Local copy").

A Dictionary entry in Settings (`/settings?tab=dictionary&concept=…`) now offers **Add to my Dictionary**, with one
line for each Dictionary:

- the one the reader's Brainstorm Assistant keeps, the preferred one;
- the reader's own.

Each line adds an exact copy of the community's definition. Once a copy is there, the line offers **Remove**: its
keeper republishes the copy marked withdrawn, `["b", "b-tag-deferred"]` in place of the pointer. `lib/conceptCopy`
explains why it is withdrawn rather than deleted with NIP-09.

The reader signs their own copy in the browser. Only the server holds the Assistant's key, so only the server can
sign the Assistant's. These are the two routes for that.

The Assistant is always the one Brainstorm hosts for the reader (`ta_pubkey`), whether or not their Treasure Map
gives it the Concepts duty. Item pages and search already read the reader's own copy first, then this Assistant's
(`hooks/useItemConcept`).

## The copy

A copy the server signs has the same tags as one the reader signs. The reference is the UI's `exactCopyTemplate`
(`client/src/lib/conceptCopy.ts`). Both copies read "Agrees with the community".

```jsonc
{
  "kind": 39998,
  "pubkey": "<the caller's Assistant>",
  "content": "",
  "tags": [
    ["d", "<the community header's d>"],
    /* From the community header, verbatim and in its order, every tag named
       names, name, description, slug,
       required, recommended, optional, allowed, field-type,
       display, image or link. */
    ["b", "<the community coordinate>", "pointer"],
    ["client", "Brainstorm"],
  ],
}
```

- **The community header** is the newest kind 39998 for `authors=[<pubkey>]`, `#d=[<d>]`, from the dictionary
  relay. Split the coordinate at the first two colons only, because a `d` may contain colons.
- **Nothing else is copied.** Real community headers also carry `json`, `concept-graph`, `r`, `license`, `alt`
  and `client` (seen on dcosl, 2026-10-27). None of them is copied, and neither is the community's own `b` or `z`.
- **No items are copied.** The copy's items stay the community list's.

## The endpoints

Both routes work like the Duty Menu's:

- They are under `verify_token`, for the caller's own Assistant: the key Trusted Lists and the Duty Menu use
  (`get_or_create_brainstorm_observer_nsec_by_pubkey_on_db`).
- They go on the authenticated `/user` router, so `GET /user/{pubkey}` doesn't answer the path.
- They are synchronous. The UI waits up to 60 seconds.

The body of both is the same:

```json
{ "concepts": ["39998:<pubkey>:<d>"] }
```

The UI sends one coordinate per call. The routes accept 1 to 10, and a body that fails the request schema answers
**422**, as every request schema on this server does. That covers a missing or empty list, more than 10, and anything
that isn't a kind-39998 coordinate.

Each request runs in order:

1. **Read** the community headers and the Assistant's headers from the dictionary relay. These reads are strict: if
   the relay doesn't answer, the request answers 502 and nothing is published.
2. **Decide and sign** each concept, as below.
3. **Send** the signed events, in order. A send starts only during the first 40 seconds; a concept not sent by then is
   `failed` ("not sent: out of time").

A second coordinate with the same `d` as an earlier one in the same request is a `conflict`. The Assistant has only
one header per `d`.

### 1. `POST /user/assistantDictionary`: add

For each concept:

1. **Find the community header.** If it isn't found, the status is `not_found`.
2. **Compose the copy** as above.
3. **Check what is already there:** the Assistant's newest `39998:<assistant>:<d>`.
   - **Nothing, or a withdrawn copy** (its `b` is `b-tag-deferred`): publish. The status is `published`.
   - **A copy pointing here, with the same tags:** publish nothing. The status is `unchanged`, so a second press is
     harmless.
   - **A copy pointing here, with different tags** (the community header changed): republish at the same
     coordinate. The status is `updated`.
   - **Any other header** (a `b` to something else, or no `b`): don't overwrite it. The status is `conflict`, with a
     sentence.
4. **Publish** to the dictionary relay, `wss://dcosl.brainstorm.world` (the UI's `tagRelays()`), and to the
   Assistant's kind-10002 write relays when it has some (`assistant_relay_list()`). Set `created_at` to
   `max(now, newest version + 1)`, so a new version always replaces the old one.

### 2. `POST /user/assistantDictionary/withdraw`: remove

For each concept:

- **The Assistant's newest copy points at the concept:** republish the coordinate withdrawn, with the tags
  `withdrawnTemplate` writes (`client/src/lib/conceptCopy.ts`). The status is `withdrawn`.

  ```json
  [
    ["d", "<d>"],
    ["b", "b-tag-deferred"],
    ["alt", "A withdrawn concept copy: considered, and affiliated with no community concept."],
    ["client", "Brainstorm"]
  ]
  ```

- **No copy, or one already withdrawn:** the status is `unchanged`.
- **A header there that points elsewhere:** leave it alone. The status is `conflict`.

Publish to the same relays as an add, with the same `created_at` rule.

### The answer, for both

```jsonc
{
  "data": {
    "assistant": "<hex>",
    "concepts": [
      {
        "community": "39998:<pubkey>:<d>",
        "local": "39998:<assistant>:<d>", // null when not_found
        "event": {/* the signed event, when one was published; else null */},
        "status": "published", // | "updated" | "unchanged" | "withdrawn" | "conflict" | "not_found" | "failed"
        "error": null, // a sentence for conflict, not_found and failed
        "relays": [{ "url": "wss://dcosl.brainstorm.world", "ok": true }], // per relay, as the Duty Menu reports; [] when nothing was sent
      },
    ],
  },
}
```

When at least one event needed sending and no relay took any of them, the answer is 502, as the Duty Menu's is.

## What the UI shows

Before anything is pressed, the UI reads the Assistant's copies from the relays, as it does now
(`services/dictionary`), so neither route needs a `GET`.

| The server answers                                 | The UI                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `published`, `updated`, `unchanged` or `withdrawn` | reads the Dictionary again; the line becomes "In …'s Dictionary", or the Add button again        |
| `conflict`, `not_found` or `failed`                | shows `error` under the line                                                                     |
| 404 or 405                                         | "Your Assistant can't add concepts on this server yet." The button stays, disabled for the visit |
| 401                                                | what any signed-in call does                                                                     |
| any other error                                    | its message; the button can be pressed again                                                     |

## Not asked for (yet)

- **The admin route.** [ADMIN-ASKS.md](ADMIN-ASKS.md)'s `POST /admin/dictionary/{observer}` makes the same copies
  for any user, and Admin → Users already calls it. It can share this code path, but the buttons don't need it.
- **Treasure Map rows.** Tapestry's draft spec advertises a copy with a reader-signed kind-10040 row,
  `["39998:<d>", <assistant>, <relay>]`. The Assistant's own Treasure Map (TREASURE-MAP-ASK.md) lists Concepts as
  `not-published-here`. Both can follow once the Assistant publishes copies. Neither is needed for the buttons.
- **Editing the Assistant's copy.** It repeats the community's definition. A reader who wants a different definition
  edits their own copy, which outranks the Assistant's.
- **Upkeep.** When the community header changes, the Assistant's copy changes only when the reader presses Add
  again, which answers `updated`.
