# The Assistant's Duty Menu — the server endpoints the UI is wired for

**For:** brainstorm_server
**From:** the UI, branch `feat/setup-duty-menu`, 2026-10-27
**Filed as:** [NosFabrica/brainstorm_server#108](https://github.com/NosFabrica/brainstorm_server/issues/108)
**Modelled on:** `POST /user/assistantProfile` (`app/routers/user/router.py`), and
Tapestry's `POST /api/assistant/duty-menu/publish` (`src/api/assistant/dutyMenuPublish.js`,
ADR `assistant-duty-menu/0002`)

## What it's for

A **Duty Menu** is how an Assistant tells other clients, apps and Assistants which
duties it can take on, and which relay each one is published to (nous-clawds4/tapestry
`protocols/drafts/duty-menus.md`; the § numbers below are its).
It is one kind-39999 event, signed by the Assistant's own key. Tapestry's Assistants
publish one; Brainstorm's don't yet.

The UI adds a fourth step to Account Setup (`/setup`): **Publish your Assistant's Duty
Menu**. Its page (`/setup/duty-menu`) shows what the Assistant offers next to the menu
it has published, and one button, "Have your Assistant publish its Duty Menu". Only the
server holds the Assistant's key, so only the server can sign the menu, and only the
server knows what this instance offers.

The step is **required** once the server supports it, and **hidden** until then: the UI
asks `GET /user/assistantDutyMenu` and treats a 404 or 405 as "not on this server yet",
so nobody is asked to do something they can't.

## The menu

```jsonc
{
  "kind": 39999,
  "pubkey": "<the caller's Assistant>",
  "content": "",
  "tags": [
    ["d", "duty-menu"],
    ["z", "39998:15f7dafc4624b1e6b00ab7f863de1a53b71967528070ec7d1837c7a40c1c7270:duty-menu"],
    ["p", "<the caller's Assistant>"],
    ["duty", "30382:rank", "<the score relay's public URL>"],
    ["duty", "30382:followers", "…"],
    ["duty", "30382:reporters", "…"],
    ["duty", "30382:muters", "…"],
    ["duty", "30382:hops", "…"],
    ["duty", "30392", "<the Trusted Lists relay>"],
    ["duty", "39998", "<the dictionary relay>"],
    ["duty", "39999", "<the dictionary relay>"],
  ],
}
```

- **`z`** is Nous' Duty Menu header; the coordinate is fixed.
- **`p`** is exactly one, the Assistant itself (duty-menus.md § 4).
- **The `duty` rows** are the rows `GET /setup/{pubkey}` returns, in its order and with
  its relays, then `39998` and `39999` (below). A row's relay is the **public** address,
  as `/setup` gives it; a row with no relay is left out (§ 5.1).
- **Nothing else.** No `storefront`, `not-offered`, `name` or `json`: this is a
  per-customer menu, not a storefront (§ 7).
- **`created_at`**: `max(now, newest menu found + 1)`, so a republish always replaces.
- Before publishing, check it is still a menu by § 6.1: kind 39999, `d=duty-menu`,
  exactly one `p` equal to the author, Nous' `z`, and no `["z","list"]` or concept-header
  `z`.

## The endpoints

All three are under `verify_token`, for the caller's own Assistant: the key Trusted Lists
use (`get_or_create_brainstorm_observer_nsec_by_pubkey_on_db`). There is no request body.

### 1. `GET /user/assistantDutyMenu`

What the server would publish now: the offer.

**Register it before `GET /user/{pubkey}`.** Today that route takes this path for a
pubkey and answers 200 with a "user's" relationships (checked on staging and production,
2026-10-27). FastAPI matches in order, so the new route has to come first.

```jsonc
{ "assistant": "<hex>", "rows": [["30382:rank", "wss://…"], …, ["39999", "wss://dcosl.brainstorm.world"]] }
```

The UI compares these rows with the menu it finds on relays, as a set of `(key, relay)`.
A menu missing a row, carrying an extra one, or naming another relay is **out of date**.
The UI never builds the rows itself: this answer is the one source.

### 2. `POST /user/assistantDutyMenu`

Sign the menu above and publish it to:

1. each row's relay (the internal write URL where the server has one, as scores do);
2. the Assistant's own outbox relays (`assistant_relay_list()`, the kind 10002 it
   publishes);
3. every relay an earlier version's `duty` rows named, so its copy there is replaced
   (§ 8.1);
4. `wss://dcosl.brainstorm.world`, where Nous' header and the other Assistants' menus
   are.

Synchronous: a few seconds. The UI waits up to 30.

```jsonc
{
  "event": {/* the signed menu */},
  "relays": [
    { "url": "wss://scores.brainstorm.world", "ok": true },
    { "url": "wss://relay.damus.io", "ok": false, "message": "timeout" },
  ],
}
```

The UI adds `event` to its store, so the step turns done at once, and shows one line per
relay.

### 3. `GET /setup/{pubkey}` gains the Concept rows

Add `["39998", <assistant>, <dictionary_relay>]` and `["39999", <assistant>,
<dictionary_relay>]` after the `30392` row. `dictionary_relay` is a new setting,
default `wss://dcosl.brainstorm.world`. The Assistant is to manage the reader's
Dictionary by publishing kind-39998 and kind-39999 events. One list then feeds `/setup`,
the menu, and the UI's Duties view, which shows these as Brainstorm's default duties.

## What the UI shows

- **404 or 405 on the GET, or an answer that isn't an offer** (no 64-hex `assistant`, or
  no `rows` array, as `GET /user/{pubkey}` answers today): the step and its page say
  nothing; `/setup` stays at three steps.
- **401**: as any other signed-in call.
- **Any other error**: "Couldn't reach your Assistant right now", with the detail.

## Not asked for (yet)

- A **storefront** menu for the instance's main key, and `not-offered` exceptions.
- A **NIP-09 deletion** on withdrawal: an empty menu withdraws every offer (§ 11).
- **Republishing on its own** when the offer changes: the UI shows the menu as out of
  date and the user republishes.
- The Assistant's own **self-Map** (Treasure Maps § 9.2), which says which offered
  duties are active now.
