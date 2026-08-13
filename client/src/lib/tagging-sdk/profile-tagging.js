/**
 * Profile-tagging (nostr-user-tag) — pure builders + filters for applying tags
 * to PUBKEYS. The sibling of the event-tagging core (./event-tagging/), for the
 * older, DIRECT wire shape: a profile-tag assertion references its tag-element
 * straight through an `a` coordinate — there is NO per-tag header indirection
 * (that indirection exists only in the event-tagging family).
 *
 * Wire shape (reference: publishProfileTagAssertion in the Tapestry repo,
 * ADR-0001 + ADR-0022 hybrid e+a + the W11 dual-z federation rule):
 *
 *   kind 39999
 *   ["d",  "profile-tag-<slug>-<target8>-<asserter8>"]   deterministic → replaceable, latest-wins
 *   ["p",  <targetPubkey>]                               who is being tagged
 *   ["a",  "39999:<tagAuthor>:<slug>"]                   stable tag identity (consume by #a)
 *   ["e",  <tagElementEventId>]                          applied-version provenance
 *   ["z",  "39998:<pk>:nostr-user-tag"]  × N             concept handles — one per namespace
 *   ["polarity", "1" | "-1"]                             apply / dispute
 *   content: {"nostrUserTag":{taggedPubkey,tagEventId,tagAddress}}
 *
 * IMPORTANT — the legacy namespace: on the reference deployments the
 * `nostr-user-tag` and `tag` concept handles are intentionally bound to a
 * LEGACY canonical pubkey (see CONFIG.json `canonicalConceptPubkey`, Tapestry
 * ADR-0015) so historical tags stay visible across instances. Pass
 * `zHandlePubkeys = [canonical, localTa]` from config — the SDK composes one z
 * per namespace, exactly like the event-tagging builders' `taPubkeys`.
 *
 * Pure and dependency-free: builders return UNSIGNED partial events (no
 * `pubkey`/`created_at` except where the d-tag needs the asserter — supplied
 * as a parameter); no I/O, no signing, no clock.
 */

const HEX64 = /^[0-9a-f]{64}$/;

function requireHex64(value, label) {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    throw new Error(`profile-tagging: ${label} must be a 64-char lowercase hex pubkey (got: ${value})`);
  }
}

/** Concept handle for the nostr-user-tag namespace under one pubkey. */
export function conceptNostrUserTag(pk) {
  return `39998:${pk}:nostr-user-tag`;
}

/** One ['z', handle] per namespace pubkey, validated + deduped, order kept. */
function conceptZTags(zHandlePubkeys) {
  if (!Array.isArray(zHandlePubkeys) || zHandlePubkeys.length === 0) {
    throw new Error('profile-tagging: zHandlePubkeys must be a non-empty array (concept namespaces to join)');
  }
  const seen = new Set();
  const out = [];
  for (const pk of zHandlePubkeys) {
    requireHex64(pk, 'zHandlePubkeys[] entry');
    const handle = conceptNostrUserTag(pk);
    if (!seen.has(handle)) { seen.add(handle); out.push(['z', handle]); }
  }
  return out;
}

/**
 * Build an UNSIGNED profile-tag assertion (apply or dispute a tag on a pubkey).
 *
 * @param {object} args.tag        { authorPubkey, slug, eventId } — the tag-element
 *   being applied. `eventId` is the tag-element's signed event id (provenance `e`);
 *   when minting a brand-new tag, sign the tag-element FIRST and pass its id here.
 * @param {string} args.targetPubkey   64-hex pubkey being tagged.
 * @param {1|-1}   args.polarity       +1 apply, -1 dispute.
 * @param {string} args.asserterPubkey 64-hex current user (forms the d-tag identity).
 * @param {string[]} args.zHandlePubkeys  namespace pubkeys, typically [canonical, localTa].
 * @returns {{kind:number, tags:string[][], content:string}} unsigned partial event
 *   (caller adds pubkey + created_at at sign time).
 */
export function buildProfileTagAssertion({ tag, targetPubkey, polarity, asserterPubkey, zHandlePubkeys }) {
  if (!tag || !HEX64.test(tag.authorPubkey || '')) {
    throw new Error('profile-tagging: tag.authorPubkey (the tag-element author) is missing or malformed.');
  }
  if (typeof tag.slug !== 'string' || !tag.slug.length) {
    throw new Error('profile-tagging: tag.slug is required.');
  }
  requireHex64(targetPubkey, 'targetPubkey');
  requireHex64(asserterPubkey, 'asserterPubkey');
  const p = Number(polarity);
  if (p !== 1 && p !== -1) {
    throw new Error(`profile-tagging: polarity must be 1 (apply) or -1 (dispute), got: ${polarity}`);
  }

  const dTag = `profile-tag-${tag.slug}-${targetPubkey.slice(0, 8)}-${asserterPubkey.slice(0, 8)}`;
  const tagAddress = `39999:${tag.authorPubkey}:${tag.slug}`;
  const tags = [
    ['d', dTag],
    ['p', targetPubkey],
    ['a', tagAddress],
  ];
  // Provenance e (hybrid e+a, ADR-0022): included when the caller knows the
  // tag-element's event id. Readers consume identity by #a; e is retained history.
  if (typeof tag.eventId === 'string' && tag.eventId.length) tags.push(['e', tag.eventId]);
  tags.push(...conceptZTags(zHandlePubkeys));
  tags.push(['polarity', String(p)]);

  return {
    kind: 39999,
    tags,
    content: JSON.stringify({
      nostrUserTag: { taggedPubkey: targetPubkey, tagEventId: tag.eventId || null, tagAddress },
    }),
  };
}

// ── Discovery filters (plain Nostr filter objects; results are CANDIDATES —
//    whether an assertion counts is a read-time trust decision, see trust.js) ──

/** All profile-tag assertions on a given pubkey (the profile-page read). */
export function filterTagsAppliedToPubkey({ targetPubkey, zHandlePubkeys }) {
  requireHex64(targetPubkey, 'targetPubkey');
  return {
    kinds: [39999],
    '#p': [targetPubkey],
    '#z': zHandlePubkeys.map(conceptNostrUserTag),
  };
}

/** All profile-tag assertions USING a given tag (the tag-page profiles read). */
export function filterProfileTaggingsUsingTag({ tagAuthorPubkey, slug, zHandlePubkeys }) {
  requireHex64(tagAuthorPubkey, 'tagAuthorPubkey');
  return {
    kinds: [39999],
    '#a': [`39999:${tagAuthorPubkey}:${slug}`],
    '#z': zHandlePubkeys.map(conceptNostrUserTag),
  };
}

/** All tag-elements (the tags themselves), for discovery / the tag picker. */
export function filterTagElements({ zHandlePubkeys }) {
  return {
    kinds: [39999],
    '#z': zHandlePubkeys.map((pk) => `39998:${pk}:tag`),
  };
}

/**
 * Orchestrator: apply (or dispute) a tag on a PUBKEY, minting the tag-element
 * first when the tag is brand new. Mirrors `applyEventTagging` (event-tagging
 * core) but with the simpler direct shape — at most 2 publishes:
 *
 *   (a) existing tag  → 1 publish  (the assertion)
 *   (b) brand-new tag → 2 publishes (tag-element, then the assertion)
 *
 * Sign-all-then-publish is NOT possible here when minting (the assertion's
 * provenance `e` needs the tag-element's signed id), so sequence (b) signs and
 * publishes the tag-element first; a signer rejection before the assertion
 * leaves only a reusable orphan tag-element — never a dangling assertion.
 *
 * @param {object} args.tagInput  { name, description } (new) OR
 *                                { authorPubkey, slug, eventId? } (existing).
 * @param {string} args.targetPubkey
 * @param {1|-1}   args.polarity
 * @param {string} args.asserterPubkey
 * @param {string[]} args.zHandlePubkeys  [canonical, localTa] — for BOTH the
 *   tag-element's `tag` concept-z and the assertion's `nostr-user-tag` z.
 * @param {object} args.deps  { sign, publish, now, buildTagElement } — inject the
 *   event-tagging core's buildTagElement (plus TAG_FOR_NOSTR_PUBKEY_Z as
 *   applicabilityZ) to mint new tags; sign/publish/now as in applyEventTagging.
 */
export async function applyProfileTagging({ tagInput, targetPubkey, polarity, asserterPubkey, zHandlePubkeys, deps } = {}) {
  if (!deps || typeof deps.sign !== 'function' || typeof deps.publish !== 'function' || typeof deps.now !== 'function') {
    throw new Error('profile-tagging: applyProfileTagging requires deps { sign, publish, now, buildTagElement }');
  }
  requireHex64(asserterPubkey, 'asserterPubkey');

  let tag; // { authorPubkey, slug, eventId }
  const published = [];

  if (tagInput && typeof tagInput.name === 'string' && tagInput.name.trim().length) {
    // (b) brand-new tag: mint the tag-element (born tagging a pubkey → the
    // 'tag-for-nostr-pubkey' applicability hint), publish it, keep its id.
    if (typeof deps.buildTagElement !== 'function') {
      throw new Error('profile-tagging: deps.buildTagElement is required to mint a new tag');
    }
    const builtEl = deps.buildTagElement({
      name: tagInput.name,
      description: tagInput.description || '',
      taPubkeys: zHandlePubkeys,
      applicabilityZ: 'tag-for-nostr-pubkey',
    });
    const unsignedEl = { ...builtEl, pubkey: asserterPubkey, created_at: deps.now() };
    const signedEl = await deps.sign(unsignedEl);
    try {
      await deps.publish(signedEl);
    } catch (err) {
      return { published, failedAt: { kind: 39999, what: 'tag-element', error: err && err.message } };
    }
    const dT = (builtEl.tags.find((t) => t[0] === 'd') || [])[1];
    published.push({ kind: 39999, address: `39999:${asserterPubkey}:${dT}`, id: signedEl.id });
    tag = { authorPubkey: asserterPubkey, slug: dT, eventId: signedEl.id };
  } else {
    // (a) existing tag, picked from discovery.
    tag = { authorPubkey: tagInput.authorPubkey, slug: tagInput.slug, eventId: tagInput.eventId };
  }

  // Build + sign + publish the assertion. Failure handling depends on whether
  // anything is already on the wire: with NOTHING published yet (existing-tag
  // path), a sign rejection throws — a clean all-or-nothing abort, matching
  // applyEventTagging. AFTER the tag-element has published, errors return
  // `{ published, failedAt }` so the caller can report the partial result (a
  // reusable orphan tag-element) instead of losing it to a throw.
  let signed;
  let built;
  try {
    built = buildProfileTagAssertion({ tag, targetPubkey, polarity, asserterPubkey, zHandlePubkeys });
    const unsigned = { ...built, pubkey: asserterPubkey, created_at: deps.now() };
    signed = await deps.sign(unsigned);
  } catch (err) {
    if (published.length === 0) throw err;
    return { published, failedAt: { kind: 39999, what: 'assertion', error: err && err.message } };
  }
  try {
    await deps.publish(signed);
  } catch (err) {
    return { published, failedAt: { kind: 39999, what: 'assertion', error: err && err.message } };
  }
  const dT = (built.tags.find((t) => t[0] === 'd') || [])[1];
  published.push({ kind: 39999, address: `39999:${asserterPubkey}:${dT}`, id: signed.id });
  return { published };
}
