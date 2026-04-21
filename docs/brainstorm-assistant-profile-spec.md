# Brainstorm Assistant Profile — Kind 0 Publish Spec

> **Version:** 1.0  
> **Date:** April 2026  
> **Audience:** Backend developers implementing `POST /user/publishAssistantProfile`  
> **Reference:** NIP-85 Appendix 1 — Service Provider Agent Profiles  
> **Frontend status:** UI fully wired and ready — endpoint currently returns 404/405

---

## Overview

When a user activates their Brainstorm Assistant (from the Agent Suite panel), the frontend collects profile fields and sends them to the backend. The backend should construct a **kind 0** (profile metadata) Nostr event and publish it to relays, making the assistant discoverable across the network.

---

## Endpoint

```
POST /user/publishAssistantProfile
Headers: access_token: <session_token>
Content-Type: application/json
```

---

## Request Body — User-Provided Fields

These fields come directly from user input in the Agent Suite UI. All are optional except `name`.

```json
{
  "name": "Alice's Trust Agent",
  "about": "A Brainstorm-powered trust scoring assistant operating on the Nostr Web of Trust.",
  "picture": "https://example.com/avatar.png",
  "banner": "https://example.com/banner.png",
  "lud16": "alice@getalby.com",
  "nip05": "alice@brainstorm.foo",
  "website": "https://brainstorm.foo"
}
```

| Field | Type | Required | Max Length | Description |
|-------|------|----------|-----------|-------------|
| `name` | string | **Yes** | 150 chars | Display name for the assistant. Validated on frontend — user cannot publish without it. |
| `about` | string | No | 500 chars | Free-text description. Maps to `about` in kind 0 content. |
| `picture` | string (URL) | No | — | Avatar image URL. Displayed as the assistant's profile picture on Nostr clients. |
| `banner` | string (URL) | No | — | Banner image URL. Shown as header/cover image on supporting clients. |
| `lud16` | string | No | — | Lightning address for tips/zaps (e.g. `user@getalby.com`). Maps to `lud16` in kind 0. |
| `nip05` | string | No | — | NIP-05 verification identifier (e.g. `user@brainstorm.foo`). Maps to `nip05` in kind 0. |
| `website` | string (URL) | No | — | Website URL. Maps to `website` in kind 0 content. |

### Frontend Source

- **State variables:** `UserPanelPage.tsx` lines 194–200
- **Payload builder:** `getProfilePayload()` at line 370
- **API call:** `apiClient.publishBrainstormAssistantProfile(profile)` in `api.ts` line 246

---

## Kind 0 Event Construction

The backend should build the kind 0 event as follows:

### Content Field (JSON string)

Merge user-provided fields with server-side templated fields:

```json
{
  "name": "<user_provided>",
  "display_name": "<same as name>",
  "about": "<user_provided>",
  "picture": "<user_provided>",
  "banner": "<user_provided>",
  "lud16": "<user_provided>",
  "nip05": "<user_provided>",
  "website": "<user_provided>",
  "bot": true
}
```

### Tags

```json
[
  ["client", "Brainstorm"],
  ["p", "<brainstorm_service_pubkey>", "<nip85_relay_url>", "service_provider"]
]
```

### Templated Fields (Server-Side, Same for All Profiles)

These should be injected by the backend — they are NOT sent from the frontend:

| Field / Tag | Value | Purpose |
|-------------|-------|---------|
| `bot` (in content) | `true` | NIP standard flag indicating this is an automated/agent account |
| `display_name` (in content) | Same as `name` | Ensures compatibility with clients that use `display_name` |
| `["client", "Brainstorm"]` tag | `"Brainstorm"` | Identifies the publishing client |
| `["p", "<service_pubkey>", ...]` tag | Brainstorm's service pubkey | Links the assistant to Brainstorm as the service provider per NIP-85 |

---

## Signing & Publishing

### Option A: User's Delegated Key
If the user has granted delegation (NIP-26), sign the kind 0 event with the delegated key and include the delegation tag.

### Option B: Service Key with User Attribution
Sign with Brainstorm's service key and include a `["p", "<user_pubkey>"]` tag attributing the profile to the user.

### Relay Targets
Publish to standard profile relays. Recommended set:

```
wss://relay.damus.io
wss://relay.nostr.band
wss://nos.lol
wss://relay.snort.social
<nip85_relay_url>
```

> The `<nip85_relay_url>` placeholder is supplied at build time via the
> `VITE_NIP85_RELAY_URL` environment variable (see `README.md` and
> `Dockerfile`).

The frontend confirmation dialog (UserPanelPage.tsx line 1335) tells users: *"This will publish a kind 0 profile event to 5 Nostr relays."*

---

## Response

### Success
```json
{
  "code": 200,
  "message": "Profile published successfully",
  "data": {
    "event_id": "<nostr_event_id>",
    "relays_published": ["wss://relay.damus.io", "wss://nos.lol"],
    "pubkey": "<assistant_pubkey>"
  }
}
```

### Error
```json
{
  "code": 400,
  "message": "Name is required",
  "detail": "The 'name' field must be a non-empty string"
}
```

---

## Frontend Behavior (Already Implemented)

### On Success (HTTP 2xx)
- Agent state transitions to `"active"` with `publishedAt` timestamp
- Toast: "Assistant deployed! {name} is now live on the Nostr network."
- Agent Suite panel shows green "Active" status badge

### On 404/405 (Endpoint Not Yet Available)
- Frontend gracefully falls back to **local-only activation**
- Agent state still transitions to `"active"` (stored in localStorage)
- Toast: "Assistant activated! {name} is now active. Network publishing coming soon."
- No error shown to user

### On Other Errors
- Agent state reverts to `"dormant"`
- Toast with destructive variant showing error message

### Update Flow
- Same endpoint, same payload — called again when user edits and clicks "Update"
- The backend should overwrite the previous kind 0 event (standard Nostr behavior — latest kind 0 wins)

---

## UI Field Locations in Agent Suite Panel

The Agent Suite is located at `/user-panel` (UserPanelPage.tsx). The input fields appear in the agent configuration section:

1. **Name** — Text input, prominent at top of agent card
2. **About/Description** — Textarea below name
3. **Picture URL** — URL input with live preview in agent avatar
4. **Banner URL** — URL input
5. **Lightning Address (lud16)** — Text input
6. **NIP-05 Identifier** — Text input
7. **Website** — URL input

All fields persist in `localStorage` under key `brainstorm_agent_state` between sessions.

---

## Validation Rules

### Frontend (already implemented)
- `name` must be non-empty (checked before publish is allowed)
- All URL fields accept any string (no strict URL validation)

### Backend (recommended)
- Reject if `name` is empty or whitespace-only
- Validate `picture`, `banner`, `website` as valid URLs if provided
- Validate `lud16` format (should contain `@`)
- Validate `nip05` format (should contain `@`)
- Strip/sanitize all fields to prevent injection
- Rate limit: max 1 publish per user per 60 seconds

---

## File References

| File | Lines | What |
|------|-------|------|
| `client/src/pages/UserPanelPage.tsx` | 106–117 | `AgentState` interface |
| `client/src/pages/UserPanelPage.tsx` | 138–152 | Default state & localStorage persistence |
| `client/src/pages/UserPanelPage.tsx` | 194–200 | Input state variables |
| `client/src/pages/UserPanelPage.tsx` | 370–378 | `getProfilePayload()` — builds the POST body |
| `client/src/pages/UserPanelPage.tsx` | 390–421 | Publish & update mutation handlers |
| `client/src/pages/UserPanelPage.tsx` | 423–439 | Activation flow with validation |
| `client/src/services/api.ts` | 246–265 | `publishBrainstormAssistantProfile()` — API call |
| `client/src/components/ActivateBrainstormModal.tsx` | 11–64 | NIP-85 activation modal (Trust Attestation) |
