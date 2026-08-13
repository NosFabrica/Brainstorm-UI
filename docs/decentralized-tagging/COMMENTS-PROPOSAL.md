# Comments on tags (not on taggings)

**Status: BUILT on the tag page, anchor still worth ratifying.** For Vinny / the
kit owners. Written 2026-08-05 from the Brainstorm-UI integration; updated the
same day when Benjamin asked for comments to ship rather than wait.

We built option A below (comment on the tag-element). The open questions in
"What we'd need from the kit" still stand — if the kit lands on a different
anchor we'd rather change now than after other clients copy us.

**One thing we learned by building it:** the tag hub refuses kind-1111
outright — `blocked: not a supported Decentralized Lists event kind` — so
comments live on general relays while the tag lives on the hub. See
KIT-FEEDBACK.md §6.

The tagging protocol has no comment layer — nothing in `protocol/tags.md`,
`event-taggings.md` or `trusted-lists.md`. Before any client invents one, it's
worth agreeing where a comment attaches, because the two candidate anchors have
very different consequences and clients that pick differently won't interoperate.

## The ask

Our team wants people to be able to discuss tags and leave feedback. Concretely:
*"what does Bitcoin Vendor actually mean — does it require accepting BTC in
person, or is online enough?"*

## The two anchors

A comment would be a standard NIP-22 kind-1111, referencing either:

**A. The tag-element** — `a` = `39999:<tagAuthor>:<slug>`.
A discussion of what the tag means. One thread per tag, shared by everyone.

**B. A specific tagging** — `e` = the kind-39999 assertion's id.
A discussion of whether *this person* belongs in *this tag*.

## Recommendation: A, the tag-element

**Where the ambiguity actually is.** Most disagreement about "is Avi an Author"
is really disagreement about what Author means. Settle the definition and the
individual taggings resolve themselves. Polarity already expresses per-person
disagreement without prose.

**B is a moderation programme wearing a feature's clothes.** Threaded commentary
attached to a named individual — *"here's why I think Bob is a scammer"* — is
unmoderated speech about a real person, on a page they don't control, and today
it would land while the trust filter is effectively inert (see
`KIT-FEEDBACK.md` §1 — every scored asserter is currently rejected and every
unscored one counted, so there is no filtering in practice). The subject can
dispute the tag; they cannot delete a comment about themselves. Whoever ships B
first inherits reports, appeals and takedowns.

**A is cheap and portable.** Any NIP-22 client renders it; nothing bespoke.

## What we'd need from the kit

1. **A decision on the anchor**, so clients converge. If B is wanted eventually,
   it should arrive with a moderation story, not before one.
2. **Whether comments count toward applicability or ranking.** Our instinct is
   no — a comment is discussion, not attestation. But "most discussed" is an
   obvious sort for a tag directory and it would be good to agree whether that's
   sanctioned or a client-local nicety.
3. **Whether the tag author has any special standing** in their tag's thread —
   pinning, or a canonical clarification that readers should surface above
   replies. The author already owns the `description` field, so possibly not.

## What it would cost us to build

Small, which is why we want the anchor settled rather than guessed:

- Reading is nearly free — `EventThread.tsx` already queries kind-1111 by
  `#e`/`#E`/`#a`/`#A` for notes and articles.
- Writing is the real step: **Brainstorm has never published user-authored
  text.** No kind-1, no kind-1111 anywhere in the publish path. Comments would
  be the app's first free-text surface, which brings spam, abuse reporting and
  moderation questions that tagging alone doesn't.

That asymmetry is the reason this is a proposal and not a pull request.
