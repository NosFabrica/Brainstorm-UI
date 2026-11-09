# Connected agents — the key routes the UI needs

**For:** brainstorm_server
**From:** the UI, branch `feat/duty-reassignment-guard`, 2026-11-04
**Filed as:** not yet — a local draft

## What it's for

A person should be able to let an AI agent or another app use Brainstorm for them — search
with their trust scores, read their Treasure Map and lists, and, only if they say so, publish
through their Assistant — without handing over their Nostr key or a session token.

Today there is no way: the server has no key routes, and the only "keys" it knows are the
payment provider's credentials. (Admin › Users already promises "Developer API keys are not
affected" by Sign out everywhere — this is what that sentence will describe.)

The flow was prototyped on `prototype/assistant-ux`, `?variant=KA` (chosen over a one-page
form, `KB`): a list of connected agents, and **Connect an agent** → name it → choose what it may
do → copy its key, shown once. Three steps, so publishing is a choice of its own and the key
has its own screen.

## The permissions

Three, as plain switches in the UI. A key carries the set it was made with; it never grows.

| Scope     | What it lets the agent do                                                                                          | Default           |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `search`  | NIP-50 search and the read endpoints, from this person's perspective (`observer:` their pubkey)                    | on                |
| `read`    | Read their Treasure Map, lists and Dictionary as the UI does                                                       | on                |
| `publish` | Ask their Assistant to sign and publish (the Assistant-signed `POST`s: Dictionary copies, Duty Menu, Treasure Map) | **off**, internal |

**`publish` is internal for now.** It signs with the Assistant's key, which Brainstorm holds, so
only admins can give it to a key until the team opens it up. The server should refuse `publish`
on a key made by anyone else (`403`, `{ "code": "scope", "needs": "admin" }`); `search` and `read`
are for everyone.

A key never signs as the person: there is no scope for their own key, and nothing here can
touch billing, admin or the account itself.

## The endpoints

### 1. `POST /user/agentKeys`

```json
{ "name": "My Claude", "scopes": ["search", "read"] }
```

Answers the key **once**, with what it is:

```json
{
  "data": {
    "id": "ak_…",
    "secret": "bsk_…",
    "name": "My Claude",
    "scopes": ["search", "read"],
    "created_at": 1730000000
  }
}
```

Stored as a hash: the secret is never readable again, by anyone. `name` ≤ 64 characters,
unique per person; at most 10 live keys per person.

### 2. `GET /user/agentKeys`

The person's live keys, never their secrets:

```json
{
  "data": [
    {
      "id": "ak_…",
      "name": "My Claude",
      "scopes": ["search", "read"],
      "created_at": 1730000000,
      "last_used_at": 1730003600
    }
  ]
}
```

### 3. `DELETE /user/agentKeys/{id}`

Revokes it at once; the next request with it is `401`. Only the key's own person may.

### 4. Using a key

`Authorization: Bearer bsk_…` on the same routes a session uses. The request acts as the key's
person with the key's scopes; a route outside them answers `403` with
`{ "code": "scope", "needs": "publish" }`, so an agent can tell its person what to switch on.
Every use updates `last_used_at`. Rate limits are per key.

**Sign out everywhere** ends sessions, not keys — keys are revoked one by one, from Connected agents.

## What the UI shows

- **Connected agents** on Settings › Assistants › Yours, for everyone, below _Also working for
  you_ — one place for everything working for the person. It appears once they have a key; until
  then, a single **Connect an agent**. Each key: name, permission chips, created and last used,
  and **Revoke** behind an in-page confirmation.
- **Connect an agent**: name → permissions (`publish` shown to admins only, off, marked "internal ·
  Signs as your Assistant") →
  the key, shown once with a copy button and a ready prompt — the same prompt the Developers
  page's "Set up with your AI agent" card offers, with the key in it.
- Account › Sign out everywhere notes that connected agents stay connected, and links to them.

## Not asked for (yet)

- Per-key expiry dates, IP allow-lists, or OAuth for third-party apps.
- Keys for anything but a person's own data — an organisation's key is a later question.
