# Three tiers of item rendering

**Status:** accepted, 2026-10-12. Amends [ADR 0004](0004-renderers-read-the-governing-concept.md).

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
  and `DListItemHero` falls back when it doesn't.
- **Links come from the definition.** A view may shape the links its templates build (a
  Repositories button beside the GitHub profile, say) but adds no destination of its own:
  a definition that names no template still gives no link.
- **It contacts no third party from the page.** Pictures go through the image proxy like
  any other; a view that wants live data from a site's API asks the server for it, later.
- **It shows readers the thing and admins the data.** The definition line, the agreement
  chip and the "More fields" fold stay, for admins. The rest of the list
  (`DListItemNeighbours`) stays for everyone.
- **One file per view**, with its own test, beside the registry. Result cards, popup rows
  and list rows stay tier two until a view earns a card of its own.

## Consequences

- ADR 0004's "no concept has code of its own" now reads: no concept has code that reads
  past its definition. The data path is still the only path to the fields.
- The registry ADR 0004 removed is back, with a different contract: it hardcoded GitHub's
  link; this one may not.
- A new view is a config entry, a component, a test and an `applies` rule.
