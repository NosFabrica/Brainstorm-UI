# Admin billing endpoint — UI ↔ server contract

For Enes (server) — the UI's admin Billing tab is already built against this
shape (behind `FEATURES.subscriptionApi`, view-only). It's deliberately a thin
map of Flash's `GET /api/v1/external/subscriptions`, which the
`brainstorm-server-staging` API key (scope `subscriptions:view`) can already
call. Nothing here requires Flash to build anything.

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
- **View-only** — the UI links to the Flash dashboard for anything
  write-shaped (refunds, comps, cancels). No manage endpoints needed.

## Explicitly NOT needed for v1

- Invoice/payment line items (UI links out to Flash instead).
- Per-subscription webhook history.
- Any `subscriptions:manage`-scoped operation.

UI reference: `client/src/services/api.ts` (`getAdminBillingSubscriptions`,
`AdminBillingSubscription`), `client/src/components/admin/billing/AdminBillingCards.tsx`.
