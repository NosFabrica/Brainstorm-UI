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
  → Brainstorm collects their email, stores pubkey ↔ email
  → new tab to Flash's hosted signup page (card details never touch us)
  → Flash charges the card
  → Flash POSTs a webhook to us
  → we move that pubkey onto the Supporter scheduling policy
  → GET /user/subscription reports the new state; the UI follows
```

Flash owns the card form and the recurring charge. We own the mapping from a
payment to an account, and what that account then gets.

---

## What a Supporter actually gets

**The paid tier is a scheduling policy.** No new entitlement system is needed —
the scheduler already does all of this:

| `SchedulingItem` field | what it buys |
| --- | --- |
| `schedule_interval_seconds` | automatic weekly recalculation |
| `priority` | position in the calculation queue |
| `manual_quota_limit` / `manual_quota_window_seconds` | manual recalcs allowed per window |
| `is_default` | the free tier's policy |

So entitlement enforcement is one existing call:

```
PUT /admin/users/{pubkey}/scheduling     → move a pubkey between policies
```

**Prerequisite:** a Supporter policy has to exist, created in the admin panel
with the weekly interval, its priority and its manual quota set. The free
default's numbers need deciding at the same time, because the pricing page
quotes both and should quote them truthfully.

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
   - exactly one candidate → bind, apply the Supporter policy, store the email
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
| `user_signed_up` | resolve email → pubkey; `PUT /admin/users/{pubkey}/scheduling` → Supporter; record period end |
| `renewal_successful` | extend period end; ensure still on Supporter |
| `renewal_failed` | mark `past_due`; **stay on Supporter through the 7-day grace** |
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
| `tier` | `free` \| `supporter` |
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

Until this ships the UI runs on a local mock; `VITE_FEATURE_SUBSCRIPTION_API=true`
switches it to the real endpoint and nothing else in the client changes.

**One caution:** the free tier must be what an *error* resolves to. A backend
timeout should never read as "paid", and equally should never strip a paying
user's policy — the scheduling assignment is the source of truth for what they
actually get, and this endpoint only reports it.

---

## Configuration

Client-side, three runtime vars. None are secrets — the signup page is public
and its ids are visible in the URL. The **webhook secret is not one of these**
and must never reach the client.

```
VITE_FLASH_BASE_URL=https://dev.server.vault.paywithflash.com
VITE_FLASH_SUPPORTER_CARD=019eb7e1-c789-731e-9c9a-e84e83500097/019ef08a-3c5f-7228-a15b-4838937045f5
VITE_FEATURE_SUBSCRIPTION_API=false
```

Locally these go in **`client/.env`** — not the repo root. Vite's `root` is
`client/`, so a root-level `.env` is silently ignored and everything reads as
unconfigured. For staging and production they belong in the k8s chart
(`charts/brainstorm/staging-values.yaml` → `ui.env`), which renders `config.js`.

With `VITE_FLASH_BASE_URL` unset the UI says payments aren't configured in this
environment rather than pretending — that is the intended state anywhere the
vault isn't wired.

## Open questions for Flash

1. Can an external id (our hex pubkey) be attached to a subscription? Everything
   about billing identity currently rests on a user-typed email.
2. What is the vault's actual webhook payload, and where are the URL and secret
   configured? The Settings tab is greyed out and the documented contract belongs
   to the older surface.
3. Is there a return/redirect URL after payment? None is documented and none
   appears in the form.
4. Does the dev vault accept a test card, or does it charge a real processor?
5. Can this plan be paid over Lightning today? The Connections tab shows both
   Fiat (Card & ACH) and Bitcoin (Lightning) wallets connected.
6. Confirm dev and production are separate vaults with separate ids.
