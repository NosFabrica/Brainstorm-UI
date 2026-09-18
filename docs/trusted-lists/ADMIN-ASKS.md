# Trusted Lists in admin — what ships now, what needs the server

**For:** Enes, Vinney (server)
**From:** the UI, branch `feat/admin-trusted-lists`, 2026-09-18
**Built against:** NosFabrica/brainstorm_server#86 (`POST /admin/trustedLists/{observer_pubkey}`)

## Shipped in the UI

**Admin → Trusted Lists**, plus a **Publish trusted lists…** item in each user's ⋯ menu on
the Users tab, which opens the same flow for that person.

- **Pick the observer**, meaning the customer the lists are for: a Brainstorm account
  (search by name, or paste an npub/hex that has an account) or **Brainstorm (house)**,
  resolved from `/.well-known/nostr.json?name=_`.
- **Confirm first.** The dialog names the person and says what happens: their lists are
  published signed by their Brainstorm key, lists that no longer qualify are retracted,
  and it can take up to a minute. The button can't be pressed twice while a run is out.
- **Read the run back.** You get the counts (qualifying asserters, lists, published,
  failed, retracted) and one row per list with its status, members and taggings, plus
  the error on a failed list. Each `empty_reason` is explained in words with the next
  step.
- **When the endpoint 404s** (#86 not deployed), the tab says "Trusted lists aren't
  available on this server yet."
- **Results live only in the session.** The server keeps no record of them yet
  (ask 1).

## Asks, in the order they pay off

### 1. Remember runs

Persist each `TrustedListRunData`, with when it ran and which admin ran it, and add:

```
GET /admin/trustedLists/{observer}   → last run (or history)
GET /admin/trustedLists              → observers with lists: last run time, list count, published/failed
```

Today a reload loses the result, and nobody can see which customers have lists or when
they were last built.

### 2. A managed set of observers, and regeneration

A stored list of customer observers, re-run on a schedule or when their taggings change.
Lists go stale as people tag. Right now only a manual run updates them.

### 3. The thresholds in effect, read-only

`GET` the values of `TRUSTED_LIST_MIN_RANK`, `MIN_TAG_USES`, `CUTOFF` and `RELAY`. The
UI could then explain a list as "used by at least N people ranked ≥ R in their web of
trust", and say where the lists went.

### 4. One run per observer at a time

Return a lock or `409` while a run for the same observer is in flight. The UI stops
double clicks, but not two admins at once, and both would publish.

### 5. Don't mint keys for strangers

The endpoint creates an assistant key for any pubkey it's given. The UI only offers
Brainstorm accounts, but the API doesn't enforce that. Consider refusing pubkeys with
no account.

### 6. Optional: an async run

Runs are synchronous for up to about a minute. `202` plus a poll would survive proxy
timeouts. The UI allows 120 seconds today.

## Our follow-up: the kind-10040 row

Our "Activate Brainstorm" step writes only `30382:rank` and `30382:followers`
(`client/src/services/nostr.ts`, the 10040 builder) and never reads `/setup`. So the new
`["30392", <assistant>, <relay>]` row is never published, and other apps can't discover a
customer's lists from their 10040. It needs consent copy and re-activation for existing
users, so it's planned as its own change.
