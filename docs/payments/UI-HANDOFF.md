> **SUPERSEDED 2026-09-01.** The tier model, the `rail` field and the two status maps described below no longer exist.
> The live contract is the server's own OpenAPI; the design and its reasoning are in
> `.scratch/payments-flash/`. Kept for history — do not build from it.

# Flash payments — UI handoff

**For:** whoever owns `Brainstorm-UI`, branch `feat/flash-payments`
**Status:** Part A is ready to build now. Part B waits on two answers from Flash.

Self-contained — you shouldn't need any other document to act on this.

---

## Why this exists

The billing surface on `feat/flash-payments` was built against a Flash signup page that accepted no
parameters at all. That was accurate at the time: the page was probed and it read no query string, no
`URLSearchParams`, nothing. Everything downstream of that — the identity design, the return-from-checkout
mechanism, the rail handling — was built around that constraint.

**Flash has since given us a current integration guide, and our account is on a newer product than the
one those probes hit.** The signup page now takes query parameters, there is a real redirect back to our
app, and there is a working API. That removes the hardest parts of what was designed, and changes several
things that are already built.

The old public docs at `docs.paywithflash.com` describe an even older product again — numeric `flashId`,
base64 `?params=` pre-fill, per-subscription JWT webhooks. **Every one of those is wrong for our
account.** If you go looking for answers there you'll get confident, plausible, incorrect ones.

---

## What changed

| | Built on the branch | Actual |
|---|---|---|
| Passing user identity | impossible — page reads no query string | **`ref` param** carries our hex pubkey, echoed back on the redirect |
| Return from checkout | none; `refetchOnWindowFocus` was *"the entire mechanism"* | **`redirect_uri`** returns `status`, `subscriptionId`, `ref` |
| Rails | two Flash plans, a rail chooser in our UI | **one plan takes both**; the subscriber picks on Flash's page |
| Cancelling | our own `DELETE` endpoint | **`manage_url`** on the subscription — follow it; no longer blocked (A6) |

The identity change is the big one. The old design needed a pending-checkout record, a 30-minute
email-correlation window, a hold-and-alert path for ambiguous matches, an admin queue for unmatched
payments, and a user-facing "was this you?" confirmation. **All of that is gone**, replaced by putting the
pubkey in a query parameter. The branch's own doc predicted it: *"the moment it exists, the join key
becomes the hex pubkey and this whole section collapses to one line."*

---

## Part A — nine changes, none blocked

### A1. Build the checkout URL from `/billing/plans`

`client/src/lib/checkout.ts` builds a bare deep link today, with a comment explaining that no parameter of
any name will ever populate the page. True of the old product; no longer true.

**The server now builds this for you.** `GET /billing/plans` returns a `checkout_url` per paid tier,
already carrying the base URL, service id, plan id and the exactly-matched `redirect_uri`. The UI appends
one parameter:

```js
window.open(`${plan.checkout_url}&ref=${encodeURIComponent(pubkey)}`, "_blank");
```

Optionally `&email=` and `&name=` as prefills.

- `ref` is capped at 200 characters. A hex pubkey is 64, so this only matters if you ever put something
  else there.
- **`redirect_uri` is matched exactly**, query string included — no wildcards, no prefix matching. That
  exactness is why the server owns it: it has to equal what's registered in the Flash dashboard
  character for character, and the dashboard and the server config are maintained together.
- Keep `window.open` synchronous inside the click handler. The popup-blocker note already in
  `PriorityCheckout.tsx` still applies — don't put an `await` before it.
- **Checkout is idempotent on `ref`.** If someone who already subscribed opens the link again with the
  same `ref`, Flash doesn't charge them again — it redirects straight back with the existing
  subscription. Good for users, and it means repeat manual testing needs a fresh pubkey each time.

`VITE_FLASH_PRIORITY_CARD` and `VITE_FLASH_BASE_URL` can both go — the ids they carried now arrive from
`/billing/plans`. Delete the Lightning branch in `planPath()` too; one plan covers both rails.

### A2. A real `/billing/return` route

Flash appends `?status=&subscriptionId=&ref=` to the registered URL.

Register a **bare path** with no query of its own — `https://<host>/billing/return`. Because matching is
exact and includes the query string, a route like `/settings?tab=billing&checkout=return` would have to be
registered with that exact string and is needlessly brittle.

On arrival, call the server. **Never grant anything from these parameters** — anyone can type the URL:

```
POST /user/subscription/refresh      (no body)
```

No body: the caller is authenticated, so the server syncs whoever is signed in, reading Flash directly.
The `subscriptionId` and `ref` in the redirect are informational — do not send them as authority, and
don't be surprised that the server ignores them. (Reasoning under *Why one endpoint, not two*.)

The `status` here is a **checkout outcome**, not a subscription status. Only three values ever appear:

- `active` / `trial` → call refresh, then show success.
- `pending` → the payment is real but unconfirmed, and there's no `subscriptionId` yet. Show a
  "confirming" state and poll (A4). This happens with Lightning when a wallet or its relay is slow.

**Failed payments never redirect at all** — the user stays on Flash's page, sees the error, and can retry
there. So there's no failure screen to build.

This route also gives us the `/billing` alias the branch's doc promised but never registered — `App.tsx`
has only `/pricing` and `/insights`, so any receipt or support link pointing at `/billing` currently 404s.

### A3. Fix the post-checkout refetch

`useSubscription` sets `refetchOnWindowFocus: true` **and** `staleTime: 60_000`.

Focus-refetch only fires on a query that is *stale*. Checkout usually takes well under a minute, so
someone who pays and comes straight back hits a fresh cache and **nothing happens**. The waiting screen
promises "this page updates on its own", and in the common case it doesn't.

The "Check again" button does work, because an imperative `refetch()` ignores `staleTime` — so the manual
fallback has quietly been doing the job the automatic path claims to do.

Fix: drop `staleTime` to `0` while a checkout is in flight, or mark the query stale in `go()`.

### A4. Poll while a checkout is in flight

Even with A3 fixed, focus is a single shot at the wrong moment. The webhook confirming the payment may
land *after* the user is back in our tab — they can return within seconds of paying. One refetch reads
"free" and stops.

While `sent` is true, refetch every ~2s for up to ~90s, stopping when `tier` flips, then show a terminal
state: *"we haven't seen your payment yet — this can take a minute."* Lightning `pending` can persist up
to ~10 minutes, so the poll should survive the dialog closing.

Use `POST /user/subscription/refresh` for the poll — the same call as A2, and the same one the landing
page makes. It asks Flash directly rather than waiting for the webhook, so it gets a definitive answer
instead of racing an event. It's rate-limited, so keep the ~2s floor.

Optional extra trigger, free and independent of Flash: keep the handle from `window.open(...)` and watch
`w.closed`. It's cross-origin so you can read nothing else, but `.closed` is readable and fires slightly
earlier than focus. Not a replacement — people leave tabs open.

### A5. Add `"pending"` to `SubscriptionStatus`

Two lines in each of the two exhaustive `Record<SubscriptionStatus, string>` maps (`BillingCard.tsx`,
`PlanCard.tsx`).

Without it, a genuinely-paying user reads as **free** for up to ten minutes while Lightning confirms.
`normalize()` has no `pending` in its whitelist, so the server is forced to send `none` instead, and
`none` renders as "no subscription".

### A6. Cancel — build it now, against `manage_url`

**This is no longer blocked.** Earlier drafts said to wait on Flash confirming whether a
`subscriptions:manage` cancel endpoint exists. You don't have to: `GET /user/subscription` returns a
`manage_url`, and the button follows it.

```js
if (subscription.manage_url) window.location.href = subscription.manage_url;
```

Today that resolves to Flash's hosted portal. Flash *does* now document a cancel API
(`POST /subscriptions/{id}/cancel`), and the **admin** billing tab uses it — but the subscriber path
deliberately stays on the portal, because owning cancellation would mean owning identity and
payment-method changes with it. If that decision is revisited, the server starts returning a URL into
our own app and **this code doesn't change**. That's the point of handing back a URL rather than a
boolean: the open question stops being yours.

`cancelSubscription()` is gone; it called a `DELETE` that doesn't exist.

Two copy notes for the portal path, which is where we'll start:

- **Say the magic-link email is coming**, so the sign-in step isn't a surprise. Say it generically —
  *"check the email you subscribed with"*. We deliberately do not store the subscriber's email, so we
  cannot name or mask the address, and the login identity may not be the same one.
- It is more friction than subscribing, which the branch rightly flagged as close to a legal requirement
  in several jurisdictions. Link straight to the portal — no interstitial.

### A7. Runtime env keys — one left, maybe none

**Mostly deleted by `/billing/plans`.** This was three files across two repos; now it's one variable.

`VITE_FLASH_BASE_URL` and `VITE_FLASH_PRIORITY_CARD` were going to need wiring through
`client/public/config.js`, the `docker-entrypoint.sh` substitution list and
`charts/brainstorm/templates/ui.yaml`. None of them are in the first two today — only `VITE_TAG_RELAY_URLS`
was ever added — so in a container they'd resolve to undefined and the UI would report "payments aren't
configured in this environment", which looks exactly like intended behaviour rather than a wiring bug.
That afternoon is now nobody's, because the server serves those ids instead.

**Settled: `VITE_FEATURE_SUBSCRIPTION_API` is gone, along with the mock it selected.** It was never
added to `config.js`, the entrypoint substitution list or `ui.yaml`, so a deployment resolved it to the
mock — fabricated subscription state that looks like working software rather than an error. Removing
the mock outright means no environment can forget it and none can fabricate state. To see `past_due`,
`grace`, `canceled` or `pending`, use the LOCAL-gated `POST /admin/billing/dev/emit-webhook`, which
drives the real verify → dedupe → translate → entitlement path.

Locally these go in **`client/.env`**, not the repo root — Vite's `root` is `client/`, so a root-level
`.env` is silently ignored.

**Nothing Flash-secret ever gets a `VITE_` prefix.** Anything `VITE_*` is compiled into the bundle *and*
substituted into `config.js`, which nginx serves publicly. The API key and webhook secret are server-only.

### A8. Hide the billing entry points when payments aren't configured

Brainstorm self-hosts via `brainstorm_one_click_deployment`, and those operators have no Flash account.
Billing has to be genuinely absent there, not present-and-broken. Same for local dev and any environment
where the secrets haven't been sealed yet.

The seams already degrade correctly: with `VITE_FLASH_BASE_URL` unset, `resolveCheckout` returns
`{ external: false }` and the checkout dialog says payments aren't configured. **But the entry points
don't hide** — the Pricing link in the footer and "Get Priority" in the account menu still render, leading
to a page selling a plan that cannot be bought.

**The signal is `GET /billing/plans` returning an empty `plans` array.** Gate the footer link, the
account-menu item and the `/pricing` route on it. No env var, and it's true per-instance rather than
per-build — which matters, because the same image runs on staging and on someone's self-host.

Server-side counterpart, so you know what to expect: the billing routes aren't mounted at all when
payments are disabled, so they 404 rather than erroring. Two exceptions are always mounted —
`GET /user/subscription`, which returns `{tier: "free", status: "none", …}`, and `GET /billing/plans`,
which returns `[]`. Both answer honestly instead of 404ing, so neither `useSubscription` nor the pricing
page logs an error on a self-hosted instance.

### A9. Remove the `queue-priority` bullet

Decided: the paid tier does get queue priority, but **we're not advertising it**.

`liveFeatures("priority")` currently includes `queue-priority` — *"Ahead of the free queue when Brainstorm
is busy"* — on the pricing card and in the checkout dialog. Take it out.

The tier keeps the name Priority. That's a deliberate position, not an oversight: an evocative name
without an explicit claim.

---

## Decided — context you may want, no action needed

**No trial period.** The free tier already is the trial: someone can use Brainstorm indefinitely and see
exactly what they get, since Priority changes a refresh interval rather than access. So there's no trial
display state to build. The server still maps a `trial` status to `active` defensively, because a plan
could gain trial days from the Flash dashboard later without any code change, but the UI will never see
it.

**Manual recalculation stays unlimited on both tiers.** Ops and clients want it that way. The quota moves
to roughly 200/week as a backstop rather than a governor; what users actually feel is the existing
30-minute "calculated too recently" throttle.

This has a consequence worth knowing when writing copy: **a motivated free user can already keep their
scores exactly as fresh as a subscriber, for nothing, by clicking.** So Priority can't honestly be pitched
as *access to fresher data* — it isn't. What it sells is **automation**: freshness without having to think
about it. Its buyer wants it handled, not a capability they otherwise lack.

---

## Part B — waits on Flash

Two questions are out with Flash, and **neither blocks any UI work** — both are copy decisions with a
working default already in place. Everything else is settled.

Cancellation used to be here. It isn't any more: `manage_url` (A6) means the answer changes what the
server puts in a field, not what the UI does with it.

**Price and denomination.** `plans.ts` carries `usdMinorPerMonth: 200` and `satsPerMonth: 2100`. The dev
plan is $2.00 USD (Flash stores amounts in minor units — `200` means $2.00; keep them as integers and
never round-trip through floats). The open question is whether a plan can be denominated in **sats**
natively. If it's USD-denominated and Flash converts at spot, the fixed "2,100 sats" drifts with the
exchange rate and has to become an approximation — "≈ 2,100 sats".

**Rail display.** The subscription object Flash returns has **no payment-method field**, and none of the
webhook payloads carry one. So "Paid by Card" / "Paid by Lightning" on the billing card and the badge in
the payments table may be unpopulatable. If Flash exposes it somewhere, we'll populate
`user_subscription.rail` and the UI stays as built. If not, the simplest answer is to drop the row —
`normalize()` already coerces a missing rail to `null` and the UI renders `—`, so it needs no code change,
just a decision to leave it. Inference would be worse than absence on a billing screen.

---

## Cadence numbers: don't hardcode them

The recalculation intervals are **runtime data, not constants**. `scheduling.schedule_interval_seconds`
lives in the database with full admin CRUD, and admins set whatever the clients decide — without a
deploy.

That makes the current build-time constants a **silent drift bug**: retune a policy and the pricing page
keeps advertising the old figure, on the one page where being wrong is most expensive. The comment already
on `PricingPage.tsx:52` says exactly this — *"the intervals are the configured numbers — and if either
changes, this changes with it or becomes a lie."*

Four places bake them in, and one is nastier than the rest:

| Site | Current |
|---|---|
| `recalcIntervalDays` | `60` (free), `7` (priority) — also feeds `nextScheduledLabel()` on Insights |
| Feature labels | *"New follows show up within 60 days"*, *"New follows show up within 7 days, not 60"* |
| Feature **keys** | `recalc-60d`, `weekly-recalc` — the numbers are inside the identifiers, so changing them is a rename |
| `PricingPage.tsx:52` | *"every 60 days on Free, every 7 on Priority"* |

**Settled: `GET /billing/plans` serves them,** as `schedule_interval_seconds` straight off the live
`scheduling` row. Format client-side. Both cadence features already carry an `interval: true` flag, so
whoever wrote this anticipated it. That also kills the numbers-in-keys problem — `recalc-60d` becomes
something like `recalc-interval` with the value supplied at render time.

The three questions this raised are all answered on the server side:

1. **Public**, unauthenticated — the pricing page's audience is logged-out visitors, and cadences are
   marketing copy, not secrets.
2. **Only user-visible policies are published.** `scheduling` is a general catalog; a row an admin adds
   for internal use does not appear, so this can't leak an experiment onto the pricing page.
3. **Keep today's constants as a fallback** so the page still renders if the call fails — but name them
   so it's obvious in the code that they're a last resort rather than the truth. This is the one piece
   still yours.

Worth noting the numbers themselves aren't a capacity question. The publishing ceiling everyone was
reasoning from turned out to be obsolete by roughly 80× — it was measured under a configuration production
no longer runs — and the difference between the cheapest and most expensive cadence pairing is about 11
publishes a day. Whatever gets chosen, it's a product decision, not an operational one.

---

## The server contract

**Three endpoints.** Two authenticated, one public. Everything under them is built and tested; the
endpoints themselves are the remaining server work.

```
GET  /user/subscription      → { data: { tier, status, current_period_end, rail, manage_url } }
POST /user/subscription/refresh   (no body)  → the same shape
GET  /billing/plans          → { data: { plans: [...] } }        public, no auth
```

### `GET /user/subscription` — what they have

Authenticated. **Always mounted**, even on an instance with no Flash account, where it answers the free
default. `useSubscription` therefore works everywhere instead of failing a query on every page load.

| Field | Values |
|---|---|
| `tier` | `"free" \| "priority"` |
| `status` | `"none" \| "pending" \| "active" \| "past_due" \| "grace" \| "canceled"` (one `l`) |
| `current_period_end` | ISO 8601 string, or `null` on free |
| `rail` | `"card" \| "flash-lightning"` or `null` |
| `manage_url` | Where the user goes to cancel, or `null` — see A6 |

### `POST /user/subscription/refresh` — "did my payment land?"

> **2026-09-04 (server 4093c93):** the refresh answer is now
> `RefreshSubscriptionResponse`, the same view plus `verification`:
> `verified` | `mismatch` | `unknown` | `not_given` | `unavailable` — what the
> redirect's `subscriptionId` turned out to be. The return page treats
> `mismatch` / `unknown` as a refused id (its own "We couldn't verify that
> payment" state, no poll), `unavailable` as "still confirming, Flash was
> unreachable", and an absent field (older server) exactly as before.

Authenticated, rate-limited, **empty body**. Re-reads Flash directly and applies the result, rather than
waiting for the webhook. Returns the same shape as the GET, so the UI can replace state with the response.

This is both the redirect landing call and the poll. It replaces the `POST …/verify` that earlier drafts
of this document described — see *Why one endpoint, not two* below.

### `GET /billing/plans` — what's on offer

Public and unauthenticated: the pricing page's audience is logged-out visitors. No secrets — every field
here already appears in the checkout URL the browser visits anyway.

```json
{ "data": { "plans": [
  { "tier": "free",     "name": "Free",     "amount_minor": 0,   "currency": "USD",
    "schedule_interval_seconds": 604800, "checkout_url": null },
  { "tier": "priority", "name": "Priority", "amount_minor": 200, "currency": "USD",
    "schedule_interval_seconds": 86400,
    "checkout_url": "https://<flash>/subscriptions/signup/<service>/<plan>?redirect_uri=<encoded>" }
] } }
```

- `schedule_interval_seconds` comes from the live `scheduling` row, so the pricing page stops being able
  to drift from what the scheduler actually does. Format it client-side.
- `checkout_url` is complete **except `ref`**. Append `&ref=<hex pubkey>` in the click handler — see A1.
- **An empty `plans` array means this instance has no billing.** That's the "is billing available?"
  signal A8 needs; no env var required.
- Only user-visible policies appear. An admin adding an internal scheduling row does not publish it here.

### Why one endpoint, not two

Earlier drafts had `POST …/verify { subscription_id, ref }` for the redirect and `POST …/refresh` for the
poll. They are the same operation — re-read Flash, apply the result — differing only in lookup key, so
they collapsed.

**Both parameters then turned out to be things we should not accept.** The caller is authenticated, so
the server already knows their pubkey; taking a `ref` from the body means accepting a claim we'd have to
spend code disproving. And honouring a `subscription_id` would let anyone claim a subscription somebody
else paid for by pasting its id. Looking the caller up by their own pubkey, always, is both simpler and
strictly safer.

So the redirect's `subscriptionId` and `ref` params are **informational only** — useful for logging or a
sanity check, never sent to us as authority.

### Four traps that all fail silently as "free"

`normalize()` is deliberately total — anything unrecognised degrades to free/active/null rather than
throwing. Good safety net; it also means these four mistakes produce no error anywhere, which is why the
server is written to be strict about them:

- **Enveloped under `data`.** `getSubscription()` does `return json?.data`; a flat body yields `undefined`
  and reads as free.
- **Exact lowercase literals.** No `toLowerCase()`, no trim. `"Active"` or `"PRIORITY"` fail the whitelist.
- **All fields always present.** A missing `status` defaults to `"active"`, not `"none"`.
- **ISO 8601 dates.** Both components do `new Date(value)`; an epoch string parses invalid and renders `—`.

### Two deliberate behaviours

**`tier` comes from the user's scheduling policy, not the billing record.** The policy is what they
actually receive; the billing record is the story about why. If billing says paid but the policy
assignment failed, this reports `free` — visible and complainable, rather than silently promising a tier
that isn't being delivered.

**Flash's statuses are translated server-side, never passed through.** Flash uses
`pending | trial | active | past_due | paused | canceled | expired` and documents that set as *open*.
Since `normalize()` maps anything unrecognised to `active`, a raw `expired` would render as paid. The
server maps explicitly and treats unknown values as "change nothing".

Note `past_due` → **`grace`**, not `past_due`: `useSubscription.isActive` counts `active` and `grace` but
not `past_due`, so passing it through would display a still-entitled user as lapsed.

Every build talks to the real server; the mock and the demo pill no longer exist. Rehearse a status with
the LOCAL-gated `POST /admin/billing/dev/emit-webhook`.

---

## Testing

**There is no Flash sandbox.** Every real test is a real payment. Use a hidden low-price plan
(`is_active = false` so it never renders), and prefer **Lightning**: sats round-trip between wallets we
own, so the net cost is routing fees, where a card charge is a real and unrecoverable cost.

Remember the `ref` idempotency — each repeat run needs a fresh throwaway pubkey, or Flash redirects to the
existing subscription instead of charging.

Existing harness conventions hold: colocated `*.test.tsx`, `renderWithProviders` from
`client/src/test/utils.tsx`, `vi.spyOn(apiClient, …)`, and plain functions rather than `vi.fn()` inside
`vi.mock` factories. `client/src/services/api.scheduling.test.ts` is the model for testing new `apiClient`
methods.

---

## Two stale things on the branch

- `docs/payments/FLASH-INTEGRATION.md` §"The shape of the integration" still opens with *"Brainstorm
  collects their email"*. That field was deliberately removed, and the rest of the same document says so.
  Don't build to that diagram — the whole identity section it describes is superseded by `ref`.
- The same doc refers to `BillingPanel`; the component is `BillingCard`.
