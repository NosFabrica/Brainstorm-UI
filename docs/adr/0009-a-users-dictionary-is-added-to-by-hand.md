# A User's Dictionary is added to by hand, by their local Assistant or by themselves

**Status:** proposed, 2026-10-27, for Loom's K2.6, "Decide how a User's Dictionary is stored" (decider: David).
Amends [ADR 0004](0004-renderers-read-the-governing-concept.md), which says a user's Brainstorm Assistant authors
their copies.

A concept is in someone's Dictionary when they hold a **local copy** of it: a kind-39998 header of their own at the
community header's `d`, pointing back with `["b", <community coordinate>, "pointer"]` (CONTEXT.md).

Brainstorm has read Dictionaries that way since ADR 0004: the governing chain, and Settings › Dictionary's "Added by
your Assistant". But nothing writes an Assistant's copies. The admin route asked for on 2026-10-01
([docs/dictionary/ADMIN-ASKS.md](../dictionary/ADMIN-ASKS.md)) was never built: neither staging's nor production's
route list had it on 2026-10-27.

## The decision

- **By hand, by the reader.** A Dictionary entry offers "Add to my Dictionary", with one line for the Dictionary the
  reader's Brainstorm Assistant keeps (the preferred one) and one for their own. No usage rule adds a concept yet.
- **Two fixed keepers.** "The Assistant" is always the one Brainstorm hosts for the reader (`ta_pubkey`), whatever
  their Treasure Map gives the Concepts duty to. It is the copy item pages and search read after the reader's own
  (`hooks/useItemConcept`). The reader's own copy outranks it, as ADR 0004 says.
- **An exact copy.** Adding copies the community header's definition tags verbatim (`exactCopyTemplate` and
  `COPIED_TAGS` in `lib/conceptCopy`), with a `pointer` `b`. It is not an inherit-typed pointer, and not a definition
  re-derived from a form. The reader can then edit their own copy; nobody edits the Assistant's.
- **NosFabrica holds the Assistant's key.** Only the server can sign the Assistant's copy, so its button calls
  `POST /user/assistantDictionary` ([docs/dictionary/ASSISTANT-COPY-ASK.md](../dictionary/ASSISTANT-COPY-ASK.md)).
  Until the server has the route, the button says so.
- **Removing is withdrawing.** Either keeper republishes its copy with `["b", "b-tag-deferred"]` in place of the
  pointer. A copy is never removed with a NIP-09 deletion; `lib/conceptCopy` says why.

## Consequences

- The Dictionary page's default "Managed by" view follows the Treasure Map's Concepts duty (`lib/managedDictionary`).
  Item pages follow the local Assistant. A reader whose Map names another Assistant can add a concept to the local
  Assistant's Dictionary and still see the other Assistant's Dictionary by default.
- The Assistant's copy changes only when the reader presses Add again. Nothing keeps it in step with the community
  header.
- House copies are unchanged. They remain Brainstorm's own definitions, the fallback for a reader with no copy.

## Left open (K2.6)

- Whether a usage rule should add concepts too.
- Whether adding a concept counts as a vote. Tapestry's copies are pointer-typed; its Shared Concepts draft gives
  them no weight, while its Dictionary design counts them.
- Which of several Assistants governs, when the Treasure Map gives Concepts to an Assistant other than the local
  one.
- Whether the house becomes one more reader, whose Assistant's copies are the default.
