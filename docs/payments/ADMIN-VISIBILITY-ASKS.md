# Billing visibility for admins — what ships now, what needs the server

**For:** Enes (server), with one section for Pierre (Flash)
**From:** the UI, branch `feat/flash-payments`, 2026-09-04
**Source of truth for Flash's shapes:** the current Flash Subscriptions Integration Guide
(Notion, owner Pierre Corbin). Field names below are copied from it.

Benjamin's ask: admins should see a subscriber's **tenure** (since when), **billing cycles**
(how many they have paid), **what they pay**, and **how they pay** (card vs Lightning) — on the
admin views. Rule for this round: the UI builds only from data it already has; everything else
is written here as an ask rather than approximated.

---

## Shipped in the UI, no server change

**The Flash-record dialog reads as a subscriber sheet.** `GET /admin/billing/subscriptions/{pubkey}/flash`
already returns Flash's subscription object unmodified, and Flash's object carries everything the
question needs. The dialog now shows, per row:

| On the sheet | Flash field(s) |
| --- | --- |
| Subscribed since | `createdAt` |
| Billing cycles ("3 periods billed" / "Period 3, renewal unpaid" / "In trial, nothing billed yet") | `currentPeriodNumber` + `status` |
| Plan · price · interval, trial days, setup fee | `pricingSnapshot.*` |
| Current period, next bill, trial end | `currentPeriodStart/End`, `nextBillingDate`, `trialEndDate` |
| Failed renewal: "Attempt 2 of 3 · first failed …" | `dunningAttempts`, `firstFailedAt`, `dunningPolicy.maxAttempts` |
| Cancelled on · ends · reason | `canceledAt`, `cancelEffectiveDate`, `cancelReason` |
| "Flash retries up to 3 times, 3 days apart, 7-day grace, then cancels. Cancellations take effect at period end." | `dunningPolicy`, `cancellationPolicy` |
| Their Flash portal | `portalUrl` |
| Test mode chip | `livemode: false` |

The raw JSON is still there, folded under "Raw record". Nothing new is fetched: one Flash read
per open, as before.

**Limit of this approach:** it is one subscriber at a time, on demand. The roster cannot sort or
sum any of it. That is the first ask.

---

## Asks for the server, in the order they pay off

### 1. Tenure, cycles and price on the roster row

Add to `BillingSubscriptionItem` (`GET /admin/billing/subscriptions`):

```
flash_created_at:          Instant | null   # Flash createdAt — the subscription's start, their tenure
current_period_number:     int | null       # Flash currentPeriodNumber
pricing_amount_minor:      int | null       # already a column on user_subscription
pricing_currency:          str | null       # already a column
pricing_billing_interval:  str | null       # already a column
trial_end_date:            BillingDate      # already a column
```

Four of the six are already stored by migration `f1a4c8e27b60` and never returned. The two new
ones need `FlashSubscription` to parse `createdAt` and `currentPeriodNumber` and the sync to
store them.

What the UI does with it: **Tenure** and **Cycles** columns with sort; **expected revenue**
tiles (sum of `pricing_amount_minor` over active rows, per currency and interval — labeled
"expected", since it is what Flash will try to charge, not what it received); a **trials** count
beside active / past due / ending; price beside the plan name on each row.

### 2. Payment history per subscriber

```
GET /admin/billing/subscriptions/{pubkey}/events
→ { events: [ { event, event_timestamp, processed_at, attempts, process_error, resolution,
                amount_minor?, currency?, paid_at?, period_number?, invoice_id?, payment_id?,
                attempt_number?, first_failed_at?, reason? } ] }
```

The `flash_webhook_event` table already stores every delivery with its payload, and Flash's
`subscription.renewed` payload carries `amount`, `currency`, `paidAt`, `periodNumber`,
`invoiceId`, `paymentId`; `past_due` carries `attemptNumber`, `firstFailedAt`; `canceled`
carries `reason`. Lifting those out of `payload` into typed optional fields is all this is.

What the UI does with it: a **timeline** on the subscriber sheet (activated → renewed ×N →
past_due → …) with amounts and dates; **"paid N renewals, $X received"** — the real answer to
Benjamin's "how many cycles have they paid", as opposed to the period-number derivation above;
per-subscriber webhook health (a delivery that failed processing shows here, not only in the
divergence report once it is exhausted).

Same endpoint keyed by Flash id for unresolved signups would be welcome but is not needed to
start.

### 3. Flash's plan list, for admins

```
GET /admin/billing/flash-plans
→ { livemode, plans: [ { id, service_id, name, description, amount_minor, currency,
                         billing_interval, trial_days, setup_fee_minor, status,
                         acceptance_methods: [ { token, kind, provider, label } ],
                         signup_url, sort_order } ] }
```

The server already reads this (`fetch_service_plans_raw`, cached ten minutes) and exposes only
the mapped, for-sale subset through public `/billing/plans`. Admins need the whole list.

What the UI does with it: the **New plan mapping** dialog becomes a picker — choose "Priority ·
$2.00 per month" and both UUIDs fill themselves, so a mapping can no longer be mistyped; an
**"archived in Flash"** chip on a mapping whose plan status is not `active`; **trial and setup
fee** facts on Plans on sale; **which rails a plan accepts** (Lightning, card, or both) from
`acceptance_methods`, which is the closest thing to a rail Flash gives us today (see Pierre).

### 4. Account policies and mode, once

```
GET /admin/billing/flash-settings
→ { livemode, dunning_policy: {...}, cancellation_policy: {...},
    acceptance_methods: [ { token, kind, provider, label } ] }
```

A pass-through of Flash's `GET /settings` (scope `subscriptions:view`). The sheet already shows
the policy per subscription; this puts one line above the roster — "Renewals retry 3 times,
3 days apart, 7-day grace, then cancel; cancellations take effect at period end" — and a
**Test mode** banner on the whole tab when the key is not live, instead of only inside a dialog.

### 5. The `rail` column

`user_subscription.rail` exists and nothing writes it. Flash's external API does not expose the
payment method (see below), so either drop the column or leave it for the day Flash adds the
field. Flagging so it is a decision, not a surprise.

---

## For Pierre (Flash)

1. **Payment method per subscription.** Nothing on the subscription object, the plan, or any
   webhook says whether a subscriber pays by card or Lightning; the guide notes
   `paymentInstrumentId` is intentionally not exposed. Is there — or could there be — a
   `paymentMethod` on the subscription, or on `subscription.renewed`? This is the one thing
   Benjamin asked for that we cannot get from anywhere today.
2. **`payments:view` and `movements:view` scopes** exist on API keys but the guide documents no
   endpoints for them. If a payments listing exists, it would answer both the method above and
   "what did we actually receive" without us reconstructing it from webhooks.
3. **Per-subscriber deep link into the vault** (still open from the earlier list) — the service
   URL lands on a list.

---

## Not asking for

- `POST /subscriptions` (create) — needs the subscriber's NWC string or a vaulted card, so it is
  not an admin "comp" path. Comped access stays a scheduling override on our side.
- `POST /services/{id}/plans` — plans are authored in Flash's dashboard; a mapping picker (ask 3)
  is enough.
