/**
 * Unified taggings — read-time normalization core (ADR event-tagging/0009).
 *
 * ONE tag universe across every tagging family member (profiles, notes, future
 * types) WITHOUT touching the protocol/wire/write. Every member's kind-39999
 * assertion is normalized to one tuple; the shared machinery (POV trust, honored
 * authority, `mine`, dedupe) then runs once over the normalized stream, and the
 * index/search/per-tag/per-target reads become views over it.
 *
 * Opinionated LOCAL aggregation only — this reads events that already exist; it
 * publishes nothing and constrains no other publisher (CLAUDE.md invariant #2).
 * Pure/dependency-free (the core purity guard covers it): the only imports are
 * sibling modules; no I/O, no wall-clock, no signing.
 *
 * A family MEMBER = { name, conceptZ(taPubkey), extractTag(assertion, ctx),
 *                     extractTarget(assertion) }. Adding a tagging type = register
 * one member; no new stack.
 */

function tagVal(ev, name) { const t = (ev.tags || []).find((x) => x[0] === name); return t ? t[1] : null; }
function zTags(ev) { return (ev.tags || []).filter((x) => x[0] === 'z').map((x) => x[1]); }

// polarity: absent defaults to 1 (applied); >=0.5 apply, <=-0.5 dispute, else neutral.
function readPolarity(ev) {
  const t = (ev.tags || []).find((x) => x[0] === 'polarity');
  if (!t || t[1] == null) return 1;
  const n = Number(t[1]);
  return Number.isFinite(n) ? n : 1;
}
function stanceOf(ev) {
  const p = readPolarity(ev);
  if (p >= 0.5) return 'apply';
  if (p <= -0.5) return 'dispute';
  return null; // neutral → not a stance
}

const COORD_RE = /^39999:([0-9a-f]{64}):(.+)$/;
const DESCRIPTOR_RE = /^39999:[0-9a-f]{64}:tagging:.+-tagging$/;
const HONORED_HEADER_Z_RE = /^39998:([0-9a-f]{64}):tagging-with-specific-tag$/;

// ── Built-in family members ────────────────────────────────────────────────

/** nostr-user-tag (profiles): direct `a` tag ref + `p` target. */
const nostrUserTagMember = {
  name: 'nostr-user-tag',
  conceptZ: (ta) => `39998:${ta}:nostr-user-tag`,
  extractTag: (ev) => {
    const a = (ev.tags || []).find((t) => t[0] === 'a' && COORD_RE.test(t[1] || ''));
    const m = a && COORD_RE.exec(a[1]);
    return m ? { authorPubkey: m[1], slug: m[2] } : null;
  },
  extractTarget: (ev) => {
    const p = tagVal(ev, 'p');
    return p ? { type: 'profile', ref: p } : null;
  },
  // NIP-51 projection (ADR 0015): a profile-tag pin snapshots into a follow set.
  projections: { profile: { listKind: 30000, elementTag: 'p' } },
};

/** nostr-event-tag (notes/addressables): `e`/`a` target + indirect tag ref via header. */
const nostrEventTagMember = {
  name: 'nostr-event-tag',
  conceptZ: (ta) => `39998:${ta}:nostr-event-tag`,
  extractTag: (ev, ctx) => {
    const desc = zTags(ev).find((z) => DESCRIPTOR_RE.test(z));
    if (!desc) return null;
    const header = ctx && ctx.headerByCoord && ctx.headerByCoord.get(desc);
    if (!header) return null; // header not resolvable → not countable here
    // header must join an honored tagging-with-specific-tag authority (legitimacy).
    const legit = (header.tags || []).some((t) => {
      if (t[0] !== 'z') return false;
      const mm = HONORED_HEADER_Z_RE.exec(t[1] || '');
      return mm && ctx.honored.has(mm[1]);
    });
    if (!legit) return null;
    const aTag = (header.tags || []).find((t) => t[0] === 'a');
    const am = aTag && COORD_RE.exec(aTag[1] || '');
    return am ? { authorPubkey: am[1], slug: am[2] } : null;
  },
  extractTarget: (ev) => {
    const e = tagVal(ev, 'e');
    if (e) return { type: 'event', ref: e };
    const a = tagVal(ev, 'a');
    if (a) return { type: 'address', ref: a };
    return null;
  },
  // NIP-51 projection (ADR 0015): a note-tag pin snapshots into a kind-30003
  // bookmark set (`e` for a plain note, `a` for an addressable target).
  projections: {
    event: { listKind: 30003, elementTag: 'e' },
    address: { listKind: 30003, elementTag: 'a' },
  },
};

const taggingMembers = [nostrUserTagMember, nostrEventTagMember];

// ── NIP-51 projection + note curation (ADR 0015) ─────────────────────────────

/**
 * Resolve a target type ('profile' | 'event' | 'address') to its NIP-51
 * projection `{ listKind, elementTag }` by scanning the registry members'
 * `projections`. The single source of truth for "how does target type X
 * materialize into a list": a new tagging member gets pinning by declaring its
 * projection, no new pin stack. Returns null for an unknown/unprojected type.
 */
function projectionFor(targetType, members = taggingMembers) {
  for (const m of members) {
    const proj = m.projections && m.projections[targetType];
    if (proj) return { listKind: proj.listKind, elementTag: proj.elementTag };
  }
  return null;
}

/**
 * Curate a note-tag's members for a pin snapshot (ADR 0015 decision 3). Pure —
 * returns a NEW ordered array, never mutates the input. Operates on the `for-tag`
 * note shape `{ id, applications, disputes, createdAt }` (counts are numbers).
 *
 *  - 'notes:net-endorsed' (default): the net-endorsed set (applications > disputes),
 *    recency-ordered — the Notes-tab curated default; mirrors the profile TL's
 *    endorsements>disputes cutoff.
 *  - 'notes:most-applied': every tagged note, ordered by application count desc
 *    (recency tiebreak) — contested notes kept.
 */
function curateNotes(notes = [], method = 'notes:net-endorsed', cutoff = 0) {
  const arr = Array.isArray(notes) ? notes.slice() : [];
  const app = (n) => n.applications || 0;
  const dis = (n) => n.disputes || 0;
  const rec = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
  // `cutoff` = minimum trusted applications, mirroring the profile rule
  // (`applyDisputesFunction`: applications >= cutoff AND applications > disputes).
  // Default 0 = no floor (back-compat); real pins pass their curation cutoff, so
  // e.g. a lone self-tagging (1 application) is excluded once cutoff ≥ 2.
  const min = Number.isFinite(cutoff) ? cutoff : 0;
  if (method === 'notes:most-applied') {
    return arr.filter((n) => app(n) >= min).sort((a, b) => (app(b) - app(a)) || rec(a, b));
  }
  // default: net-endorsed
  return arr.filter((n) => app(n) >= min && app(n) > dis(n)).sort(rec);
}

// ── Normalization ──────────────────────────────────────────────────────────

/**
 * Normalize a mixed set of kind-39999 tagging assertions to the unified tuple.
 * A candidate is a member instance if it carries that member's concept-`z` under
 * an honored authority; the member then extracts the tag identity + target from
 * its own wire shape. Neutral polarity and un-resolvable/illegitimate references
 * are dropped.
 *
 * @returns {Array<{ tag:{authorPubkey,slug}, target:{type,ref}, stance:'apply'|'dispute', asserter, eventId, createdAt }>}
 */
function normalizeTaggings({ assertions = [], headers = [], members = taggingMembers, honoredAuthorities = [] } = {}) {
  const honored = new Set(honoredAuthorities);
  const headerByCoord = new Map();
  for (const h of headers) {
    const d = tagVal(h, 'd');
    if (d) headerByCoord.set(`39999:${h.pubkey}:${d}`, h);
  }
  const ctx = { headerByCoord, honored };

  const out = [];
  for (const ev of assertions) {
    const zs = zTags(ev);
    const member = members.find((m) => honoredAuthorities.some((a) => zs.includes(m.conceptZ(a))));
    if (!member) continue; // no recognized member concept-z under an honored authority

    const tag = member.extractTag(ev, ctx);
    if (!tag) continue;
    const target = member.extractTarget(ev);
    if (!target) continue;
    const stance = stanceOf(ev);
    if (!stance) continue;

    out.push({ tag, target, stance, asserter: ev.pubkey, eventId: ev.id, createdAt: ev.created_at });
  }
  return out;
}

// ── Aggregation: tag index ───────────────────────────────────────────────────

/**
 * Group a normalized tagging stream BY TAG (coordinate `authorPubkey:slug`) — the
 * unified tag index. Counted totals apply the POV trust predicate; per-target-type
 * breakdown in `byType`; the viewer's own stance surfaces in `mine` regardless of
 * trust (Stories 7–9). Only tags with counted usage OR the viewer's own appear.
 *
 * @returns {{ rows: Array<{ tag:{authorPubkey,slug}, applications, disputes,
 *             byType: Object<string,{applications,disputes}>, mine:'apply'|'dispute'|null }> }}
 */
function indexByTag(taggings = [], { isAsserterTrusted, viewerPubkey } = {}) {
  const trusted = typeof isAsserterTrusted === 'function' ? isAsserterTrusted : () => true;
  const byTag = new Map();

  for (const tg of taggings) {
    const key = `${tg.tag.authorPubkey}:${tg.tag.slug}`;
    let row = byTag.get(key);
    if (!row) { row = { tag: { authorPubkey: tg.tag.authorPubkey, slug: tg.tag.slug }, applications: 0, disputes: 0, byType: {}, mine: null, _mineAt: -1 }; byTag.set(key, row); }

    // mine — the viewer's own stance on this tag (any target type), latest-wins.
    if (viewerPubkey && tg.asserter === viewerPubkey && tg.createdAt > row._mineAt) {
      row.mine = tg.stance;
      row._mineAt = tg.createdAt;
    }

    if (!trusted(tg.asserter)) continue; // counted totals: trusted asserters only
    const type = tg.target.type;
    if (!row.byType[type]) row.byType[type] = { applications: 0, disputes: 0 };
    if (tg.stance === 'apply') { row.applications += 1; row.byType[type].applications += 1; }
    else { row.disputes += 1; row.byType[type].disputes += 1; }
  }

  const rows = Array.from(byTag.values())
    .filter((r) => (r.applications + r.disputes) > 0 || r.mine) // drop tags with no counted usage and no own stance
    .map(({ _mineAt, ...r }) => r)
    .sort((a, b) => (b.applications - a.applications) || (b.disputes - a.disputes)); // combined usage first
  return { rows };
}

/** An asserter-scoped view over the normalized stream — the taggings authored by
 *  one pubkey (Story 11 / ADR 0010). Pure. */
function taggingsByAsserter(taggings = [], asserterPubkey) {
  if (!asserterPubkey) return [];
  return taggings.filter((tg) => tg.asserter === asserterPubkey);
}

export { taggingMembers, normalizeTaggings, indexByTag, taggingsByAsserter, projectionFor, curateNotes };
