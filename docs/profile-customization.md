# Public Profile Customization — Technical Breakdown

How a logged-in user customizes their **public `/p/` page**, and how it's stored
on Nostr. This is the "how it works today" doc for the dev team. For the
generalized, cross-client standard we could propose from this, see
[nips/profile-presentation.md](nips/profile-presentation.md).

## 1. Design principles

- **User-owned, not app-owned.** Preferences are a Nostr event signed by the
  *user's* key and stored on relays. Brainstorm holds nothing; it is a pure
  client here.
- **Opt-out model.** Everything renders by default. The record stores only what
  to *hide* and how to *reorder* — so a client (or a future version) that ignores
  the record still shows a sane, full profile.
- **Public.** The event is world-readable — that's the point: every visitor's
  view of the `/p/` page reflects the owner's choices.
- **Draft-then-publish.** Edits live in a local draft until the owner hits
  **Save**; only then is anything signed and broadcast.

## 2. The event — NIP-78, kind 30078

Customization is stored as **NIP-78 "Arbitrary custom app data"** —
`kind: 30078`, a **parameterized-replaceable (addressable)** event. Relays keep
only the newest event per `(pubkey, kind, d-tag)`, so re-saving overwrites
cleanly (no migrations).

It is namespaced by its `d` tag:

```
d = "brainstorm.world/profile-prefs"     // client/src/services/nostr.ts (PROFILE_PREFS_D_TAG)
```

Brainstorm uses the same NIP-78 pattern with `d = "brainstorm.world/assistant"`
for a separate settings object — one app, multiple independent records under one
key.

Example event as published today:

```jsonc
{
  "kind": 30078,
  "pubkey": "<owner-hex-pubkey>",
  "created_at": 1751990400,
  "tags": [["d", "brainstorm.world/profile-prefs"]],
  "content": "{\"v\":1,\"hidden\":[\"status\",\"videos\"],\"order\":[\"featured\",\"notes\",\"photos\"],\"pinnedFollowers\":[\"<pk1>\",\"<pk2>\"],\"roles\":[\"developer\",\"founder\"]}",
  "id": "<event-id>",
  "sig": "<schnorr-sig>"
}
```

## 3. Content schema (`ProfilePrefs`)

Defined in `client/src/config/personalization.ts`:

| Field             | Type       | Meaning |
| ----------------- | ---------- | ------- |
| `v`               | `1`        | Schema version |
| `hidden`          | `string[]` | Section/hero keys the owner hid |
| `order`           | `string[]` | Section keys in display order; missing keys fall back to default order |
| `pinnedFollowers` | `string[]` | Hand-picked pubkeys for the "Followed by" row; empty ⇒ auto top-trusted |
| `roles`           | `string[]` | **Retired 2026-08-05** — self-declared role keys. No longer rendered or editable; decentralized tags replaced them (`docs/decentralized-tagging/DECISIONS.md` §3). Still parsed and re-serialized so existing users' saved values survive a save, and offered back to the owner as one-tap tags. |

Customizable surfaces:

- **Sections** (reorder + hide) — `featured, live, events, articles, audio,
  videos, photos, notes`. Each maps to a Nostr content kind: notes=`1`,
  articles=`30023`, photos=`20`, videos=`21`, music=`31337`, live=`30311`.
- **Hero elements** (hide only) — `bio, topics, followedBy, tenure, identities,
  status`. Core identity (name / avatar / npub / WoT score / stats) is **always
  shown**, intentionally not toggleable.
- **Roles** — from a fixed vocabulary (`ROLES` in the same file).

## 4. Write path — `publishProfilePrefs()`

`client/src/services/nostr.ts`:

1. Build the `kind: 30078` event with `tags: [["d", …]]` and
   `content: JSON.stringify(prefs)`.
2. **Sign** with the user's key — NIP-07 browser extension (`window.nostr`) or a
   locally-held key (NIP-49-encrypted backup).
3. **Publish** to the user's write relays, selected from their **NIP-65 outbox
   list** (`loadOutboxRelayListFromDb`).

## 5. Read path — `fetchProfilePrefs()`

`client/src/services/nostr.ts`:

1. Query `{ kinds: [30078], authors: [pubkey], "#d": ["brainstorm.world/profile-prefs"] }`.
2. Keep the newest by `created_at`; `JSON.parse` the content.
3. Coerce through `parseProfilePrefs` (`client/src/lib/personalization.ts`) —
   defensive validation, since it's untrusted public JSON.
4. `SharePage` applies it: `isHidden(key)`, reordered sections,
   `pinnedFollowers || auto`. (Role chips used to render here; decentralized
   tags replaced them.)

## 6. Editor UX

- Owner-only **inline edit mode** on the owner's own `/p/` page
  (`ProfileCustomizer`, drag-to-reorder via framer-motion).
- Edits cached to a **local draft**: `brainstorm_profile_prefs_draft:<pubkey>`
  (`client/src/lib/personalization.ts`) — snappy, survives refresh, and
  **nothing is public until Save**.
- Save → `publishProfilePrefs` → draft cleared.

## 7. File map

| Concern | File |
| ------- | ---- |
| Schema, section/hero/role vocab | `client/src/config/personalization.ts` |
| Parse + local draft cache | `client/src/lib/personalization.ts` |
| Publish/fetch (Nostr) | `client/src/services/nostr.ts` (`publishProfilePrefs`, `fetchProfilePrefs`) |
| Editor UI | `client/src/components/share/ProfileCustomizer.tsx` |
| Apply on public page | `client/src/pages/SharePage.tsx` |

## 8. How Nostr supports it

| Property | How Nostr provides it |
| -------- | --------------------- |
| **User ownership** | The record lives under the user's pubkey, signed by their key — Brainstorm can't alter it |
| **Portability** | Any client could read/write the same `d` tag; not locked to Brainstorm |
| **"Settings" semantics** | Parameterized-replaceable (30078) ⇒ newest-wins, no row migrations |
| **No backend** | Relays store and serve it; Brainstorm is a pure client |
| **Consistent public view** | Public event ⇒ every viewer resolves the same prefs |

Related NIPs on the same page: **NIP-65** (which relays to publish/read),
**NIP-07 / NIP-49** (signing / encrypted key backup), **NIP-85**
(`kind 30382` / `10040`, the WoT score — separate from customization), **kind 0**
(profile metadata the customizer layers on top of).

## 9. Known limitations

- **App-namespaced** (`brainstorm.world/…`) ⇒ no other client reads it yet.
  Generalizing this is the point of [nips/profile-presentation.md](nips/profile-presentation.md).
- The **roles** vocabulary is Brainstorm-defined; the `kind` mappings in
  `config/personalization.ts` are marked "indicative." `ROLES` outlived the role
  chips — it now seeds the tag picker's suggestions.
- A **separate** system — search "Personalization" (`PersonalizationPrefs`) — is
  **localStorage-only**, *not* on Nostr yet (`client/src/lib/personalization.ts`,
  `loadPersonalization`/`savePersonalization`). Don't conflate the two.
