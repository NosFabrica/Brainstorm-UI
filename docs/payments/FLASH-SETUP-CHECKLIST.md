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

## The checklist (dashboard, in order)

- [ ] Wallet connected to receive payments
- [ ] Service: name "Brainstorm Priority", description matches the pricing
      card's three lines (no queue-priority claim)
- [ ] Plan `01a039cc-105d-7608-a9f0-6725aaae9933`: $2.00/month, both rails,
      **trial days = 0** (no-trial decision), no setup fee
- [ ] Subscriptions → Settings: redirect URL (decision 2)
- [ ] Settings → API: key (decision 4) → server secret manager
- [ ] Settings → Webhooks: endpoint URL from the server team; `whsec_…`
      → server secret manager; events: all five subscription.* events
- [ ] Dunning policy (decision 5)

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
- **Open incident**: two Lightning checkouts (Rizful NWC) stuck `pending`
  past the guide's ~30-minute resolution window, wallets never debited.
  Flash team notified; suspect NWC budget/permission or Rizful relay.
