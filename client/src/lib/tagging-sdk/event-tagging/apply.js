/**
 * Client publish orchestrator for the event-tagging core (Story 5).
 *
 * Story: engineering-team/stories/event-tagging/5-event-tagging-write-path.md
 * ADR:   engineering-team/decisions/event-tagging/0005-event-tagging-write-path.md
 *
 * `applyEventTagging` decides the 1/2/3-publish sequence, builds every event via
 * the pure core builders, signs them ALL, then publishes them in dependency order
 * stopping on the first failure. It is itself pure: signing, transport, header
 * discovery, and the clock are INJECTED as `deps = { findHeaders, sign, publish,
 * now }`, so it carries no `window`/`fetch`/`Date` and stays CJS-testable with
 * fakes (the core purity guard covers it). A thin UI hook supplies the real deps.
 *
 * Why sign-all-then-publish is safe: every reference is an ADDRESSABLE COORDINATE
 * (`kind:pubkey:slug`), derivable from author + slug up front — never a signed id.
 * So all events can be built and signed before any are published; cancelling a
 * signer prompt publishes nothing (a clean all-or-nothing abort). The only ordering
 * constraint is at PUBLISH time: tag-element → header → assertion.
 *
 * Dependency-free: the only imports are sibling modules in this folder.
 */

import { slug as toSlug } from './slug.js';
import { tagElementAddr, taggingHeaderAddr } from './handles.js';
import {
  buildTagElement,
  buildTaggingHeader,
  buildEventTaggingAssertion,
} from './builders.js';
import { TAG_FOR_NOSTR_EVENT_Z } from './applicability.js';

const HEX64 = /^[0-9a-f]{64}$/;

/** Title-case a slug for display names when only the slug is known (existing tag). */
function titleizeSlug(slug) {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Per-tag tagging-header display fields, matching the spec wording
// (protocols/drafts/event-taggings.md §"The per-tag tagging header").
function headerNames(displayName) {
  return [`Tagging of an event as ${displayName}`, `Taggings of events as ${displayName}`];
}
function headerDescription(displayName) {
  return `Applies the ${displayName} tag to an event.`;
}

/**
 * Deterministic choice among existing per-tag tagging headers (there may be
 * several, authored by different pubkeys). Prefer a header authored under the
 * canonical authority (`taPubkeys[0]`); otherwise tie-break by author ascending.
 * Documented + pure so the descriptor an assertion references is stable.
 *
 * @param {Array<{author:string}>} headers
 * @param {string[]} taPubkeys  [canonical, local] — canonical is taPubkeys[0].
 * @returns {{author:string}|null}
 */
function pickHeader(headers, taPubkeys) {
  if (!Array.isArray(headers)) return null;
  const valid = headers.filter((h) => h && typeof h.author === 'string' && HEX64.test(h.author));
  if (valid.length === 0) return null;
  const canonical = Array.isArray(taPubkeys) && taPubkeys.length ? taPubkeys[0] : null;
  if (canonical) {
    const underCanonical = valid.find((h) => h.author === canonical);
    if (underCanonical) return underCanonical;
  }
  return valid.slice().sort((a, b) => (a.author < b.author ? -1 : a.author > b.author ? 1 : 0))[0];
}

/** Read the `d` tag value of a built/unsigned event. */
function dTagValue(built) {
  const t = (built.tags || []).find((x) => x[0] === 'd');
  return t ? t[1] : '';
}

/**
 * Apply (or dispute) a tag on an event, creating whatever intermediate objects
 * are missing, in the correct order.
 *
 * @param {object}   args.tagInput   { name, description } (new tag) OR { authorPubkey, slug } (existing, picked).
 * @param {object}   args.target     { id } (kind-1 note → e) OR { address } (addressable → a).
 * @param {1|-1}     args.polarity   apply (+1) or dispute (-1).
 * @param {string}   args.asserterPubkey  current user (64-hex).
 * @param {string[]} args.taPubkeys  [canonical, local] concept namespaces — app-supplied.
 * @param {object}   args.deps       { findHeaders, sign, publish, now } — injected.
 * @returns {Promise<{ sequence:'a'|'b'|'c', published:Array<{kind,address,id}>, failedAt?:{kind,address,error} }>}
 */
async function applyEventTagging({ tagInput, target, polarity, asserterPubkey, taPubkeys, deps } = {}) {
  if (!deps || typeof deps.sign !== 'function' || typeof deps.publish !== 'function' || typeof deps.now !== 'function') {
    throw new Error('event-tagging: applyEventTagging requires deps { findHeaders, sign, publish, now }');
  }
  // Guard the asserter up front: it is required in every sequence and composes
  // signed coordinates. Fail before any discovery read (mirrors the builders).
  if (!HEX64.test(asserterPubkey || '')) {
    throw new Error(`event-tagging: asserterPubkey must be a 64-char lowercase hex pubkey (got: ${asserterPubkey})`);
  }

  // ── Resolve tag identity + sequence, building the plan (built+unsigned) ──
  // Each plan item: { unsigned, address }. Address is uniform: 39999:<pubkey>:<d>.
  const plan = [];
  const now = deps.now;
  const wrap = (built, pubkey) => {
    const unsigned = { ...built, pubkey, created_at: now() };
    plan.push({ unsigned, address: `39999:${pubkey}:${dTagValue(unsigned)}` });
  };

  let sequence;
  let slug;
  let headerAuthor; // the pubkey whose tagging header the assertion will reference

  if (tagInput && typeof tagInput.name === 'string' && tagInput.name.trim().length) {
    // (c) Brand-new tag → always 3 publishes. A new tag definitionally has no
    // header, so no discovery read. The asserter authors the tag + header.
    sequence = 'c';
    slug = toSlug(tagInput.name);
    headerAuthor = asserterPubkey;
    const displayName = tagInput.name;
    const description = tagInput.description || '';
    // This is the event-tagging (note) flow — the new tag is born tagging an event.
    wrap(buildTagElement({ name: tagInput.name, description, taPubkeys, applicabilityZ: TAG_FOR_NOSTR_EVENT_Z }), asserterPubkey);
    wrap(buildTaggingHeader({
      tagAuthorPubkey: asserterPubkey, slug, names: headerNames(displayName),
      description: headerDescription(displayName), taPubkeys,
    }), asserterPubkey);
  } else {
    // Existing, picked tag → discover whether a tagging header exists.
    const tagAuthor = tagInput && tagInput.authorPubkey;
    slug = tagInput && tagInput.slug;
    const displayName = titleizeSlug(slug || '');
    const headers = typeof deps.findHeaders === 'function'
      ? await deps.findHeaders({ tagAuthorPubkey: tagAuthor, slug })
      : [];
    const chosen = pickHeader(headers, taPubkeys);
    if (chosen) {
      // (a) Header exists → 1 publish (the assertion references the chosen header).
      sequence = 'a';
      headerAuthor = chosen.author;
    } else {
      // (b) Tag exists, no header → 2 publishes. The asserter mints the header
      // (its `a` references the tag-element authored by the tag author).
      sequence = 'b';
      headerAuthor = asserterPubkey;
      wrap(buildTaggingHeader({
        tagAuthorPubkey: tagAuthor, slug, names: headerNames(displayName),
        description: headerDescription(displayName), taPubkeys,
      }), asserterPubkey);
    }
  }

  // The assertion is always the last (most-dependent) event.
  wrap(buildEventTaggingAssertion({
    headerAuthorPubkey: headerAuthor, slug, target, polarity, asserterPubkey, taPubkeys,
  }), asserterPubkey);

  // ── Sign ALL (in order) before any publish. A signer rejection here throws
  //    and nothing is published (clean abort). ──
  const signed = [];
  for (const item of plan) {
    const s = await deps.sign(item.unsigned);
    signed.push({ ...item, signed: s });
  }

  // ── Publish in dependency order; stop on the first failure. Only reusable
  //    leftovers (orphan tag-element, or tag+header) can remain — never an
  //    assertion whose header did not land. ──
  const published = [];
  for (const item of signed) {
    try {
      await deps.publish(item.signed);
    } catch (err) {
      return {
        sequence,
        published,
        failedAt: { kind: item.signed.kind, address: item.address, error: err && err.message },
      };
    }
    published.push({ kind: item.signed.kind, address: item.address, id: item.signed.id });
  }

  return { sequence, published };
}

export { applyEventTagging, pickHeader };
