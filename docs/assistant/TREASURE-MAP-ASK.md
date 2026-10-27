# Your Assistant's Treasure Map — the server endpoints the UI is wired for

**For:** brainstorm_server
**From:** the UI, branch `feat/setup-treasure-map`, 2026-10-27
**Filed as:** the second item of [NosFabrica/brainstorm_server#110](https://github.com/NosFabrica/brainstorm_server/pull/110)
**Modelled on:** [DUTY-MENU-ASK.md](DUTY-MENU-ASK.md), and Tapestry's Your Assistant's Treasure Map
(`src/api/assistant/selfMap.js`, `src/lib/self-map/index.js`, `POST /api/assistant/self-map`; ADRs
`assistant-self-map/0001`–`0003`)

## What it's for

An Assistant's **Treasure Map** is its own kind 10040, naming itself for the duties it is publishing now: a
_self-Map_ (nous-clawds4/tapestry `protocols/drafts/treasure-maps.md` § 9.2; the § numbers below are its). Each
self-entry `[key, A, relay]` says that A publishes at that relay, and keeps up to date, the insights the key wins. Three
things then say three different things:

- the **Duty Menu** says what the Assistant offers;
- the **Assistant's Treasure Map** says what is active;
- the **reader's own Treasure Map** (Settings › Treasure Map) says what they asked for.

A client that sees a self-entry for a duty can switch to that Assistant at once, without waiting for a first
computation. Tapestry's Assistants keep one; Brainstorm's don't yet.

The UI adds a fifth step to Account Setup (`/setup`): **Publish your Assistant's Treasure Map**. Its page
(`/setup/treasure-map`) shows three panels:

1. the duties the reader's Map gives their Assistant, and which of them are live;
2. what the Assistant's Treasure Map should list now;
3. the version found on relays.

It also has the buttons Tapestry has: **Turn on**, **Update now** and **Turn off**. Only the server holds the
Assistant's key and knows what is live, so the server decides what to list and signs it. The UI reads the published
version from relays (ADR 0005) and compares the two, as it does for the Duty Menu.

The step is **hidden** until the server supports it: a 404 or 405 on `GET /user/assistantTreasureMap`, or an answer
that isn't one (below), means "not on this server yet".

## What counts as live on Brainstorm

A self-Map **says less rather than more** (§ 9.2 "A part A does not publish"). A part is live only when it is
offered, published at the offered relay, its first full set has landed there, and it is being kept up to date.
For each kind the Duty Menu offers (`duty_menu_build.offer_rows`):

| Duty                                                                                                   | Live when                                                                                                                                                                                                                                                                                                                                                                                                                                       | Otherwise, `reason`                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `30382:rank`, `followers`, `reporters`, `muters`, `hops` (the five metrics `ta_signing.ta_tags` signs) | `last_time_published_graperank` is set (it is set only when every event of a run was OK'd, and the first run publishes the full set), **and** upkeep is current: `scheduler_enabled`, the reader's scheduling policy (or the default) is enabled, and the last publish is younger than **2 ×** `schedule_interval_seconds`. One missed run is a brief gap; two in a row is a stop. `load_scheduler_candidates_on_db` already reads all of this. | `not-landed` (never published); `not-scheduled` (no upkeep: the scheduler or the policy is off); `upkeep-stopped` (with `lastLandedAt`, the last publish) |
| Any other Score key (another `30382` metric, `30383`…)                                                 | never                                                                                                                                                                                                                                                                                                                                                                                                                                           | `not-published-here`                                                                                                                                      |
| `30392` Trusted Lists                                                                                  | never, for now: they are published only when an admin runs `POST /admin/trustedLists`, and nothing keeps them up to date                                                                                                                                                                                                                                                                                                                        | `not-scheduled`                                                                                                                                           |
| `39998`, `39999` Concepts                                                                              | never, for now: the Assistant publishes no headers or items yet                                                                                                                                                                                                                                                                                                                                                                                 | `not-published-here`                                                                                                                                      |
| A kind the menu doesn't offer                                                                          | never                                                                                                                                                                                                                                                                                                                                                                                                                                           | the line is `not-offered`                                                                                                                                 |

## What the Assistant's Treasure Map should list

The self-entries, built as Tapestry's `buildShouldSay` builds them (§ 9.2 "Its key", "More than one relay", "A part A
does not publish"):

- Take each of the reader's entries that names the Assistant, most specific first.
- Try its key **verbatim**. A key is valid at relay R when every duty it would win, among the self-entries chosen so
  far, is live at R, and it wins at least one.
- Where the verbatim key isn't valid, try its narrower keys: one per offered kind it covers, then, for `30382`, one
  `30382:<metric>` per live metric. Write the narrower keys in its place.
- Copy nothing else from the reader's Map: no order, no other providers (§ 9.2 "No order, no copies").

On Brainstorm every offered kind has one relay, so this is short. A reader whose Map is what `/setup` publishes, with
Scores live, gets exactly the five Score rows:

```jsonc
["30382:rank", "<A>", "wss://<scores relay>"],
["30382:followers", "<A>", "wss://<scores relay>"],
// …reporters, muters, hops
```

The UI never builds the entries itself. The GET's answer is the one source, as the Duty Menu's offer is.

## The event

```jsonc
{
  "kind": 10040,
  "pubkey": "<the caller's Assistant>",
  "content": "<the newest version's content, unchanged>",
  "tags": [
    /* every tag of the newest version that isn't a self-entry, byte for byte */
    ["30382:rank", "<A>", "wss://<scores relay>"],
    /* …the other self-entries */
    ["client", "Brainstorm"],
  ],
}
```

- A **self-entry** is a tag whose element 1 parses as a Treasure Map key and whose element 2 is the Assistant itself.
  Only those are the writer's; every other tag is kept as it was. Today nothing else signs a kind 10040 as an
  Assistant, so in practice the event is the self-entries alone.
- **No `expiration`** (§ 9.2): drop one if the newest version carries it.
- **`created_at`**: `max(now, newest version found + 1)`, so a new version always replaces (§ 9.2 "When it changes").

## The endpoints

Both are under `verify_token`, for the caller's own Assistant: the key the Duty Menu and Trusted Lists use
(`get_or_create_brainstorm_observer_nsec_by_pubkey_on_db`). Put them on the authenticated `/user` router, as the Duty
Menu's are, so `GET /user/{pubkey}` doesn't answer the path.

### 1. `GET /user/assistantTreasureMap`

The check: what the Assistant's Treasure Map should list now, and why.

```jsonc
{
  "assistant": "<hex>",
  "on": false,
  "duties": [
    {
      "key": "30382:rank",
      "status": "live",
      "relay": "wss://<scores relay>",
      "reason": null,
      "lastLandedAt": null,
      "entries": [["30382:rank", "wss://<scores relay>"]],
    },
    {
      "key": "30392",
      "status": "offered",
      "relay": "wss://…",
      "reason": "not-scheduled",
      "lastLandedAt": null,
      "entries": [],
    },
    {
      "key": "39998",
      "status": "offered",
      "relay": "wss://dcosl.brainstorm.world",
      "reason": "not-published-here",
      "lastLandedAt": null,
      "entries": [],
    },
  ],
  "shouldSay": [["30382:rank", "wss://<scores relay>"] /* … */],
  "relays": ["wss://<scores relay>", "wss://relay.damus.io" /* … */],
}
```

- **`on`**: the remembered choice (below). `false` until the first Turn on.
- **`duties`**: one line per part of each entry in the reader's newest kind 10040 that names the Assistant, in the
  Map's order. These are Tapestry's `dutyLines`, with two changes, because the UI reads the published version itself:
  - `status` is `live`, `offered` (not live, with a `reason`), `not-offered`, or `elsewhere` (a more specific entry
    gives it to another key). Tapestry's `active` is "live and listed", which the UI works out.
  - `entries` lists the `shouldSay` entries that cover the line (`[]` unless it's live). The UI marks the line Active
    when every one of them is found, and "Live, but not listed yet" otherwise.
  - There's no `falseClaim`: the UI flags a found self-entry that isn't in `shouldSay` itself.
- **`shouldSay`**: `[key, relay]` pairs, the self-entries above. They're computed whether the choice is on or off.
  Empty when nothing is live, or when the reader has no Map.
- **`relays`**: where a version is sent and where the UI looks for one (§ 9.2 "Finding a self-Map"):
  - the Assistant's kind-10002 write relays (`assistant_relay_list()`);
  - every relay a `shouldSay` entry names;
  - element 3 of the reader's entries that name the Assistant.
- **The reader's Map**: their newest kind 10040, as `designation_service` reads it. When none is found, `duties` and
  `shouldSay` are both `[]`.

The UI compares `shouldSay` with the self-entries it finds, as a set of `(key, relay)` in any order. The two equal is
**up to date**, and both empty counts. No self-entries found is **not published yet**; anything else is **out of date**.

### 2. `POST /user/assistantTreasureMap`

Body: `{ "on": true }` (Turn on, Update now) or `{ "on": false }` (Turn off). The request says only which; the session
says whose Assistant.

1. **Remember the choice.** Add a boolean column on `brainstorm_nsec`, `treasure_map_on`, default false (an alembic
   migration). Only this route writes it.
2. **Read the newest version** from `relays`, strictly: if no relay answers, publish nothing and answer 502, "Couldn't
   read your Assistant's Treasure Map, so nothing was published."
3. **Build the new tags:** replace the self-entries with `shouldSay`, as computed now, when on; with none when off.
   Keep every other tag, and the content, unchanged.
4. **Nothing would change** (the same self-entries, no `expiration` to drop): publish nothing.
5. **Otherwise sign and publish** to `relays`, plus every relay an earlier version's self-entries named, so that copy
   is replaced too (§ 9.2 "Finding a self-Map"). Use the internal write URL where the server has one, as scores do.

Synchronous, like the Duty Menu: the UI waits up to 30 seconds.

```jsonc
{
  "on": true,
  "published": true,
  "event": {/* the signed version */},
  "relays": [
    { "url": "wss://<scores relay>", "ok": true },
    { "url": "wss://relay.damus.io", "ok": false, "message": "timeout" },
  ],
}
```

When nothing changed: `{ "on": true, "published": false, "event": null, "relays": [] }`. Answer 502 if no relay took
the new version, as the Duty Menu does.

The UI adds `event` to its store, so the step turns done at once, shows one line per relay, and asks for the check
again.

## What the UI shows

- **404 or 405 on the GET, or an answer that isn't a check** (no 64-hex `assistant`, no boolean `on`, or no `duties`
  and `shouldSay` arrays): the step and its page say nothing, and `/setup` keeps its other steps.
- **401**: as any other signed-in call.
- **Any other error**: "Couldn't reach your Assistant right now", with the detail.
- **The step is done** when the found self-entries equal `shouldSay`, as Tapestry's hub counts it. A reader with
  nothing live and nothing published is done, and nobody is asked to publish an empty Map.
- **The buttons** are Tapestry's `selfMapButtons`:
  - while off: Turn on, plus Turn off when a version still lists some of the Assistant's duties, so no claim is
    stuck;
  - while on: Update now (enabled unless up to date) and Turn off.

## Not asked for (yet)

- **Keeping it true on its own** (Tapestry's story 5, not built there either). § 9.2 says a key MUST remove or narrow
  a self-entry _before_ it stops publishing what the self-entry speaks for. Until the server republishes when the
  answer changes, the UI shows the Map as out of date, flags any listed duty that isn't live, and the reader presses
  Update now. A natural first hook is after a TA publish succeeds, and whenever a reader's scheduling policy is
  disabled or their entitlement lapses: then the self-entries come off before upkeep stops.
- **Counting Maps** (§ 9.2): a self-entry is never its key's choice of a provider. Anything that counts kind-10040
  adopters should skip a Map whose public entries all name its author.
- **Private duties** (NIP-85's encrypted `.content`): never in a self-Map's public tags.
- **Trusted Lists and Concepts as live duties**: they become claimable once something publishes and keeps them up
  to date, at which point the table above gains a row for each.
