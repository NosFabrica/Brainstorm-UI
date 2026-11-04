# Editing the Assistant's profile — the server change the UI needs

**For:** brainstorm_server
**From:** the UI, branch `feat/duty-reassignment-guard`, 2026-11-04
**Filed as:** not yet — a local draft
**Modelled on:** Tapestry's `POST /api/assistant/publish-profile` (`src/api/assistant/index.js`,
ADR `assistant-profile/0005`) and its Edit Assistant Profile page
(`ui/src/components/AssistantProfileEditor.jsx`), so the two apps edit an Assistant the same way.

## What it's for

A person's Brainstorm Assistant has a profile (kind 0) that other apps show: its name,
picture, banner and bio. Today the server writes it and the person can't change it:
`POST /user/assistantProfile` ignores its body and always publishes
"‹owner›'s Brainstorm Assistant" with the default bio and picture. The UI already sends
fields to it (`publishBrainstormAssistantProfile`), and they are dropped.

The Assistant card's **Customize › Name, picture & bio** is waiting on this, shown and marked
"soon". The flow it will open was prototyped on `prototype/assistant-ux`, `?variant=PB` (chosen
over a side sheet, `PA`): the Assistant card turns into its own form in place, as Settings ›
Profile's **Edit** does for the person's own profile — fields beside a live preview of the card,
"Reset to default" per field, one Publish.

## The endpoints

### 1. `GET /user/assistantProfile`

What the form opens with: the defaults this server would publish, field by field, so
"Reset to default" can fill them in without the UI copying the server's wording.

```json
{
  "data": {
    "assistant": "<64-hex ta_pubkey>",
    "defaults": {
      "name": "…'s Brainstorm Assistant",
      "display_name": "…",
      "about": "…",
      "picture": "https://…",
      "banner": "https://…",
      "website": "https://…",
      "lud16": ""
    },
    "nip05": "<handle>@brainstorm-staging.nosfabrica.com"
  }
}
```

The current profile is read from relays, as the card does today; this answers only what the
server alone knows.

### 2. `POST /user/assistantProfile` takes the fields

```json
{
  "content": {
    "name": "…",
    "display_name": "…",
    "about": "…",
    "picture": "https://…",
    "banner": "https://…",
    "website": "https://…",
    "lud16": "…"
  }
}
```

- **Whose:** the JWT's user's own Assistant only, as today — no `pubkey` in the body to get wrong.
- **What:** a `content` object is published as sent; fields left out take the defaults.
  An empty body keeps today's behaviour, the default profile, so `publishDefaultAssistantProfile`
  keeps working.
- **Server-managed, never from the body:** `nip05` (the Assistant's handle on this deployment —
  the UI names an Assistant by the host it verifies on, `docs/agents/assistants.md`) and the
  `["client", "Brainstorm"]` tag. A `nip05` in `content` is ignored.
- **Limits worth stating:** `picture`/`banner`/`website` are `https` URLs; `name` ≤ 64 characters,
  `about` ≤ 1,000. A refusal names the field (`400`, `{ "field": "picture", "error": "…" }`).
- **Answer:** today's `event_id` and `assistant_pubkey`, plus what each relay said:
  `"relays": [{ "url": "wss://…", "ok": true }]` — the Duty Menu publish already answers this way.

## What the UI shows

- **Customize › Name, picture & bio** turns on when `GET` answers; on a server without it, it stays
  "soon".
- Edit in place, on the Assistant card itself — the same gesture as editing your own profile:
  fields from the current profile, defaults from `GET`, a live preview, one **Publish** ("Your
  Assistant signs it — one tap") and Cancel, then the relay report and _View on Nostr_.
- Only this deployment's Assistant is editable here. Another deployment's Assistant, in
  _Your Assistants_, links out to that site — only its server holds its key.

## Not asked for (yet)

- Uploading images; the fields take URLs.
- Editing another deployment's Assistant from here.
- An "Assistant DMs me when scores recalculate" switch (issue #12) — a separate ask once the profile exists.
