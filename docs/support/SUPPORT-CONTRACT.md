# Priority support — UI ↔ server contract (proposal)

For Enes. The UI (branch `feat/priority-support`, off main) is built and
tested against a browser-local mock of this contract; the full loop — user
files a ticket at `/support`, admin replies from `/admin?tab=support`,
user reads the reply — demos locally with zero server. When these
endpoints exist, the mock retires the same way billing's did.

Lesson applied from the billing contract: this is a **proposal, not a
spec** — if your data model wants different names/shapes (as with
Page[BillingSubscriptionItem]), ship what's right and the UI adapts to
your `/docs`. The semantics below are the part that matters.

## Semantics

- **Server owns entitlement.** `allowed` comes from your billing ledger
  (paid grant ⇒ true). The UI has NO dependency on billing code — free
  users get a teaser, and the UI never decides who's entitled.
- **The in-app thread is the source of truth.** Email is outbound-only
  notification: when support replies to a ticket that has `notify_email`,
  send a heads-up from **support@nosfabrica.com** ("The Brainstorm team
  replied — open Brainstorm to read it"). Do NOT include the reply body in
  the email (it lives behind the login). **No inbound email parsing** in
  v1 — replies to the notification address can bounce with an
  auto-responder pointing at /support, or land in a monitored inbox.
- **Statuses are an open set.** Known: `open` (user awaiting support),
  `answered` (support replied), `closed`. The UI renders unknown values
  neutrally; add states freely.
- **Category is required at filing and an open set on the wire.** The UI's
  launch set: `billing` · `scores` · `alerts` · `account` · `bug` ·
  `other` (labels live client-side in `SUPPORT_CATEGORIES`). Store
  verbatim, echo back on tickets — it drives the admin filters and is the
  hook the FAQ-deflection (and later a knowledge-base/AI answerer) hangs
  off. No user-set severity by design: at our volume every ticket IS
  priority; category + status is the whole triage model.
- Message authors: `user` | `support`. The UI renders `support` as
  "Brainstorm Support · support@nosfabrica.com".

## User endpoints (session-authed)

```
GET  /user/support
  → { data: { allowed: boolean, tickets: [
      { id, subject, category, status, created_at, last_message_at,
        last_message_author, closed_at } ] } }
  (author: "user" | "support"; closed_at null unless status is closed.
   allowed:false ⇒ tickets [] — the UI shows the teaser)

POST /user/support/tickets
  { subject, body, category, notify_email?, diagnostics? }  → { data: ticket }
  (403 when not entitled — belt and braces with `allowed`.
   diagnostics: a flat {label: string} object the client collects — app
   version, browser, page, screen, recent console errors — sent only with
   the user's consent (default-on checkbox with a full disclosure). Store
   verbatim, size-cap generously (~10KB); echoed on the thread read.)

GET  /user/support/tickets/{id}
  → { data: { ticket, messages: [ { id, author, body, created_at } ],
              events: [ { type, at, by } ] } }
  (events = the lifecycle on the record: "opened"/"closed"/"reopened"/
   "recategorized", open set, by: "user"|"support". The UI renders them
   inline in the thread timeline, timestamped to the minute.)

POST /user/support/tickets/{id}/messages
  { body }                                → { data: message }
  (ALLOWED on closed tickets — a user reply ALWAYS sets status "open":
   replying is reopening, and any user reply puts the ticket back in
   support's court. No separate reopen endpoint.)
```

## Admin endpoints (admin-authed, like /admin/scheduling)

```
GET  /admin/support/tickets
  → rows also carry { pubkey, notify_email } — the requester's identity
POST /admin/support/tickets/{id}/messages   { body }   (author=support;
     triggers the notification email when notify_email is set)
PATCH /admin/support/tickets/{id}           { category }
     (admin recategorization — users mislabel; category drives filters and
      KB routing. Records a "recategorized" event.)
POST /admin/support/tickets/{id}/close      { message? }
     (message present ⇒ append it as a support message — and send the
      notification email — then set closed. The UI queues an editable
      closing note in its confirm dialog; nothing auto-sends.)
```

## Explicitly out of scope (v1)

- Read/unread state — the UI tracks "seen" per device (localStorage), so
  notification dots need no server surface. Server-side read-state only
  becomes worth it if multiple support agents need shared read receipts.
- **File attachments (screenshots/video)** — needs real storage, size
  limits, scanning, and authed serving. The diagnostics snapshot covers
  most troubleshooting needs meanwhile. Proposed v2 shape when it's time:
  `POST /user/support/tickets/{id}/attachments` (multipart; images +
  short video; ~10MB cap; served authed to the ticket's user + admins) —
  the UI adds a paperclip to both composers against whatever /docs says.

- Inbound email → thread parsing (the heavy helpdesk machinery).
- Nostr-DM notifications (v2 candidate: DM from a Brainstorm support key
  as an alternative to email — the UI's contact copy already avoids
  promising email-only).
- Attachments, SLA timers, canned responses, assignment/ownership.

## UI reference

`client/src/services/support.ts` (the seam — mock today, your endpoints
tomorrow), `client/src/pages/SupportPage.tsx`,
`client/src/components/admin/support/AdminSupportCards.tsx`.
