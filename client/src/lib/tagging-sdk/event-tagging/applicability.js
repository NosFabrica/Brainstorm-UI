/**
 * Tag applicability — the portable "which tags are for events vs pubkeys" layer of the
 * event-tagging core (tag-applicability epic). Pure, dependency-free, framework-agnostic: a
 * third-party kind-1 tagging client can lift this to produce context data COMPATIBLE with the
 * reference deployment's.
 *
 * Two parts:
 *  1. The z-hint wire constants a newly-created tag-element carries to record its creation
 *     context. Human-readable, pubkey-free (lowest rung of the z-tag ladder) — do NOT compose
 *     from the TA pubkey. They are HINTS (author intent), never a gate; every existing reader
 *     treats a tag-element carrying them identically (they match no concept-handle pattern).
 *     `buildTagElement({ applicabilityZ })` / `applyEventTagging` emit the event hint; readers
 *     scan for them with `applicabilityHintFilter`.
 *  2. The derivation: a context's applicable tags = **HINT ∪ USAGE** — tags carrying that
 *     context's z-hint UNION tags observed applied to that context's targets. `deriveApplicabilityMembers`
 *     computes it purely from data the consumer already has (usage rows from `indexByTag`, plus a
 *     relay scan of hint tag-elements). This is the SAME union the reference deployment publishes
 *     as its kind-30394 Trusted Lists (addressable-member kind; protocols/drafts/trusted-lists.md),
 *     so a consumer computing it here stays compatible.
 */

const TAG_FOR_NOSTR_PUBKEY_Z = 'tag-for-nostr-pubkey';
const TAG_FOR_NOSTR_EVENT_Z = 'tag-for-nostr-event';

// Tag-elements (the tags themselves) are addressable kind-39999 events: 39999:<author>:<slug>.
const TAG_ELEMENT_KIND = 39999;

/** The z-hint literal for a target context. `context`: 'event' | 'pubkey'. */
function hintZForContext(context) {
  return context === 'pubkey' ? TAG_FOR_NOSTR_PUBKEY_Z : TAG_FOR_NOSTR_EVENT_Z;
}

/** The `byType` key a context's USAGE lives under in `indexByTag` rows ('event' | 'profile'). */
function byTypeKeyForContext(context) {
  return context === 'pubkey' ? 'profile' : 'event';
}

/**
 * The Nostr filter to scan for tag-elements carrying a context's z-hint (the HINT half's input).
 * @param {'event'|'pubkey'} context
 * @returns {{kinds:number[], '#z':string[]}}
 */
function applicabilityHintFilter(context) {
  return { kinds: [TAG_ELEMENT_KIND], '#z': [hintZForContext(context)] };
}

function aCoordFor(authorPubkey, slug) { return `${TAG_ELEMENT_KIND}:${authorPubkey}:${slug}`; }
function tagElementDTag(ev) { const t = (ev.tags || []).find((x) => x[0] === 'd'); return t ? t[1] : null; }

/**
 * Low-level union primitive. `type` is the `byType` KEY ('event' | 'profile'). Returns
 * `[{ a, applications }]` ordered by usage desc (hint-only, zero-usage, last). Kept for callers
 * that already speak the byType-key vocabulary; most consumers should use
 * `deriveApplicabilityMembers` (context-based, enriched output).
 */
function buildMembers(usageRows, hintEls, type) {
  const byCoord = new Map(); // aCoord → applications
  for (const r of usageRows || []) {
    const apps = r && r.byType && r.byType[type] && r.byType[type].applications;
    if (apps > 0) byCoord.set(aCoordFor(r.tag.authorPubkey, r.tag.slug), apps);
  }
  for (const el of hintEls || []) {
    const d = tagElementDTag(el);
    if (!el || !el.pubkey || !d) continue;
    const coord = aCoordFor(el.pubkey, d);
    if (!byCoord.has(coord)) byCoord.set(coord, 0); // hint-only → zero usage, listed last
  }
  return Array.from(byCoord.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([a, applications]) => ({ a, applications }));
}

const A_COORD_RE = /^39999:([0-9a-f]{64}):(.+)$/;

/**
 * Derive one context's applicability members = HINT ∪ USAGE, deduped by a-coordinate, ordered by
 * usage desc. Pure. THE public entry point for a third-party kind-1 client that wants context
 * data compatible with the reference deployment.
 *
 * Recipe: (a) read your taggings from relays and run `indexByTag(...)` → `usageRows`; (b) scan
 * relays with `applicabilityHintFilter(context)` → `hintEls`; (c) call this.
 *
 * @param {Object}  o
 * @param {Array}   o.usageRows  `indexByTag` rows: `{ tag:{authorPubkey,slug}, byType:{event?,profile?} }`
 * @param {Array}   o.hintEls    raw kind-39999 tag-elements carrying this context's hint z
 * @param {'event'|'pubkey'} o.context
 * @returns {[{ a:string, authorPubkey:string, slug:string, applications:number }]}
 */
function deriveApplicabilityMembers({ usageRows, hintEls, context } = {}) {
  return buildMembers(usageRows, hintEls, byTypeKeyForContext(context)).map((m) => {
    const mt = A_COORD_RE.exec(m.a);
    return { a: m.a, authorPubkey: mt ? mt[1] : null, slug: mt ? mt[2] : null, applications: m.applications };
  });
}

export {
  TAG_FOR_NOSTR_PUBKEY_Z,
  TAG_FOR_NOSTR_EVENT_Z,
  TAG_ELEMENT_KIND,
  hintZForContext,
  byTypeKeyForContext,
  applicabilityHintFilter,
  buildMembers,
  deriveApplicabilityMembers,
};
