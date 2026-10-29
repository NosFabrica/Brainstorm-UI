# Your Assistant's Treasure Map — the server endpoints the UI is wired for

**For:** brainstorm_server
**From:** the UI, branch `feat/setup-treasure-map`, 2026-10-27
**Filed as:** the second item of [NosFabrica/brainstorm_server#110](https://github.com/NosFabrica/brainstorm_server/pull/110)
**Built in:** `562110f` on that PR, with the fixes from both rounds of its audit (2026-10-28 and 2026-10-29). It is in
review and not deployed. This doc says what it does.
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

The offer is the Duty Menu's (`duty_menu_build.offer_rows`), and it is **per key**: Scores are offered metric by
metric, `30382:rank` and the rest, never as a bare `30382`. For each key:

- **`30382:rank`, `followers`, `reporters`, `muters`, `hops`**, the five metrics `ta_signing.ta_tags` signs. Live when
  both hold:
  - `last_time_published_graperank` is set. It is set only when every event of a run was OK'd, and the first run
    publishes the full set.
  - Something keeps them up to date, and the last publish is no older than **2 ×** its interval. One missed run is a
    brief gap; two in a row is a stop. For most readers that is the scheduler, read as it admits a run:
    `scheduler_enabled`, a default policy, the reader's policy (or the default) enabled, at its
    `schedule_interval_seconds`, and a reader who follows someone, since with no follows there is nothing to score
    (`has_grapevine`, which the scheduler and the check share). The **House Observer** (`periodic_graperank_pubkey`) is
    the exception: the scheduler leaves it to the periodic trigger, so its interval is that trigger's 2 hours, whatever
    `scheduler_enabled` says.

  Otherwise the `reason` is, in this order:
  - `not-scheduled`: nothing keeps them up to date, whether or not they ever landed;
  - `not-landed`: they are kept up to date, but have never been published;
  - `upkeep-stopped`: the last publish is too old, given as `lastLandedAt`.

- **`30392` Trusted Lists**: never live, for now. They are published only when an admin runs `POST /admin/trustedLists`,
  and nothing keeps them up to date: `not-scheduled`.
- **`39998`, `39999` Concepts**: never live, for now. The Assistant publishes no headers or items yet:
  `not-published-here`.
- **Any other key**: another `30382` metric, `30383`…, or a kind the menu has no row for. No offer row covers it, so
  the line is `not-offered`. That includes the `30393` and `30394` rows the UI's activation writes, since the Duty
  Menu offers Trusted Lists as `30392` alone.

## What the Assistant's Treasure Map should list

The self-entries, built as Tapestry's `buildShouldSay` builds them (§ 9.2 "Its key", "More than one relay", "A part A
does not publish"):

- Take each of the reader's entries that names the Assistant, most specific first.
- Try its key **verbatim**. A key is valid at relay R when every duty it would win, among the self-entries chosen so
  far, is live at R, and it wins at least one.
- Where the verbatim key isn't valid, try its narrower keys: one per offered kind it covers, then, for `30382`, one
  `30382:<metric>` per live metric. Write the narrower keys in its place.
- Copy nothing else from the reader's Map: no order, no other providers (§ 9.2 "No order, no copies").

Because the offer is per metric, a bare `30382`, `3038x` or `*` is **never claimed verbatim**: no offer row covers all
of it, so it always narrows to the five `30382:<metric>` keys. On Brainstorm every offered key has one relay, so the
rest is short. A reader whose Map is what `/setup` publishes, with Scores live, gets exactly the five Score rows:

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
  "content": "",
  "tags": [
    ["30382:rank", "<A>", "wss://<scores relay>"],
    /* …the other self-entries */
    ["client", "Brainstorm"],
  ],
}
```

- **The self-entries and the `client` tag, nothing else**, and empty content. Only this server signs the Assistant's
  kind 10040 (no route exports its key), so a version holds nothing else to keep. Tapestry's writer keeps every other
  tag and the content as found (ADR `assistant-self-map/0002` sub-decision 4); the server's ADR says to bring that back
  if the key is ever exported.
- A **self-entry**, as readers count them, is a tag whose key parses and whose element 2 is the Assistant, each key and
  relay once. A key parses when its kind slot is five ASCII digits, `3038x`, `3039x` or `*`, and it isn't a spelling
  that names nothing, such as `39998:`.
- **No `expiration`** (§ 9.2).
- **`created_at`**: `max(now, newest version found + 1)`, so a new version always replaces (§ 9.2 "When it changes").

## The endpoints

Both are under `verify_token`, for the caller's own Assistant: the key the Duty Menu and Trusted Lists use
(`get_or_create_brainstorm_observer_nsec_by_pubkey_on_db`). They're on the authenticated `/user` router, as the Duty
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
- **`relays`**: where to look for a version (§ 9.2 "Finding a self-Map"), each once:
  - the Assistant's kind-10002 write relays (`assistant_relay_list()`);
  - every relay a `shouldSay` entry names;
  - element 3 of the reader's entries that name the Assistant: hints for readers. A press never reads or sends there
    (below).
- **The reader's Map**: their newest kind 10040, as `designation_service` reads it. When none is found, `duties` and
  `shouldSay` are both `[]`.
- **502** when the reader's Map can't be read (a relay error, or a `CLOSED`): "Couldn't read your Treasure Map, so your
  Assistant's Treasure Map couldn't be checked. Try again in a moment." It never answers an empty check for a Map it
  couldn't read.
- **502** when the reader's follow count can't be read within 1 s: "Couldn't check whether your Scores are kept up to
  date. Try again in a moment." Read as none, it would make Turn on take the Scores entries off. It's read only when the
  reader's Map asks the Assistant for Scores, a key naming it that covers kind 30382 (`asks_for_scores`): otherwise no
  Score is its duty, and the count changes nothing.
- **422** when the reader's Map names more than 64 keys: "Your Treasure Map names more than 64 keys, too many to check,
  so your Assistant's Treasure Map couldn't be checked." A check's cost grows with the square of the keys, and a cut-down
  Map could give the wrong self-entries. Real Maps name about 30 at most.

The UI counts the published version **up to date** when a press would sign nothing, by the press's own rule (step 3
below). Both empty counts. No self-entries found is **not published yet**; anything else is **out of date**.

### 2. `POST /user/assistantTreasureMap`

Body: `{ "on": true }` (Turn on, Update now) or `{ "on": false }` (Turn off). The request says only which; the session
says whose Assistant. A body whose `on` isn't a JSON boolean is a **422**. A second press for the same Assistant while
one is under way is refused at once, nothing queued: **409**, "Your Assistant's Treasure Map is already being
published. Try again in a moment."

1. **Read the reader's Map**, and for Turn on the follow count, when the GET reads it. If the Map can't be read,
   `{ "on": true }` answers 502, "Couldn't read your Treasure Map, so nothing was published." With more than 64 keys it
   answers 422, "…too many to check, so nothing was published." A follow count it can't read answers the GET's 502.
   Turn off goes ahead without the Map in both cases, and never reads the follow count: it lists nothing, and live
   Scores would only add the scores relay, which the Assistant's outbox already names.
2. **Read the newest version**, strictly, from the writer's relays (§ 9.2): the Assistant's outbox and the relays
   `shouldSay` names, the scores relay at its internal URL, as scores are. If no relay answers, publish nothing and
   answer 502, "Couldn't read your Assistant's Treasure Map, so nothing was published." The reader's hints are never
   read or sent to: the reader writes their own Map, so a hint can name any host, internal ones included.
3. **Nothing would change** when the newest version's self-entries already are the target (`shouldSay` when on, none
   when off), as sets of key and relay. Then nothing is signed. A relay that answered step 2 without the newest version,
   such as the scores relay after it was down, is sent that same version, already signed, and the answer is
   `published: true` with it. A relay that didn't answer is left alone.
4. **Otherwise build and sign the next version**, as The event says, and send it to the writer's relays, plus every
   relay an earlier version's self-entries named, so that copy is replaced too.
5. **Remember the choice** in `brainstorm_nsec.treasure_map_on` (default false; migration `c5f1d7a9e2b4`), once the
   press has succeeded: after the send, committed before the answer. Only this route writes it, and any error leaves it
   as it was.

Synchronous, like the Duty Menu: the UI waits up to 30 seconds, and a press takes about 29 at worst. The reader's Map
and the versions are read in up to 6 seconds each, the follow count in 1, the connect takes up to 4 and the send 12.

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

A relay the server couldn't connect to reads `"message": "couldn't connect"`; the raw error is only logged. When
nothing changed and no relay missed the newest version: `{ "on": true, "published": false, "event": null, "relays": [] }`.
When step 3 re-sent it: `published: true`, the version as `event`, and a line for each relay it went to, whether or not
they took it. The version is already on a relay it was read from, so a failed line isn't a 502. A new version answers
502 if no relay took it, as the Duty Menu does: "Your Assistant's Treasure Map didn't reach any relay. Try again in a
moment."

The UI adds `event` to its store, so the step turns done at once, and shows one line per relay. Then it asks for the
check again, and asks the relays whether they now hold the newest version (below).

## What the UI shows

- **404 or 405 on the GET, or an answer that isn't a check** (no 64-hex `assistant`, no boolean `on`, or no `duties`
  and `shouldSay` arrays): the step and its page say nothing, and `/setup` keeps its other steps.
- **401**: as any other signed-in call.
- **Any other error**: the server's sentence. A check that failed reads "Couldn't reach your Assistant right now."
  before it, and still offers Turn off, which needs no check (step 1). A press that failed, the 409 included, shows it
  alone.
- **It reads a version as the press does.** Self-entries are the tags whose key parses, naming the Assistant, each key
  and relay once, so a hand-made `3040x` entry is an ordinary tag to both. The step is done exactly when a press would
  sign nothing (step 3): the same self-entries, whatever else the version carries. Tapestry's ledger keeps that rule as
  an open bug (`2026-10-13-self-map-current-ignores-expiration`), because its writer keeps every other tag; Brainstorm's
  writes none, so here it is the whole rule. A reader with nothing live and nothing published is done, and nobody is
  asked to publish an empty Map.
- **Which relays hold the newest version** is a relay probe (ADR 0005), asked once the version is read. Each relay a
  press reads (step 2) is asked for it by id:
  - one that answers without it has missed it, and a press sends it there (step 3). The page names it, and offers the
    press, though the self-entries match;
  - one that doesn't answer is left alone, as the press leaves it.

  Only the writer's relays the UI can tell apart are asked: those `shouldSay` names, and the scores relay, which heads
  the Assistant's outbox. The GET's other `relays` are the outbox's other relays and the reader's hints, and the
  answer doesn't say which is which. A hint must never be asked: a press never sends there, so Update now would never
  turn off. A version an outbox relay missed waits for the next press that signs one.

- **The buttons** are Tapestry's `selfMapButtons`, with the repair:
  - while off: Turn on, plus Turn off when a version still lists some of the Assistant's duties, or a relay missed the
    newest one, so no claim is stuck;
  - while on: Update now (enabled unless up to date and held wherever it was asked for) and Turn off.
- **Elsewhere in the app**, a self-Map found on relays, in search results or on its `/e` page, reads as what its
  Assistant publishes ("Publishes and keeps up to date · Rank, Followers, …"), never as an activation
  (`describeDesignation`).

## Not asked for (yet)

- **Keeping it true on its own** (Tapestry's story 5, not built there either). § 9.2 says a key MUST remove or narrow
  a self-entry _before_ it stops publishing what the self-entry speaks for. Until the server republishes when the
  answer changes, the UI shows the Map as out of date, flags any listed duty that isn't live, and the reader presses
  Update now. A natural first hook is after a TA publish succeeds, and whenever a reader's scheduling policy is
  disabled or their entitlement lapses: then the self-entries come off before upkeep stops.
- **Counting Maps** (§ 9.2): a self-entry is never its key's choice of a provider. Nothing in Brainstorm counts
  kind-10040 adopters today; anything that starts to should skip a Map whose public entries all name its author.
- **Private duties** (NIP-85's encrypted `.content`): never in a self-Map's public tags.
- **Trusted Lists and Concepts as live duties**: they become claimable once something publishes and keeps them up
  to date, at which point the list above gains a rule for each.
- **The server's own open points** are in PR 110:
  - one press at a time is held in-process only, so it needs Redis once the server runs more than one instance;
  - the POSTs have no rate limit;
  - a relay that refused a removal keeps the old claim.
- **The GET naming the relays a press reads**, beside `relays`. The UI could then ask the whole outbox for the newest
  version, not only the scores relay and the relays `shouldSay` names.
- **The audit's follow-ups**, not filed yet:
  - `/{pubkey}` routes that take only hex, so these paths no longer depend on the order routes are mounted in;
  - one kind-10040 grammar for GrapeRank and the Treasure Map;
  - the POST answering with the check, which would change § 2 here and the UI's hook together.
