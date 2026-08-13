/**
 * Discovery-filter builders for the event-tagging core.
 *
 * Each returns a plain Nostr filter object. IMPORTANT: results of these filters
 * are CANDIDATES, not truth — whether a returned tagging "counts" is a read-time,
 * per-POV trust computation (see protocols/drafts/event-taggings.md and CLAUDE.md
 * invariants #1/#3). Pure composition; no imports outside this folder, no I/O.
 */

import {
  conceptTaggingWithSpecificTag,
  tagElementAddr,
  taggingHeaderAddr,
} from './handles.js';

/** All taggings that apply a given tag (forward discovery): #z over the header coord. */
function filterTaggingsUsingTag({ headerAuthorPubkey, slug }) {
  return {
    kinds: [39999],
    '#z': [taggingHeaderAddr(headerAuthorPubkey, slug)],
  };
}

/**
 * All taggings whose target is a given event (reverse candidates).
 * `{ id }` → #e (non-addressable, e.g. a kind-1 note); `{ address }` → #a.
 */
function filterTagsAppliedToEvent({ target }) {
  if (target && typeof target.id === 'string') {
    return { kinds: [39999], '#e': [target.id] };
  }
  if (target && typeof target.address === 'string') {
    return { kinds: [39999], '#a': [target.address] };
  }
  throw new Error('event-tagging: target must be { id } (event id) or { address } (a-coordinate)');
}

/**
 * The per-tag "tagging-with-specific-tag" headers that exist for a tag — i.e. is
 * the tag event-taggable yet, and by whom. Headers are kind-39999 items on the
 * tagging-with-specific-tag list whose `a` points at the tag-element.
 */
function filterTaggingHeadersForTag({ tagAuthorPubkey, slug, taPubkey }) {
  return {
    kinds: [39999],
    '#a': [tagElementAddr(tagAuthorPubkey, slug)],
    '#z': [conceptTaggingWithSpecificTag(taPubkey)],
  };
}

export {
  filterTaggingsUsingTag,
  filterTagsAppliedToEvent,
  filterTaggingHeadersForTag,
};
