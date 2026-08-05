/**
 * Concept-handle and addressable-coordinate composers for the event-tagging core.
 *
 * Every composer takes the runtime Tapestry-Assistant pubkey (`taPubkey`) and/or
 * author pubkeys as PARAMETERS — nothing is hardcoded (CLAUDE.md "Per-deployment
 * TA pubkey — NEVER hardcode"). Pure string composition; no imports, no I/O.
 */

// Firmware DList concept addresses (kind-39998 headers), keyed by the deployment TA.
function conceptTag(taPubkey) {
  return `39998:${taPubkey}:tag`;
}
function conceptNostrEventTag(taPubkey) {
  return `39998:${taPubkey}:nostr-event-tag`;
}
function conceptTaggingWithSpecificTag(taPubkey) {
  return `39998:${taPubkey}:tagging-with-specific-tag`;
}

// Addressable coordinates of user-authored kind-39999 events.
//   tagElementAddr   — the tag-element (descriptor) itself: 39999:<author>:<slug>
//   taggingHeaderAddr — the per-tag "tagging-with-specific-tag" header:
//                       39999:<author>:tagging:<slug>-tagging
function tagElementAddr(authorPubkey, slug) {
  return `39999:${authorPubkey}:${slug}`;
}
function taggingHeaderAddr(authorPubkey, slug) {
  return `39999:${authorPubkey}:tagging:${slug}-tagging`;
}

export {
  conceptTag,
  conceptNostrEventTag,
  conceptTaggingWithSpecificTag,
  tagElementAddr,
  taggingHeaderAddr,
};
