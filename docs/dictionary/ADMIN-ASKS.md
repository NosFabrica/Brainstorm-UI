# Dictionary concepts in admin — the server endpoint the UI is wired for

**For:** brainstorm_server
**From:** the UI, branch `add-github-account-renderer`, 2026-10-01
**Modelled on:** `POST /admin/trustedLists/{observer_pubkey}` (server PR #86) and
[`docs/trusted-lists/ADMIN-ASKS.md`](../trusted-lists/ADMIN-ASKS.md)

## What it's for

Settings › Dictionary shows a user the concepts Brainstorm understands for them. A
concept is in their Dictionary when their **Tapestry Assistant** holds a copy of a
community concept: a kind-39998 header, signed by the assistant, pointing at the
community header with a `b` tag. Only the server holds the assistant's key, so only the
server can author the copy.

An admin presses **Add dictionary concepts…** in a user's ⋯ menu (Admin → Users). The
UI calls the endpoint below with the concepts to copy; today that is one, GitHub Accounts.
URLs follows once someone authors a community URLs concept.

The wire shape is tapestry's, so its readers see the same copies:
`~/src/tapestry/protocols/drafts/assistant-designation.md` § "Per-DList curation
entries" → "The header contract", and `curated-dlist-update` ADR 0001. Tapestry's own
writer is `POST /api/dlist-curation/header` (`src/api/dlist-curation/index.js`).

## The endpoint

```
POST /admin/dictionary/{observer_pubkey}
Content-Type: application/json

{ "concepts": ["39998:b83a28b7…:github-accounts"] }
```

- **Admin only**, like every `/admin/*` route.
- **`concepts`**: community header coordinates, `39998:<pubkey>:<d>`. Split them at the
  first two colons only: a `d` may contain colons. The UI sends the concepts the
  Dictionary shows, read from its curated list (`client/src/hooks/useDictionaryConcepts.ts`),
  so a new concept needs no server deploy, and no UI deploy either.
  Refuse anything that isn't a kind-39998 coordinate.
- **Signing**: the observer's assistant key, the same one Trusted Lists use
  (`get_or_create_brainstorm_observer_nsec_by_pubkey_on_db`). Please don't mint a key for
  a pubkey with no Brainstorm account (Trusted Lists ask 5).
- **Synchronous**: a few seconds per concept. The UI waits up to 60 seconds.

### For each concept

1. **Fetch the community header**: newest kind 39998 for `authors=[<pubkey>]`,
   `#d=[<d>]`, from the dictionary relay. Not found → `not_found`.
2. **Compose the copy.** Kind 39998, signed by the assistant, with these tags:
   - `["d", <community d>]`, the same `d`;
   - `["b", <community coordinate>, "pointer"]`;
   - copied **verbatim** from the community header: `names`, `name`, `description`,
     `slug`, and every `required`, `recommended`, `optional`, `allowed` and
     `field-type` tag, in the header's order;
   - also verbatim, the provisional presentation hints when the community header has
     them: every `display` tag and the list's `image` (`client/src/lib/displayHints.ts`;
     not yet in any spec, names may change).

   The field declarations are what the UI renders items from (`lib/dlistFields.ts`). Copy
   them. Tapestry's own writer currently copies only `names`/`slug`/`json`, and a copy
   made that way has no fields. The draft spec says a copy SHOULD carry the schema.
   Don't copy `json`, `b`, `z` or the community header's own `d`.

3. **Check what's already there**: the assistant's newest `39998:<assistant>:<d>`.
   - **None**: publish. Status `published`.
   - **Same `b` and tags identical to the composed set**: don't publish. Status
     `unchanged`. This makes the call idempotent and a second press harmless.
   - **Same `b`, different tags** (the community header changed): republish at the same
     coordinate, which replaces it. Status `updated`.
   - **A `b` to a different target, or no `b`**: **don't overwrite**. Status `conflict`.
     The draft spec forbids silently re-pointing an existing header.
4. **Publish** to the dictionary relay, `wss://dcosl.brainstorm.world`. That is
   tapestry's DList relay default and where the community headers and the UI's reads live
   (`tagRelays()`). A config value is fine. Please say which relay in the response.

The assistant does **not** copy items. A copy's items stay the community list's until
curation copies are wanted (draft § "Curation copies").

### Response

```jsonc
{
  "data": {
    "observer": "<hex>",
    "signing_pubkey": "<assistant hex>",
    "relay": "wss://dcosl.brainstorm.world",
    "concepts": [
      {
        "community": "39998:b83a28b7…:github-accounts",
        "local": "39998:<assistant>:github-accounts", // null when not_found
        "event_id": "<hex>", // the copy as it now stands; null when not_found / failed
        "status": "published", // | "updated" | "unchanged" | "conflict" | "not_found" | "failed"
        "error": null, // a sentence when conflict / not_found / failed
      },
    ],
  },
}
```

- **`404` or `405`**: the UI says "Dictionary concepts aren't available on this server yet",
  as it does for Trusted Lists.
- **Any other non-2xx**: the UI shows `extractApiError`'s message and offers a retry.

## Not asked for (yet)

- **No `GET`.** The UI reads the user's copies straight from the relay: kind 39998,
  `authors=[assistant]`, `#b=[<concepts>]` (`client/src/services/dictionary.ts`). A server
  read can come later if admin needs it at scale.
- **No Treasure Map rows.** The draft spec advertises a copy with a user-signed kind-10040
  row, `["39998:<d>", <assistant>, <relay>]`, plus a blanket `["39998:dlist-header", …]`.
  Only the user can sign their 10040. `/setup` could start emitting those rows, and the
  UI's existing "publish your Treasure Map again" prompt would then carry them. That is a
  separate step, after this one.
- **No scheduled upkeep.** Copies change only when an admin presses the button.
