> **SUPERSEDED 2026-08-31**: Enes shipped the real API — richer than this
> contract. The authoritative schema is the server's own OpenAPI docs at
> `https://brainstormserver-staging.nosfabrica.com/docs` (GET
> /admin/billing/subscriptions returns Page[BillingSubscriptionItem];
> divergence, resync, block and plan-mapping endpoints also exist). The UI
> now consumes that schema directly.

# Admin billing endpoint — UI ↔ server contract

For Enes (server) — the UI's admin Billing tab is already built against this
shape (view-only).

## Sourcing (corrected 2026-08-30 — Enes's catch)

Flash's `GET /api/v1/external/subscriptions` is a **lookup** (`?ref=` /
`?subscriptionId=`), not a list — there is no roster endpoint today, and
ref-less plain-link signups can't even be looked up (no key to query by).
So the server sources this response from its own data:

- **Webhook ledger** (works today): persist every `subscription.*` event —
  each carries `subscriptionId` + `externalRef` (null for plain-link
  signups). Serve the roster from that ledger; use the per-ref lookup for
  reconciliation. Subs predating the webhook surface on their next event.
- **Flash list endpoint** (asked 2026-08-30): `?serviceId=`/`?planId=`
  filter on the same endpoint. If/when it ships, the ledger becomes a
  cache and backfill gets trivial.

The response shape below is unchanged either way — the UI doesn't care
where the rows come from.

## Request

```
GET /api/admin/billing/subscriptions
Authorization: (admin session, same as /admin/scheduling)
```

## Response

```json
{
  "data": {
    "subscriptions": [
      {
        "subscription_id": "7d3b…",          // Flash `id`
        "ref": "abc123…64-hex…" ,            // Flash `ref` — hex pubkey, or null
        "plan_id": "019ef08a-…",             // Flash `planId`
        "plan_name": "Priority",             // resolved server-side if cheap, else null
        "status": "active",                  // Flash's status, passed through verbatim
        "current_period_end": "2026-09-25T…",// Flash `currentPeriodEnd`
        "next_billing_date": "2026-09-25T…", // Flash `nextBillingDate`
        "created_at": "2026-08-25T…"         // Flash `createdAt`
      }
    ]
  }
}
```

(`{ "subscriptions": [...] }` without the `data` wrapper also parses — the UI
accepts both, matching the existing endpoints' envelope convention.)

## Semantics the UI relies on

- **`ref: null` means a bypass signup** (Flash's plain link, no attribution).
  The UI quarantines those in an "Unattributed subscriptions" card — do NOT
  filter them out server-side; seeing them is the point (the Pierre case).
- **`status` is an open set** — pass Flash's value through verbatim, including
  values that don't exist yet. The UI colors the ones it knows and renders the
  rest neutrally; nothing crashes on a new status.
- **All rows, all statuses** — canceled/expired history included. The UI does
  its own grouping. If pagination becomes necessary, tell Ben; v1 assumes the
  list is small enough to return whole.
- **~~View-only~~ (superseded)** — the tab now cancels and pauses through the
  server (`POST .../{pubkey}/cancel`, `PATCH .../{pubkey}/status`), which need
  the `subscriptions:manage` scope. Refunds and invoices still link out. The
  links out stayed: acting on a subscription is a different question from
  seeing what Flash actually says about it.

## Explicitly NOT needed for v1

- Invoice/payment line items (UI links out to Flash instead).
- Per-subscription webhook history.
- ~~Any `subscriptions:manage`-scoped operation.~~ Superseded — see above.

UI reference: `client/src/services/api.ts` (`getAdminBillingSubscriptions`,
`AdminBillingSubscription`), `client/src/components/admin/billing/AdminBillingCards.tsx`.
