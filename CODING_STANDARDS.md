# Coding standards

Read at review. Each rule is a judgement call no lint rule can make; mechanical
rules live in `eslint.config.js`.

## Nostr reads (docs/adr/0005)

- **Stable filters.** A filter or ask key built in render is memoized on its real
  inputs. A time window (`since`, `until`) is fixed once per input set, never
  `Date.now()` per render: every new filter is a new store subscription and a new
  REQ.
- **Settled before dependents.** An ask keyed on events still streaming into the
  store — their parents, their reactions, a tally over them — waits for the parent
  ask's `settled`. Keyed on a list that grows per arriving event, it re-keys and
  sends a REQ each time.
- **Store, not cache, for own writes.** A publish shows through the store
  (`publishToRelays` adds it). An optimistic flip before signing goes through a
  pending overlay (`lib/listEdits` is the pattern), never `setQueryData` on Nostr
  data.
