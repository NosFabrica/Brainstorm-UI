/**
 * Unsigned-event builders for the event-tagging core (David's indirect
 * per-tag-header protocol — see protocols/drafts/event-taggings.md).
 *
 * Each builder returns a PARTIAL unsigned event `{ kind, tags, content }`.
 * It deliberately does NOT set `pubkey` or `created_at` — the caller/signer
 * adds those at sign time. This keeps the core pure and deterministic (no
 * wall-clock time), so output is a function of its inputs alone. No I/O, no signing.
 *
 * FEDERATION (parameterized, never hardcoded): the TA-rooted concept `z`-tags
 * accept a LIST of namespaces — `taPubkeys`. The builder emits one concept `z`
 * per pubkey (deduped, order preserved). A deployment federating with a shared
 * canonical namespace passes `[<canonical>, <own>]` (dual-z); a deployment going
 * it alone passes `[<own>]` (its own island). The canonical pubkey is a caller
 * policy decision — this generic core embeds NO deployment identity.
 *
 * Dependency-free: the only imports are sibling modules in this folder.
 */

import { slug as toSlug } from './slug.js';
import {
  conceptTag,
  conceptNostrEventTag,
  conceptTaggingWithSpecificTag,
  tagElementAddr,
  taggingHeaderAddr,
} from './handles.js';

const HEX64 = /^[0-9a-f]{64}$/;

function requireHex64(value, label) {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw new Error(`event-tagging: ${label} must be a 64-char lowercase hex pubkey (got: ${value})`);
  }
}

/**
 * Compose the concept `z`-tags for a namespace list: one `['z', conceptFn(pk)]`
 * per pubkey, validated and deduped (order preserved). The caller decides the
 * list — typically `[canonical, local]` to federate, or `[local]` to splinter.
 * Each entry is validated (fail loud): a malformed TA pubkey would compose an
 * undiscoverable concept handle. Callers that want a "non-fatal, omit a missing
 * local TA" policy filter their list BEFORE calling — the core takes a clean list.
 */
function conceptZTags(taPubkeys, conceptFn, label) {
  if (!Array.isArray(taPubkeys) || taPubkeys.length === 0) {
    throw new Error(`event-tagging: ${label} must be a non-empty array of TA pubkeys (the concept namespaces to join)`);
  }
  const seen = new Set();
  const out = [];
  for (const pk of taPubkeys) {
    requireHex64(pk, `${label}[] entry`);
    const handle = conceptFn(pk);
    if (!seen.has(handle)) { seen.add(handle); out.push(['z', handle]); }
  }
  return out;
}

/**
 * Build a tag-element (the descriptor). Joins the `tag` concept namespace(s).
 * `d` is the slug of the name — the SAME shape the existing tag concept uses
 * (39999:<author>:<slug>), so event-taggings reference real tag-elements.
 *
 * @param {string[]} taPubkeys  concept namespaces to join (e.g. [canonical, local]).
 * @param {string} [applicabilityZ]  optional pubkey-free tag-type hint z appended
 *   additively AFTER the concept-z (tag-applicability Story 1). Omit ⇒ no hint.
 */
function buildTagElement({ name, description, taPubkeys, applicabilityZ }) {
  const slug = toSlug(name);
  const tags = [
    ['d', slug],
    ...conceptZTags(taPubkeys, conceptTag, 'taPubkeys'),
  ];
  if (applicabilityZ) tags.push(['z', applicabilityZ]);
  return {
    kind: 39999,
    tags,
    content: JSON.stringify({ tag: { slug, name, description: description || '' } }),
  };
}

/**
 * Build a per-tag "tagging-with-specific-tag" header. Simultaneously a DList
 * header (names/description/d) and a DList item (z + a) — exactly per the spec.
 *
 * @param {string}   tagAuthorPubkey  64-hex author of the tag-element this header is for.
 * @param {string}   slug             the resolved tag-element's slug (NOT re-slugged here).
 * @param {string[]} names            display names, e.g. [singular, plural]; spread into the `names` tag.
 * @param {string}   description
 * @param {string[]} taPubkeys        concept namespaces to join (e.g. [canonical, local]).
 */
function buildTaggingHeader({ tagAuthorPubkey, slug, names, description, taPubkeys }) {
  // tagAuthorPubkey composes the `a` coordinate (39999:<author>:<slug>). A
  // malformed value silently yields an undiscoverable header, so fail loud here
  // rather than mint an orphan (mirrors publishProfileTag.js:54).
  requireHex64(tagAuthorPubkey, 'tagAuthorPubkey');
  return {
    kind: 39999,
    tags: [
      ['d', `tagging:${slug}-tagging`],
      ['names', ...names],
      ['description', description],
      ...conceptZTags(taPubkeys, conceptTaggingWithSpecificTag, 'taPubkeys'),
      ['a', tagElementAddr(tagAuthorPubkey, slug)],
    ],
    content: '',
  };
}

/**
 * Build an event-tagging assertion (apply/dispute a tag on an event).
 *
 * @param {string}   headerAuthorPubkey  64-hex author of the per-tag tagging header.
 * @param target  { id } for a non-addressable event (e.g. a kind-1 note → `e`),
 *                or { address } for an addressable target (a-coordinate → `a`).
 *                If both are supplied, `id` takes precedence.
 * @param polarity 1 (apply) or -1 (dispute).
 * @param {string}   asserterPubkey  64-hex asserting pubkey (forms the d-tag identity).
 * @param {string[]} taPubkeys       concept namespaces to join (e.g. [canonical, local]).
 */
function buildEventTaggingAssertion({ headerAuthorPubkey, slug, target, polarity, asserterPubkey, taPubkeys }) {
  // Both pubkeys end up as permanent, signed, published coordinates: asserterPubkey
  // into the deterministic d-tag (replaceability key), headerAuthorPubkey into the
  // descriptor z-coordinate (39999:<author>:tagging:<slug>-tagging). A malformed
  // either one mints an orphan event signed with the user's real key, so fail loud
  // (mirrors publishProfileTag.js:54). taPubkeys entries are validated in conceptZTags.
  requireHex64(asserterPubkey, 'asserterPubkey');
  requireHex64(headerAuthorPubkey, 'headerAuthorPubkey');

  const p = Number(polarity);
  if (p !== 1 && p !== -1) {
    throw new Error(`event-tagging: polarity must be 1 (apply) or -1 (dispute), got: ${polarity}`);
  }

  let targetTag;
  let target8;
  if (target && typeof target.id === 'string') {
    targetTag = ['e', target.id];
    // NIP-01 relay hint — lets read paths fetch an EXTERNAL target note on-demand
    // (view-time) from where it actually lives, instead of persisting other
    // people's notes into the local relay. Emitted only when the caller supplies
    // one (e.g. the "+ Tag a Note" modal forwards the pasted nevent's hints).
    const hint = Array.isArray(target.relays)
      ? target.relays.find((r) => typeof r === 'string' && /^wss?:\/\//.test(r))
      : null;
    if (hint) targetTag.push(hint);
    target8 = target.id.slice(0, 8);
  } else if (target && typeof target.address === 'string') {
    targetTag = ['a', target.address];
    target8 = (target.address.split(':')[1] || '').slice(0, 8); // the coord's author-pubkey segment
  } else {
    throw new Error('event-tagging: target must be { id } (event id) or { address } (a-coordinate)');
  }

  const dTag = `event-tag-${slug}-${target8}-${asserterPubkey.slice(0, 8)}`;

  return {
    kind: 39999,
    tags: [
      ['d', dTag],
      targetTag,
      ...conceptZTags(taPubkeys, conceptNostrEventTag, 'taPubkeys'),
      ['z', taggingHeaderAddr(headerAuthorPubkey, slug)],
      ['polarity', String(p)],
    ],
    content: '',
  };
}

export {
  buildTagElement,
  buildTaggingHeader,
  buildEventTaggingAssertion,
};
