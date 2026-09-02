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
      { id, subject, status, created_at, last_message_at } ] } }
  (allowed:false ⇒ tickets [] — the UI shows the teaser)

POST /user/support/tickets
  { subject, body, category, notify_email? }  → { data: ticket }
  (403 when not entitled — belt and braces with `allowed`)

GET  /user/support/tickets/{id}
  → { data: { ticket, messages: [ { id, author, body, created_at } ] } }

POST /user/support/tickets/{id}/messages
  { body }                                → { data: message }
  (refuse on closed tickets)
```

## Admin endpoints (admin-authed, like /admin/scheduling)

```
GET  /admin/support/tickets
  → rows also carry { pubkey, notify_email } — the requester's identity
POST /admin/support/tickets/{id}/messages   { body }   (author=support;
     triggers the notification email when notify_email is set)
POST /admin/support/tickets/{id}/close
```

## Explicitly out of scope (v1)

- Inbound email → thread parsing (the heavy helpdesk machinery).
- Nostr-DM notifications (v2 candidate: DM from a Brainstorm support key
  as an alternative to email — the UI's contact copy already avoids
  promising email-only).
- Attachments, SLA timers, canned responses, assignment/ownership.

## UI reference

`client/src/services/support.ts` (the seam — mock today, your endpoints
tomorrow), `client/src/pages/SupportPage.tsx`,
`client/src/components/admin/support/AdminSupportCards.tsx`.
