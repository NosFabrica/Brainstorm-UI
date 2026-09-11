> **SUPERSEDED 2026-09-01.** It still documents the email-correlation identity design, a `rail` field, a `tier`-shaped
> `/user/subscription` and a `/cancel_user_subscription` endpoint — none of which are real.
> The live contract is the server's own OpenAPI; the design and its reasoning are in
> `.scratch/payments-flash/`. Kept for history — do not build from it.

# Flash subscriptions — backend integration

What the backend needs to build so a Brainstorm account becomes a paying one.
Written for the server side; the UI side is already scaffolded and is described
here only where the two meet.

**Read the "Verified vs unverified" note before building anything.**

---

## Verified vs unverified

Flash's public docs at `docs.paywithflash.com` describe an **older product
surface** — `app.paywithflash.com/subscription-page?flashId=459`, numeric ids,
a `?params=<base64>` pre-fill scheme. Our account is on a **different, newer
one**: `dev.server.vault.paywithflash.com`, UUID ids, no pre-fill at all.

Everything marked **VERIFIED** below was fetched from our live dev signup page on
2026-08-17. Everything marked **UNVERIFIED** comes from those public docs and
**may not match the vault**. Confirm the webhook shape against a real delivery
before relying on it — that is the one piece we could not test from outside.

---

## The shape of the integration

```
user clicks Subscribe
  → Brainstorm collected an email in an earlier design (superseded — see below), stores pubkey ↔ email
  → new tab to Flash's hosted signup page (card details never touch us)
  → Flash charges the card
  → Flash POSTs a webhook to us
  → we move that pubkey onto the Priority scheduling policy
  → GET /user/subscription reports the new state; the UI follows
```

Flash owns the card form and the recurring charge. We own the mapping from a
payment to an account, and what that account then gets.

---

## What Priority actually gets you

**The paid tier is a scheduling policy.** No new entitlement system is needed —
the scheduler already does all of this:

| `SchedulingItem` field | what it buys |
| --- | --- |
| `schedule_interval_seconds` | **Priority 7 days / free default 60 days** |
| `priority` | position in the calculation queue |
| `is_default` | the free tier's policy |

`manual_quota_limit` is deliberately NOT a tier difference. Manual recalculation
stays unlimited on both, rate-limited only to stop abuse — the default of 20 per
week already does that. Selling a smaller allowance would be selling friction.

So entitlement enforcement is one existing call:

```
PUT /admin/users/{pubkey}/scheduling     → move a pubkey between policies
```

**Prerequisite:** a Priority policy has to exist, created in the admin panel at a
**7-day** interval with its queue priority set, and the free default confirmed at
**60 days**. The pricing page quotes both numbers, so they should be real before
it ships.

---

## Identity: how a payment finds an account

**This is the hardest part of the integration, and it needs a pending-checkout
record rather than an email lookup.**

VERIFIED: the vault signup form collects only `email` (required), `name`
(optional), card details and a billing address. There is **no `external_uuid`,
`npub`, or any other external-id field**. And the page reads no query string at
all — it contains no `URLSearchParams`, no `location.search`, no parameter
handling of any kind, so the documented `?params=<base64 JSON>` pre-fill and
every plain-parameter form are inert. **Nothing can be carried into that page.**

The obvious workaround — ask for the email on our side first and match on it —
was built and then removed. It made someone type the same address twice, on two
pages, to buy one thing, which is the worst possible friction to add at the
moment of payment. It also only ever produced a guess: nothing stops a person
typing a different address on Flash's page, and then they have paid and received
nothing.

### The design instead

1. **On "Continue to payment"**, the client tells the backend a checkout is
   starting: `POST /user/checkout-intent` with the authenticated pubkey.
   Backend records `(pubkey, created_at, status=pending)`.
2. **The user pays**, typing their email once, on Flash's page.
3. **The webhook arrives** with an email we have never seen. Match it to the
   pending intent — the one within a recent window (30 minutes is generous).
   - exactly one candidate → bind, apply the Priority policy, store the email
   - zero or more than one → **hold, and alert**. Never guess: the failure mode
     must be "a human looks at it", not "the wrong account is upgraded".
4. **On return**, the client polls (it already refetches on window focus). If a
   held payment matches their pending intent, offer a one-click confirmation —
   *"we matched a $2 payment from b•••@example.com, is that you?"* — which is
   both less work than typing and a firmer binding than two strings agreeing.

At first-paid-user volume, step 3 collides essentially never, and it degrades
safely when it does.

Store the email from the webhook regardless — it is how support finds someone,
and it is what the ticket system keys on. It just isn't the *join*.

### Ask Flash

Whether an external id can be attached to a subscription — pre-fill, a form
field, or an API that creates it server-side with one attached. Their older
surface supported `npub` and `external_uuid` pre-fill, so this may be an
unported feature rather than a deliberate omission. The moment it exists, the
join key becomes the hex pubkey and this whole section collapses to one line.

---

## Endpoints

### VERIFIED — the hosted signup page

```
https://dev.server.vault.paywithflash.com/subscriptions/signup/{serviceId}/{planId}
```

| | dev |
| --- | --- |
| serviceId | `019eb7e1-c789-731e-9c9a-e84e83500097` |
| planId | `019ef08a-3c5f-7228-a15b-4838937045f5` |
| price | `data-amount="200"`, `data-currency="USD"` |

**Amounts are in minor units** — `200` is $2.00. Store and compare them that way;
don't round-trip through floats.

The service-level URL (without `{planId}`) is only a "Get started" interstitial.
Production will be a different vault with different ids — keep both in config.

### UNVERIFIED — Flash's read/cancel API

```
POST /get_user_subscription_details    { flash_id, + one of: email | npub | external_uuid }
POST /cancel_user_subscription         { flash_id, + one of: email | npub | external_uuid }
```

Useful as a reconciliation backstop: if a webhook is missed, this answers
"is this person actually paid?" without waiting for the next event.

### UNVERIFIED — webhooks

Five events, POSTed as `{ "data": { … } }`:

| event | meaning |
| --- | --- |
| `user_signed_up` | first payment succeeded |
| `renewal_successful` | recurring charge succeeded |
| `renewal_failed` | recurring charge failed |
| `user_paused_subscription` | user paused |
| `user_cancelled_subscription` | user cancelled |

`data` carries `email`, `public_key`, `external_uuid`, `user_plan`,
`user_plan_id`, `signup_date`, `next_payment_date`, and on payment events
`transaction_id`, `transaction_amount`, `transaction_currency`,
`transaction_date`.

Authentication is a JWT in the `Authorization` header, HS256, signed with the
subscription secret. **Verify the signature before acting** — this endpoint moves
people between billing tiers, so an unsigned POST must not be able to grant
anyone a paid policy. Respond `200`; Flash retries otherwise, so handlers must be
idempotent (the same `transaction_id` arriving twice must not double-apply).

Where the webhook URL and secret are configured is an open question — the
Settings tab in the dashboard is currently greyed out.

---

## What to do on each event

| event | action |
| --- | --- |
| `user_signed_up` | resolve email → pubkey; `PUT /admin/users/{pubkey}/scheduling` → Priority; record period end |
| `renewal_successful` | extend period end; ensure still on Priority |
| `renewal_failed` | mark `past_due`; **stay on Priority through the 7-day grace** |
| `user_paused_subscription` | → default policy |
| `user_cancelled_subscription` | → default policy at end of the current period, not immediately |

Dunning and cancellation are configured in Flash, not by us: 3 attempts, 3 days
apart, 7-day grace, cancel after the final failure; cancellation takes effect at
the end of the period. Mirror those rules rather than inventing our own, or the
two will disagree about who is paid.

---

## What to persist

| field | why |
| --- | --- |
| `pubkey` | the account; the key everything else hangs off |
| `email` | the join key from Flash, and how support finds them |
| `tier` | `free` \| `priority` |
| `status` | `none` \| `active` \| `past_due` \| `grace` \| `canceled` |
| `current_period_end` | drives renewal display and the grace window |
| `rail` | `card` now, `flash-lightning` later |
| Flash `service_id` / `plan_id` / last `transaction_id` | reconciliation and idempotency |

---

## The endpoint the UI already expects

```
GET    /user/subscription     → { tier, status, current_period_end, rail }
DELETE /user/subscription     → cancel
```

Both authenticated as the current user. `snake_case` is fine — the client's
`normalize()` in `client/src/services/subscription.ts` already accepts either
casing and coerces unknown values to safe defaults, so a partial or unexpected
response degrades to "free" rather than throwing.

The client talks to these endpoints and nothing else — there is no mock seam
and no flag to switch away from the server.

**One caution:** the free tier must be what an *error* resolves to. A backend
timeout should never read as "paid", and equally should never strip a paying
user's policy — the scheduling assignment is the source of truth for what they
actually get, and this endpoint only reports it.

---

## Operating it: admins and self-service

Most of this already exists. `AdminUser` carries `scheduling_id` and
`scheduling_name`, the Users table renders a schedule chip per row,
`UserTierPicker` reassigns a user inline, and `PolicyUsersInline` lists everyone
on a policy. Since the paid tier *is* a scheduling policy, "who is on Priority"
is answerable today. What's missing is the billing half and the failure states.

### Admin: show both columns, not one

Three systems hold an opinion — Flash took the money, our record says what the
webhook wrote, the policy says what they actually receive. **Show billing status
and scheduling policy as separate columns.** When they disagree, that IS the bug:
someone paying who isn't being recalculated weekly, or someone on the paid policy
who stopped paying. It should be findable by sorting a column rather than by
someone complaining.

Legitimate combinations: `free` + default, `priority` + Priority, `comped` +
Priority. Anything else is a fault.

### `comped` is an explicit status

An admin moving someone onto the Priority policy by hand — a teammate, an early
tester, goodwill after a billing mess — otherwise produces a row that is
character-for-character identical to a bug. The admin action writes a
subscription record with `status: "comped"` rather than leaving it empty, so the
divergence report above stays meaningful and "why is this person on Priority"
doesn't require archaeology.

### Held payments need a queue that alerts

The identity design holds rather than guesses when a webhook can't be matched.
**A held payment is the worst state in the system** — a card was charged and the
person received nothing. It needs a visible admin list (email, amount, timestamp,
candidate pubkeys) with one-click bind to an account, reusing the
`UserTierPicker` pattern. And it must **alert**: nobody refreshes an admin tab
hoping to find someone they have wronged. At this volume it should fire almost
never, which is exactly why it cannot depend on someone remembering to look.

### Self-service

- **Billing lives in Settings → Billing**, beside the other account-level
  settings (relays, verified threshold, NIP-85 provider). `/billing` stays as a
  short alias onto that tab so receipts, support replies and the account menu
  have a stable URL. `BillingCard` on `pricing-flow` already renders tier,
  status, renewal date and rail from the subscription seam.
- **Cancellation happens in our UI**, with the backend calling Flash's
  `/cancel_user_subscription`. A card-only subscriber gives an email and a card
  — no password, so there is probably nothing for them to log into on Flash's
  side. Cancelling as easily as subscribing is close to a legal requirement in
  several jurisdictions. This depends on Flash's cancel endpoint, which is
  **unverified** — confirm it before shipping the button.
- **The Billing tab is the receipt.** Amount, last payment, next renewal and
  status, checkable any time. Confirm whether Flash emails a receipt and, if so,
  say on the checkout screen that one is coming. Not building email
  infrastructure for a $2 subscription at this volume.
- **Upgrade** is free → Priority and nothing else, so it is the pricing page and
  the existing checkout. The account menu already routes non-prioritys there.

## Where users and admins see all this

### Users: `/insights` is the account page

It already calls itself one — *"your account standing, and exactly how and when
your scores were computed"* — and already shows last calculated, duration, status
and publication state. Plan, next scheduled run and calculation history join it
there. The split to hold: **Settings holds what you CHANGE, Insights holds what
you CHECK.**

`GET /user/history` already exists in `api.ts` and nothing renders it. That is
the calculation history, already built and unused.

**Only show what we can stand behind.** No transactions or receipt panel until
Flash's `/get_user_subscription_details` transactions array is verified — an
unverified receipt is worse than no receipt. Plan, status, renewal date, run
history: all things we know.

**The free user's plan row states facts and links once.** Last calculated, next
run, and a quiet "Priority recalculates every 7 days". No urgency, no colour, no
repetition — someone seeing "47 days ago" next to "next run in 13 days" already
has the argument. This is the page people open when something feels wrong; it
must not sell at them.

### Admins: link out to Flash rather than mirroring it

Give the admin user view a **deep link into the Flash vault** so anyone
investigating a payment lands on the authoritative source in one click, instead
of reading our copy of it. Service detail today:

```
https://dev.vault.paywithflash.com/subscriptions/services/{serviceId}
```

A per-subscriber deep link would be better — ask Flash whether one exists.

This is deliberately not a proxy. Flash took the money, so Flash is authoritative
about it; a second ledger we maintain is a reconciliation problem invented to
solve a display problem.

### Not building: user-chosen run timing

`schedule_interval_seconds` lives on the **policy**, not the user, and
`PUT /admin/users/{pubkey}/scheduling` assigns a policy rather than a time. Per-user
timing is a new backend concept, it fights the scheduler's job of spreading load,
and manual recalculation is already unlimited — so "run it when I want" is a
button anyone can press. The valuable thing in that space is a **completion
notice** ("recalculated, 3 people moved into your verified range"), which needs no
scheduling concept and fits the assistant direction already on the roadmap.

## Configuration

Client-side, three runtime vars. None are secrets — the signup page is public
and its ids are visible in the URL. The **webhook secret is not one of these**
and must never reach the client.

```
VITE_FLASH_BASE_URL=https://dev.server.vault.paywithflash.com
VITE_FLASH_PRIORITY_CARD=019eb7e1-c789-731e-9c9a-e84e83500097/019ef08a-3c5f-7228-a15b-4838937045f5
```

Locally these go in **`client/.env`** — not the repo root. Vite's `root` is
`client/`, so a root-level `.env` is silently ignored and everything reads as
unconfigured. For staging and production they belong in the k8s chart
(`charts/brainstorm/staging-values.yaml` → `ui.env`), which renders `config.js`.

With `VITE_FLASH_BASE_URL` unset the UI says payments aren't configured in this
environment rather than pretending — that is the intended state anywhere the
vault isn't wired.

## Open questions for Flash (meeting list, ordered by what blocks launch)

**Blockers**

1. What is the vault's actual webhook contract, and where are the URL and secret
   configured? The dashboard's Settings tab is greyed out, and the documented
   five-event/JWT contract belongs to the older surface. This is the answer the
   backend build waits on.
2. Can an external id (our hex pubkey) be attached to a subscription — pre-fill,
   a form field, or a server-side create API? Billing identity currently rests
   on correlating a user-typed email. The older surface supported `npub` and
   `external_uuid` pre-fill; is that unported or removed?
3. Does `/cancel_user_subscription` work as documented, called from our backend?
   Our cancel button depends on it, subscribers have no Flash login of their
   own, and cancel-as-easily-as-subscribe is close to a legal requirement.
4. Does the dev vault accept a test card, or does it charge a real processor?

**Money and rails**

5. Can this plan be paid over Lightning today? Connections shows both Fiat
   (Card & ACH) and Bitcoin (Lightning) wallets connected — checkout rails, or
   treasury only?
6. For a USD-denominated plan paid over Lightning, who sets the sats amount?
   If Flash converts at spot, our fixed "2,100 sats" display must become an
   approximation or the plan needs sats denomination.

**Operations**

7. Does Flash email subscribers a receipt? Decides whether our checkout screen
   promises one and whether the Billing tab is the only record.
8. Is `/get_user_subscription_details` (and its transactions array) real on the
   vault? It is the source for the payment-history panel and the reconciliation
   backstop for missed webhooks.
9. Is there a per-subscriber deep link into the vault, for admins investigating
   a payment? The service-level URL lands on a list.
10. Confirm dev and production are separate vaults with separate ids — and the
    path to production credentials.

**Designed around, but ask**

11. Is there a return/redirect URL after payment? The new-tab + refetch-on-focus
    flow assumes no; an answer of yes lets us simplify.


## Superseded by UI-HANDOFF.md (2026-08-26)

Flash's current product (newer than the surface probed on 2026-08-17) accepts
a `ref` query parameter carrying our hex pubkey and echoes it back on a real
`redirect_uri`. **The entire email-correlation identity design above is
superseded**: no pending-checkout record, no correlation window, no
hold-and-alert queue — the join key is the pubkey in the URL. The server owns
the checkout URL via public `GET /billing/plans`; the UI appends `ref` only.
Cancel follows `manage_url`. Cadences are served live from the `scheduling`
row. See `UI-HANDOFF.md` (the authoritative contract) — the old public docs at
docs.paywithflash.com describe an older product again and are wrong for our
account.
