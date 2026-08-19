# Payments walkthrough — team script

A clickable tour of the whole subscription lifecycle, runnable today. Everything
except the card charge is real; entitlement runs on the mock seam, driven by the
floating **Demo** pill (bottom-left, any page, signed in). The pill exists only
in mock mode and removes itself the day real billing ships.

One honest framing sentence to open with: *"Everything you're about to see is
the real UI reacting to real state changes — the only thing mocked is Flash's
webhook, because their backend half doesn't exist yet."*

## The tour (~5 minutes)

**1. Free, and where you see it.**
Demo pill → **Free**. Open the avatar menu: an **Insights** row (always there)
and **Get Priority** (only because this account isn't paying). Open Insights:
the plan card reads Free · every 60 days · next scheduled. Settings → Billing:
"You're on Free", one button.

**2. The pitch.**
Footer → Pricing. One argument, checkable: scores are only as current as their
last update — 60 days free, 7 on Priority. Roadmap is one link, off the buying
decision, per the team's feedback.

**3. Buying — the real part.**
Get Priority → dialog states the three things it buys → Continue to payment
opens **Flash's real signup page in a new tab**: our $2 plan, their card form.
Card details never touch us. Point at the address bar — that's the trust story.
Close the tab (unless Flash confirms dev takes test cards — ask tomorrow).
Note the "waiting" screen behind: focus coming back is our completion signal,
because Flash has no return URL.

**4. Paid.**
Demo pill → **Priority · card** (in production the webhook does this). Watch:
account menu loses "Get Priority" · Insights now reads Priority · every 7 days ·
Renews (date) · Paid by Card · Settings → Billing grows "Change plan" + Cancel.
This is also the scheduling story: the tier IS a scheduling policy — 7 days vs
60, queue priority — enforced by the backend scheduler, not by the UI.

**5. Lightning — a preview, and say so.**
Demo pill → **Priority · Lightning (preview)**. Same UI, "Paid by Lightning".
The rail is NOT wired — no Flash Lightning plan exists. This shows the UI is
rail-ready, and is exactly the "can this plan take Lightning?" question for
tomorrow.

**6. When a card fails.**
Demo pill → **Payment due**. Amber chip on Insights and Billing. Flash retries
3× every 3 days with a 7-day grace; we keep Priority through grace rather than
punishing a card hiccup.

**7. Leaving.**
Settings → Billing → Cancel → confirm. Copy says what actually happens: paid
period runs out, then back to the free schedule. Cancelling is as easy as
subscribing — that's deliberate. Demo pill → **Cancelled** to show the end
state: "Access until", quiet chip, no guilt. (The button flips status via the
mock; the pill shows the same state with the renewal date intact.)

**8. Reset.**
Demo pill → **Free**.

## If asked

- **When is this real?** UI is done to the seam. Real = Flash webhook → backend
  → scheduling policy (Speaker_2, contract in FLASH-INTEGRATION.md) + the two
  scheduling policies created (7d / 60d) + env vars on staging.
- **Downgrade?** = cancel; Priority runs out, free schedule resumes. With one
  paid tier there is nothing between.
- **Change card?** Cancel and resubscribe — we never hold card details. The UI
  says so rather than faking a button.
- **Receipts?** Users see plan/renewal/history (what we can stand behind);
  admins get a deep link into the Flash vault. No second ledger.

## For tomorrow's Flash meeting

The six open questions live at the bottom of FLASH-INTEGRATION.md. The three
that block going live: external id on a subscription (billing identity), the
vault's real webhook contract + where the secret is configured, and whether dev
takes a test card.
