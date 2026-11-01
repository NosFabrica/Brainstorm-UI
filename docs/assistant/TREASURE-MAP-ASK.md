# Your Assistant's Treasure Map — the server endpoints the UI is wired for

**For:** brainstorm_server
**From:** the UI, branch `feat/setup-treasure-map`, 2026-10-27
**Filed as:** the second item of [NosFabrica/brainstorm_server#110](https://github.com/NosFabrica/brainstorm_server/pull/110)
**Built in:** that PR, merged into brainstorm_server main as `3cf0aa5` on 2026-10-31, after the four rounds of its
audit and the two reviews after the fourth. It is on staging, not yet in production. This doc says what it does.
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

The step is **hidden** while the GET is under way, and when the server doesn't support it: a 404 or 405 on
`GET /user/assistantTreasureMap`, or an answer that isn't a check (below), means "not on this server yet". Before any
check has loaded, the GET's own 502s and its 422 show it, not counted, so its page's Turn off stays in reach, until a
Turn off has answered; any other failure hides it, as no route does, since its page would have nothing to press. Once
a check has loaded, a failed re-check keeps that check's status.

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
  `not-published-here`. A server with no Dictionary relay (`dictionary_relay` empty) doesn't offer them: a `39998:<d>`
  or `39999:<d>` key is then `not-offered`, and a bare `39998` or `39999` gets no line of its own.
- **A key the check doesn't read**, such as `30392:tag:x` or `30382:tag:x`: any key but a kind slot alone (`30392`,
  `3038x`, `*`), a Score kind or `3038x` with one metric (`30382:rank`, `3038x:rank`; `tag`, `pin`, `dlist` and
  `contexts` aren't metrics) or a Concept key. It is never listed. Under a row that offers its whole kind, as `30392`
  does, the line is `offered` with `unchecked`; otherwise it is `not-offered`.
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
of it, so it narrows to `30382:<metric>` keys, one per live metric it wins. On Brainstorm every offered key has one
relay, so the rest is short. A reader whose Map gives the Assistant all five metrics, as the server's
`GET /setup/{pubkey}` rows do, gets exactly the five Score rows, with Scores live:

```jsonc
["30382:rank", "<A>", "wss://<scores relay>"],
["30382:followers", "<A>", "wss://<scores relay>"],
// …reporters, muters, hops
```

The UI's activation names the Assistant for `30382:rank` and `30382:followers` only, so with Scores live, a reader whose
Map is what it wrote gets those two.

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
  "writerRelays": ["wss://<scores relay>", "wss://relay.damus.io" /* … */],
}
```

- **`on`**: the remembered choice (below). `false` until the first Turn on.
- **`duties`**: one line per part of each entry in the reader's newest kind 10040 that names the Assistant, in the
  Map's order. These are Tapestry's `dutyLines`, with two changes, because the UI reads the published version itself:
  - `status` is `live`, `offered` (not live, with a `reason`), `not-offered`, or `elsewhere` (a more specific entry
    gives it to another key). Tapestry's `active` is "live and listed", which the UI works out.
  - `entries` lists the `shouldSay` entries that cover the line: `[]` unless it's live and `shouldSay` lists it. The UI
    marks the line Active when it has entries and every one of them is found. Any other live line reads "Offered but
    not active", with "Live, but your Assistant's Treasure Map doesn't list it yet."
  - There's no `falseClaim`: the UI flags a found self-entry that isn't in `shouldSay` itself.
- **`shouldSay`**: `[key, relay]` pairs, the self-entries above. They're computed whether the choice is on or off.
  Empty when nothing is live, or when the reader has no Map.
- **`relays`**: where to look for a version (§ 9.2 "Finding a self-Map"), each once:
  - the Assistant's kind-10002 write relays (`assistant_relay_list()`);
  - every relay a `shouldSay` entry names;
  - element 3 of the reader's entries that name the Assistant: hints for readers. A press never reads or sends there
    (below).
- **`writerRelays`**: the relays the press that keeps the current choice reads (step 2), and so every relay its repair
  can reach: while on, Update now's (the outbox, then the relays `shouldSay` names); while off, Turn off's (the outbox
  alone). Each once, at its public URL (the TA relay never at its internal one), never a hint. A server from before the
  field (`ee749d6`) leaves it out: the answer is still a check, and the UI asks no relay (below).
- **The reader's Map**: their newest kind 10040, as `designation_service` reads it. When none is found, `duties` and
  `shouldSay` are both `[]`.
- **502** when the reader's Map can't be read (a relay error, or a `CLOSED`): "Couldn't read your Treasure Map, so your
  Assistant's Treasure Map couldn't be checked. Try again in a moment." It never answers an empty check for a Map it
  couldn't read.
- **502** when the reader's follow count can't be read within 5 s: "Couldn't check whether your Scores are kept up to
  date. Try again in a moment." Read as none, it would make Turn on take the Scores entries off. It's read alongside the
  reader's Map, and waited for only when that Map asks the Assistant for Scores (an entry naming it has a key whose kind
  slot is `30382`, `3038x` or `*`, whatever follows: `asks_for_scores`) and the scheduler's other tests admit a run
  (above), never for the House Observer. Otherwise the count changes nothing.
- **422** when the reader's Map names more than 64 keys: "Your Treasure Map names more than 64 keys, too many to check,
  so your Assistant's Treasure Map couldn't be checked." A check's cost grows with the square of the keys, and a cut-down
  Map could give the wrong self-entries. Real Maps name about 30 at most.

The UI counts the published version **up to date** when its self-entries are `shouldSay`, as sets of key and relay,
whether the choice is on or off: when Turn on or Update now would sign nothing (step 3 below). Both empty counts. No
self-entries found is **not published yet**, after a Turn off too; anything else is **out of date**.

### 2. `POST /user/assistantTreasureMap`

Body: `{ "on": true }` (Turn on, Update now) or `{ "on": false }` (Turn off). The request says only which; the session
says whose Assistant. A body whose `on` isn't a JSON boolean is a **422**. A second press for the same Assistant while
one is under way is refused at once, nothing queued: **409**, "Your Assistant's Treasure Map is already being
published. Try again in a moment."

1. **Read the reader's Map** for `{ "on": true }`, and the follow count alongside it, as the GET does. If the Map can't
   be read, it answers 502, "Couldn't read your Treasure Map, so nothing was published." With more than 64 keys it
   answers 422, "…too many to check, so nothing was published." A follow count it can't read, when the GET would wait
   for it (above), answers the GET's 502. **Turn off reads neither**: it lists nothing, so nothing in the Map can
   change what it publishes. It never gets the Map's 502, the follow count's or the 422, and never waits for that read.
2. **Read the newest version**, strictly, from the writer's relays (§ 9.2): the Assistant's outbox and the relays of
   the self-entries this press lists, `shouldSay` when on and none when off, so Turn off reads the outbox alone. The
   scores relay is read at its internal URL, as scores are. The GET names this set, for the press that keeps the
   current choice, as `writerRelays`. If no relay answers, publish nothing and answer 502, "Couldn't read your
   Assistant's Treasure Map, so nothing was published." The reader's hints are never read or sent to: the reader
   writes their own Map, so a hint can name any host, internal ones included.
3. **Nothing would change** when the newest version's self-entries already are the target (`shouldSay` when on, none
   when off), as sets of key and relay. Then nothing is signed. A relay that answered step 2 without the newest version,
   such as the scores relay after it was down, is sent that same version, already signed, and the answer is
   `published: true` with it. A relay that didn't answer is left alone.
4. **Otherwise build and sign the next version**, as The event says, and check it before anything is sent: it verifies,
   carries exactly the tags built, and its self-entries are the target. If it can't be signed or fails the check, send
   nothing and answer 500, "Your Assistant's Treasure Map didn't pass its own check, so it wasn't published." Otherwise
   send it to the writer's relays, plus every relay an earlier version's self-entries named, so that copy is replaced
   too.
5. **Remember the choice** in `brainstorm_nsec.treasure_map_on` (default false; migration `c5f1d7a9e2b4`), once the
   press has succeeded: after the send, committed before the answer. Only this route writes it, and any error leaves it
   as it was.

Synchronous, like the Duty Menu: the UI waits up to 30 seconds. Turn on and Update now take about 28 at worst: the
reader's Map and the versions are read in up to 6 seconds each, the follow count alongside the Map in up to 5, the
connect takes up to 4 and the send 12. Turn off reads no Map, so it takes about 22.

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
nothing changed and every relay that answered step 2 holds the newest version:
`{ "on": true, "published": false, "event": null, "relays": [] }`.
When step 3 re-sent it: `published: true`, the version as `event`, and a line for each relay it went to, whether or not
they took it. The version is already on a relay it was read from, so a failed line isn't a 502. A new version answers
502 if no relay took it, as the Duty Menu does: "Your Assistant's Treasure Map didn't reach any relay. Try again in a
moment."

The UI adds `event` to its store, so after Turn on or Update now the step turns done at once; after Turn off, only when
`shouldSay` is empty (above). It then asks for the check again, since the choice and what is live can both have moved,
first dropping a GET already out: that one was sent before the press and can carry the old choice, so one is asked
after it in its place. Otherwise a 422 isn't asked again unless the press was a Turn on or Update now that got through,
since only those read the reader's Map. While the check stands, the press's answer, one line per relay, and its choice
show when that check is back, the pressed button saying "Publishing…" until then; while it is failing, they show at
once. A press belongs to the account it was made for, not to the view that made it: it settles against that account
whichever is active by then, and a view of the page opened while it's under way keeps its buttons busy, sends no second
press, and shows its answer when it comes. Until a check asked after the press is back, every view shows the press's
choice, and the page asks no relay which version it holds, since `writerRelays` are the choice's (below).

## What the UI shows

- **404 or 405 on the GET, or an answer that isn't a check** (no 64-hex `assistant`, no boolean `on`, or no `duties`
  and `shouldSay` arrays), **or a 2xx that isn't JSON at all**, asked once more first: the step is hidden, and `/setup`
  keeps its other steps. Opened directly, its page says "Your Brainstorm server can't keep your Assistant's Treasure
  Map yet." in place of its panels and buttons, with a press made before that still answering beneath. Over a check
  from before, a 2xx that isn't JSON is a failure like any other (below): a proxy's page says nothing about the route.
- **401**: as any other signed-in call.
- **Any other error**: the server's own sentence (FastAPI's `detail`: a gateway's or a limiter's `message` isn't
  one); ours with the status when it answered without one ("Couldn't check your Assistant's Treasure Map (500).");
  or, for a request that got no answer (no connection, or none within 15 seconds), "Couldn't reach your Assistant
  right now." and why. Before any check has loaded it takes the panels' place, with only Turn off, which needs no
  check (step 1), and only for the GET's own 502s and its 422, which Turn off never meets: any other failure can't be
  told from one that would fail Turn off too. A Turn off under way keeps its place there, whatever the failure becomes
  meanwhile, and once it has answered it isn't offered again. The 422 isn't asked again until the Map is edited; any
  other failure is asked once more, a proxy's or a limiter's 408 or 429 included. With a check from before, it sits
  above that check's panels and buttons, saying that the duties and what the Map should list are from the last check
  that worked. A failure stands until an answer arrives, on every view of it, a re-ask waiting for the network
  included: this page and `/setup` ask again as they open, and a press asks again (above), while the header, the
  account menu and the dashboard card show it as it stands, asking again only as every query is, on a reconnect or
  when the app comes back. Before any check has
  loaded, `/setup` keeps the step's row for the GET's own 502s and its 422, not counted, linking to this page, until a
  Turn off has answered; once a check has loaded, it keeps that check's status. A press that failed, the 409 included,
  shows it alone.
- **It reads a version as the press does.** Self-entries are the tags whose key parses, naming the Assistant, each key
  and relay once, so a hand-made `3040x` entry is an ordinary tag to both. The step is done exactly when Turn on or
  Update now would sign nothing (step 3): the version's self-entries are `shouldSay`, whatever else it carries, whether
  the choice is on or off. Tapestry's ledger keeps that rule as an open bug
  (`2026-10-13-self-map-current-ignores-expiration`), because its writer keeps every other tag; Brainstorm's writes
  none, so here it is the whole rule. A reader with nothing live and nothing published is done, and nobody is asked to
  publish an empty Map. After a Turn off, the step isn't done while `shouldSay` lists anything.
- **Which relays hold the newest version** is a relay probe (ADR 0005), on this page only, asked while a press would
  otherwise sign nothing (on and up to date, or off with nothing listed) and a version has been found, and only from a
  check that stands: answered by its last ask, and not being asked again, since another device may have changed the
  choice and with it the relays a press reads. It asks exactly the GET's `writerRelays`, each for its own newest
  version, as step 2 reads it: that counts only when it's the Assistant's own kind 10040 and verifies, and a newest
  that isn't (a forged or a foreign copy) means the relay holds none, whatever older version it also sent. From those
  answers alone it does what the press would:
  - when their newest version's self-entries are the target (`shouldSay` while on, none while off), each relay that
    answered without that version is sent it (step 3): the page names it, and offers the press, though the
    self-entries match;
  - otherwise the press signs a new version for them all (step 4), and the page names every relay that answered;
  - one that doesn't answer within 5 seconds, as the press gives up reading it, isn't named: step 3 leaves it alone,
    and a version step 4 signs goes there anyway.

  The store's version isn't counted: it can come from anywhere, the reader's hints included, and one that no relay a
  press reads holds would keep the press on offer while each press answers "Nothing changed". A check without
  `writerRelays` asks no relay.

  Each relay counts as it answers, since a later answer can only add one: the page names a relay as soon as its answer
  shows the miss, and says it's still asking the others. An answer stands a minute for a page opened again on the same
  check; each new answer to the check asks again. A press asks nothing while it
  is under way, and until it has answered the page shows the relays its button was offered for; then none until a
  check asked after it is back, since the choice can change which relays a press reads. Then that check's
  `writerRelays` are asked, and the press's answer doesn't wait for them.

  What that leaves out:
  - A relay that answers but doesn't keep the Assistant's kind 10040 stays named, and each press re-sends there to no
    effect. The outbox's relays that answer keep it (on 2026-10-29 the TA relay and relay.primal.net served kind
    10040; relay.damus.io, nos.lol and relay.nostr.band didn't answer, so they aren't named). The Dictionary relay
    refuses it, so once Concepts are live there and `shouldSay` names it, Update now would stay on offer: that has to
    be settled on the server before then.
  - A relay outside the outbox that a duty was live at, and that missed the version dropping it, is never read again:
    no later press reads there, so `writerRelays` doesn't name it, and it keeps serving the dropped self-entry. It can't
    happen yet, since only Scores can be live, at the scores relay, which heads the outbox.
  - The page predicts the press from the browser's own reads. The press reads the writer relays from the server: a
    cold socket, one 5-second deadline, the server's own IP, and the TA relay at its internal URL. A relay the browser
    sees answer without the newest version may be one the press doesn't hear from (a timeout, or a rate limit on the
    server's IP), and the page then offers a press that answers "Nothing changed", round after round. Only the server
    can say what its own reads find (below).

- **The buttons** are Tapestry's `selfMapButtons`, with the repair:
  - while off: Turn on, plus Turn off when a version still lists some of the Assistant's duties, or a relay missed the
    newest one, so a claim the page can see can be taken off;
  - while on: Update now (enabled unless up to date and no relay asked has missed it) and Turn off.
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
- **Which writer relays miss the newest version, by the server's own reads**: the GET, or a dry run of the POST,
  naming them would replace the page's probe and its guess (above).
- **A machine-readable reason in the GET's error body**, beside its sentence, so the UI needn't read which failure it
  was from the status alone.
- **The server's own open points** are in PR 110:
  - one press at a time is held in-process only, so it needs Redis once the server runs more than one instance;
  - the POSTs have no rate limit;
  - a relay that refused a removal keeps the old claim;
  - a relay outside the outbox that missed a removal keeps the old claim too, and no press reads or sends there
    again.
- **The audit's follow-ups**, filed on brainstorm_server:
  - NosFabrica/brainstorm_server#117: `/{pubkey}` routes that take only hex, so these paths no longer depend on the
    order routes are mounted in;
  - NosFabrica/brainstorm_server#118: one kind-10040 grammar for GrapeRank and the Treasure Map;
  - NosFabrica/brainstorm_server#119: the POST answering with the check, which would change § 2 here and the UI's
    hook together.
