# Three tiers of item rendering

**Status:** accepted, 2026-10-12. Amends [ADR 0004](0004-renderers-read-the-governing-concept.md).
Amended 2026-10-13: tier two imports nothing from tier three; tier three plugs in from above
(see "Tier two doesn't know of tier three" below).

ADR 0004 decided that no concept has code of its own: a list item is drawn from its
governing definition's fields, display hints and URL templates, and a registry of
per-concept renderers was removed ("burn the ships"). That gave every concept a page for
free, and it still does. It also set a ceiling: a page built only from hints can show a
title, a line, a picture, links, facts, a map and a player, and nothing a concept would
want beyond that. A GitHub account has an avatar GitHub serves at its handle; a book has
an ISBN that names it on three sites; a restaurant has hours that read better as "open
now". None of that is a field.

The team's model (2026-10-12) is three tiers:

1. **Raw.** The item's tags as they are: what `DListItemHero` shows when no definition
   can be read ("Undefined"), and what an admin's "More fields" fold holds.
2. **Dynamic.** The page every concept gets from its governing definition: ADR 0004's
   path, `DListItemHero`, drawn from `useItemView`.
3. **Custom.** A page made by hand for one community concept, the best the app can do for
   that kind of thing: `components/items/`.

## Decision

A tier-three view is a presentation of the tier-two view, not a way around it.

- **Keyed by the community concept's coordinate** (`config/dictionary.config.json`
  `views`, read through `conceptViewOf`), the far end of the resolved chain, so the
  reader's copy, their Assistant's and the house's all open the same page. The key is a
  Nostr identifier that is the same on every deployment, so it is JSON config, never a
  literal in code.
- **It receives the same `ReadyItemView` tier two draws from** and reads fields only
  through the governing definition (`fieldCell` on a declared field), never from the
  item's raw tags. The view knows the community concept's field names, which is what being
  keyed by that concept means; a copy that renames or drops a field the view needs leaves
  the item to tier two. Each view says whether it `applies` (`components/items/itemViews`),
  and the item's page draws tier two when it doesn't.
  - _The seeded concept with an empty header_ (2026-10-12): the community `books` header
    declares no fields at all, so reading only through it would leave every book
    untitled. The book view reads a field by the name Open Library's seed gave it
    **only while the governing definition declares nothing for that name**; the moment a
    definition declares the field, its declaration wins (`lib/books`). This is the one
    allowance, for a concept whose header is empty, and it closes on its own when a copy
    that declares the fields exists (`docs/dictionary/house-copies.md`).
- **Links come from the definition.** A view may shape the links its templates build (a
  Repositories button beside the GitHub profile, say) but adds no destination of its own:
  a definition that names no template still gives no link.
- **Third-party data arrives through our origin, on the item's own page only.** Pictures
  go through the image proxy like any other. A view that wants a site's API (GitHub's
  facts about an account, `services/github`) asks a same-origin path that nginx proxies
  and caches, the link-preview rule: one upstream call per item, readers never contact
  the site, and the site's rate limit is ours, not each reader's. Never during search or
  in a results card: those draw only from the item.
- **It shows readers the thing and admins the data.** The definition line, the agreement
  chip and the "More fields" fold stay, for admins. The rest of the list
  (`DListItemNeighbours`) stays for everyone.
- **One file per view**, with its own test, beside the registry. Result cards, popup rows
  and list rows stay tier two until a view earns a card of its own; a view may say how
  its items read there (`present`: a book is its cover, title and author), still from the
  item alone.
- **Tier two doesn't know of tier three.** No tier-two file imports `components/items/`
  or names a concept; tier three plugs in from above, in two places:
  - a DList item's own page: `components/items/ItemPage` (used by `EventScreen`) draws a
    view that applies, else `DListItemHero`;
  - DList item cards, rows and tiles: tier two's view (`useItemView`) leaves one generic
    override open (`PresentationOverrideContext`), and `components/items/TierThreeProvider`,
    at the app's root, fills it with the views' `present`.

  Take tier three out (`components/items/`, the provider at the root, `ItemPage` back to
  `DListItemHero`) and every DList item reads exactly as it did before, everywhere. Lint holds
  the line (`eslint.config.js`), and `CODING_STANDARDS.md` says what lint can't. (Until
  2026-10-13 `DListItemHero` chose the view itself and `useItemView` imported the views'
  `present`.)

## Consequences

- ADR 0004's "no concept has code of its own" now reads: no concept has code that reads
  past its definition. The data path is still the only path to the fields.
- The registry ADR 0004 removed is back, with a different contract: it hardcoded GitHub's
  link; this one may not.
- A new view is a config entry, a component, a test and an `applies` rule.
