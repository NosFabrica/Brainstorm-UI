# Flash dashboard setup — decisions and checklist

Grilled 2026-08-26 (Benjamin has dashboard access). The integration guide is
`docs/payments/UI-HANDOFF.md` + the official Flash guide (Notion, verified
identical to the copy circulated).

## Decisions

1. **Checkout links to the PLAN, not the service** — one plan means the
   service page is a click offering no choice. Revisit when a second plan
   (e.g. annual) exists; the server owns the URL so switching is trivial.
2. **Redirect URLs: staging + localhost, both registered 2026-08-26** —
   `https://brainstorm-staging.nosfabrica.com/billing/return` and
   `http://localhost:5001/billing/return`, exact, no trailing slash, no
   query. Add production when the release nears. (The guide says
   HTTPS-only, but the dashboard's own field hint allows `http://localhost`
   for development — verified working end-to-end 2026-08-26.)
   Must stay character-identical to the `redirect_uri` the server builds
   into `checkout_url` — one decision, two places.
3. **No `email`/`name` prefills, permanently** — we store neither; the
   subscriber types their email once on Flash's page (needed for the portal
   magic-link anyway). Privacy posture: Flash learns what they type, not
   what we hold.
4. **API key: `subscriptions:view` only**, no expiry, named
   `brainstorm-server-staging`. Shown once → straight to the server team's
   secret manager; never near the UI repo or anything `VITE_`. Mint a
   separate `subscriptions:manage` key only if first-party cancel ever
   ships.
5. **Dunning: ~7 days then cancel** — 3 attempts, 2–3 days apart, cancel
   after the final failure. Matches the UI's existing "grace" copy
   (past_due → grace, still entitled while retries run).

## The checklist (dashboard, done 2026-08-26 unless noted)

- [x] Wallets connected: NosFabrica Wallet (Lightning) + Maverick (card)
- [x] Service stays "Brainstorm" ("Running your web of trust scores on
      Nostr") — it's LIVE with subscribers, so the *plan* carries the
      Priority identity instead of renaming the service
- [x] **Real Priority plan = `019ef08a-3c5f-7228-a15b-4838937045f5`**
      (renamed from "Brainstorm Monthly"): "Priority", $2.00 USD/month,
      both rails, trial 0, no setup fee, description "For acting on what
      you see", features = Everything in Free / 7-days-not-60 / automatic
      updates / priority support. Verified rendering on the public signup
      page. → This id (not the `01a039cc…` test plan) belongs in the
      server's `/billing/plans` checkout_url.
- [x] Redirect URLs registered: staging + localhost (decision 2)
- [x] Account-wide allowed payment methods: card was disabled — enabled
      2026-08-26 so plans can offer both rails
- [x] Dunning policy: 3 attempts, 3 days apart, 7-day grace, cancel after
      final failure (decision 5)
- [x] Webhook endpoint already registered (by the server team):
      `https://brainstormserver-staging.nosfabrica.com/webhook…`, 5 events
- [ ] Settings → API: `brainstorm-server-staging` key (view-only) — form
      filled, Benjamin clicks Create and moves the secret to the server
      team's secret manager
- [ ] Follow-up: two pre-existing keys ("Brainstorm API -", "Brainstorm
      Staging API") are 3-scope and never used — candidates for revocation,
      team's call

## Server-side flags carried from the guide QA

- `paused` is a real Flash status not in UI-HANDOFF's mapping table — the
  server's translator needs a decision (recommend → `grace`: suspended but
  not ended; unknown statuses = change nothing, per the handoff).
- Pending checkouts resolve within ~30 minutes (guide §5), not 10 — the
  webhook (`subscription.activated`) covers the tail beyond the UI's
  10-minute poll.
- The API response has `currentPeriodStart` — passing it through
  `/user/subscription` someday would replace the UI's derived period start.

## Live-testing findings (2026-08-26, dev vault)

- **"Return without subscribing" redirects with `status=canceled`** — a
  value the guide's redirect table omits (it lists only
  `active`/`trial`/`pending`). The UI's open-set handling renders the
  no-payment state for it; the server's translator should treat it (and
  any other unknown) as "change nothing". Reported to Flash as a docs gap.
- **Plans can be sats-denominated natively** (the test plan renders
  "SAT 1.00 / daily") — a future sats-priced plan needs no USD conversion.
  Display quirk: the dashboard lists the same plan as "100 sats / day";
  asked Flash which is authoritative.
- **Current plan `01a039cc-…` is a throwaway test plan** ("Staging –
  Daily", 1 sat/day, placeholder copy). The real Priority plan
  ($2/month, both rails, trial 0) still needs creating in the dashboard,
  with real description/features — the checkout page renders that copy
  verbatim.
- **Resolved incident** (Flash team, 2026-08-26): the two `pending`
  Lightning checkouts weren't stuck — the wallet returned an *ambiguous*
  NWC error, so Flash couldn't fail the checkout immediately and let the
  invoice expire instead. Pending signups with no charge behind them are
  auto-cleaned after ~30 minutes. Usual client-side causes: NWC budget
  exhausted, missing `pay_invoice` permission, or insufficient balance —
  and Alby reports budget-exhausted and insufficient-balance as the *same*
  error, so check both. Retest with a fresh connection with a sufficient
  budget; if it still lands pending, Flash can pull logs for the attempt.
