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

## DList item rendering tiers (docs/adr/0007)

How a DList item renders: tier two is drawn from its list's header, tier three is a
view made by hand for one concept. Lint keeps tier two from importing tier three
(`components/items/`). These are the rules lint can't see.

- **Tier two never names a concept.** No concept's field names, coordinates or
  special cases in `DListItemHero`, the DList item cards, rows and tiles,
  `useItemView` or `lib/itemPresentation`. A concept that needs its own look gets a
  tier-three view.
- **Tier three plugs in from above.** A view's DList item page goes through
  `ItemPage`; how its DList items read among many goes through its `present`, which
  `TierThreeProvider` hands to tier two. When a view needs a seam in tier two, the
  seam is generic: it names no concept and does nothing unless tier three uses it
  (the presentation override, `imageShape`, `DListItemNeighbours`' opt-out props).
- **Tier three starts from tier two, then improves on it.** Where the header says
  enough, a view uses what tier two makes of it (`fieldCell`'s href for a `tel` field,
  `httpUrl`), so the two tiers agree. Where the header falls short, say an untyped
  phone field, the view may do better on its own: that's what tier three is for. It
  adds its own presentation either way. Places' Call button is the example: tier two's
  `tel:` when the header types the field, its own reading of the value
  (`lib/contactHref`) when it doesn't.
- **The test: delete it.** With `components/items/` gone, the provider removed and
  `ItemPage` back to `DListItemHero`, tier two must read exactly as it did before.
- **Tier-two changes stand alone.** A change to how every concept renders (a new
  hint, a fact that links) is its own PR, argued on its own, not carried in by a
  view. Something tier two can't express yet becomes a hint proposal.
