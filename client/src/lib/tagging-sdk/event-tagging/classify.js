/**
 * Read-side classifier for the event-tagging core (the complement to the
 * discovery-filter builders). Pure and dependency-free: given already-fetched
 * candidate assertions + resolved tagging headers + the authority set the reader
 * honors + a trust predicate, it groups the taggings that COUNT and surfaces the
 * ones it cannot verify. No I/O — the caller does the scanning/trust scoring.
 *
 * Sovereignty: `honoredAuthorities` is the reader's parameter. A candidate is
 * counted only if its descriptor header joins a `tagging-with-specific-tag`
 * namespace the reader honors; the candidate scan that produced `candidates`
 * keys on the target and is namespace-agnostic, so a divergent publisher's
 * taggings are always *present* — only whether they *count* depends on the set.
 */

const DESCRIPTOR_RE = /^39999:[0-9a-f]{64}:tagging:.+-tagging$/;
const HONORED_Z_RE = /^39998:([0-9a-f]{64}):tagging-with-specific-tag$/;
const TAG_A_RE = /^39999:([0-9a-f]{64}):(.+)$/;

function tagVal(event, name) {
  const t = (event.tags || []).find((x) => x[0] === name);
  return t ? t[1] : null;
}

// polarity: from the ['polarity', ...] tag; absent defaults to 1 (applied).
function readPolarity(event) {
  const t = (event.tags || []).find((x) => x[0] === 'polarity');
  if (!t || t[1] == null) return 1;
  const n = Number(t[1]);
  return Number.isFinite(n) ? n : 1;
}

// >= 0.5 → apply, <= -0.5 → dispute, between → neutral (dropped).
function bucketize(polarity) {
  if (polarity >= 0.5) return 'apply';
  if (polarity <= -0.5) return 'dispute';
  return 'neutral';
}

/**
 * @param {object} args
 * @param {object[]} args.candidates         kind-39999 events that #e/#a the target (deduped scan).
 * @param {object[]} args.headers            resolved per-tag tagging header events (whatever the caller fetched).
 * @param {string[]} args.honoredAuthorities TA pubkeys whose tagging-with-specific-tag namespace is honored.
 * @param {(pubkey:string)=>boolean} args.isAsserterTrusted  POV trust predicate (default: trust all).
 * @param {string} [args.viewerPubkey]  the logged-in viewer. When set, their OWN
 *   legitimate stance is surfaced in `mine` regardless of trust (the counted `tags`
 *   are unaffected) — see ADR event-tagging/0007. Absent → `mine: []`.
 * @returns {{ tags: Array<{tag:{authorPubkey:string,slug:string}, applications:object[], disputes:object[]}>,
 *             unverifiable: Array<{eventId,authorPubkey,descriptor,createdAt}>,
 *             mine: Array<{tag:{authorPubkey:string,slug:string}, stance:'apply'|'dispute', eventId:string, createdAt:number}> }}
 *
 * NOTE on latest-wins: `mine` reflects the single (deduped) latest candidate per
 * (tag, target, viewer). The apply↔dispute collapse is done UPSTREAM by the caller's
 * dedupe (an assertion's d-tag is deterministic per (slug, target, asserter)); this
 * function reflects whichever single candidate survives.
 */
function classifyEventTaggings({ candidates = [], headers = [], honoredAuthorities = [], isAsserterTrusted, viewerPubkey } = {}) {
  const trusted = typeof isAsserterTrusted === 'function' ? isAsserterTrusted : () => true;
  const honored = new Set(honoredAuthorities);

  // Index headers by their addressable coordinate: 39999:<pubkey>:<d-tag>.
  const headerByCoord = new Map();
  for (const h of headers) {
    const d = tagVal(h, 'd');
    if (d) headerByCoord.set(`39999:${h.pubkey}:${d}`, h);
  }

  const tagsMap = new Map(); // `${tagAuthor}|${slug}` -> { tag, applications, disputes }
  const mineMap = new Map(); // `${tagAuthor}|${slug}` -> { tag, stance, eventId, createdAt }  (viewer's own, latest)
  const unverifiable = [];

  for (const c of candidates) {
    const descTag = (c.tags || []).find((t) => t[0] === 'z' && DESCRIPTOR_RE.test(t[1] || ''));
    if (!descTag) continue; // no descriptor z → not an event-tagging
    const descriptor = descTag[1];
    const base = { eventId: c.id, authorPubkey: c.pubkey, createdAt: c.created_at };

    const header = headerByCoord.get(descriptor);
    if (!header) {
      unverifiable.push({ ...base, descriptor }); // header not resolvable → unverifiable (NOT dropped)
      continue;
    }

    // Legitimate only if the header joins a tagging-with-specific-tag namespace the reader honors.
    const legit = (header.tags || []).some((t) => {
      if (t[0] !== 'z') return false;
      const m = HONORED_Z_RE.exec(t[1] || '');
      return m && honored.has(m[1]);
    });
    if (!legit) continue; // illegitimate → excluded (distinct from unverifiable)

    // The tag this header is for: its a-tag coordinate 39999:<tagAuthor>:<slug>.
    const aTag = (header.tags || []).find((t) => t[0] === 'a');
    const am = aTag && TAG_A_RE.exec(aTag[1] || '');
    if (!am) continue; // header can't name its tag → not countable
    const tagAuthor = am[1];
    const slug = am[2];

    // Polarity bucket is computed BEFORE the trust filter so it gates both the
    // counted set and the viewer's-own `mine` channel (a neutral assertion is
    // neither apply nor dispute for either).
    const bucket = bucketize(readPolarity(c));
    if (bucket === 'neutral') continue;
    const key = `${tagAuthor}|${slug}`;

    // `mine` — the viewer's OWN legitimate stance, surfaced regardless of trust
    // (so a just-applied tag never appears to vanish when the POV doesn't count
    // them). Legitimacy-gated (we are past the header/honored/tag-identity gates);
    // trust-unfiltered. Keep the latest by createdAt (defensive; upstream dedupes).
    if (viewerPubkey && c.pubkey === viewerPubkey) {
      const existing = mineMap.get(key);
      if (!existing || c.created_at > existing.createdAt) {
        mineMap.set(key, { tag: { authorPubkey: tagAuthor, slug }, stance: bucket, eventId: c.id, createdAt: c.created_at });
      }
    }

    if (!trusted(c.pubkey)) continue; // POV trust filter — counted set only

    if (!tagsMap.has(key)) tagsMap.set(key, { tag: { authorPubkey: tagAuthor, slug }, applications: [], disputes: [] });
    const grp = tagsMap.get(key);
    const entry = { ...base, polarity: readPolarity(c) };
    if (bucket === 'apply') grp.applications.push(entry);
    else grp.disputes.push(entry);
  }

  return { tags: Array.from(tagsMap.values()), unverifiable, mine: Array.from(mineMap.values()) };
}

/** The target a candidate points at: `e` (event id) → {id}; `a` (a-coord) → {address}. */
function targetOfCandidate(c) {
  const e = (c.tags || []).find((t) => t[0] === 'e');
  if (e && e[1]) return { key: `e:${e[1]}`, target: { id: e[1] } };
  const a = (c.tags || []).find((t) => t[0] === 'a');
  if (a && a[1]) return { key: `a:${a[1]}`, target: { address: a[1] } };
  return null;
}

/**
 * The by-tag (forward-discovery) read complement to `classifyEventTaggings`: given
 * candidate taggings for a FIXED tag (scanned across the tag's headers) + those
 * headers + the honored-authority set + a POV trust predicate, group the taggings
 * BY TARGET NOTE. Same per-candidate gating discipline as `classifyEventTaggings`
 * (descriptor → header resolvable → honored authority → header names THIS tag →
 * polarity), but keyed on the target instead of the tag, and unioning across all of
 * the tag's legitimate headers. See ADR event-tagging/0008.
 *
 * Sovereignty: the counted `targets` apply the POV trust filter; `mine` carries the
 * viewer's OWN targets regardless of trust (legitimacy-gated) — the by-tag analogue
 * of Story 7, so a note the viewer tagged never vanishes when the POV doesn't count
 * them. Pure / dependency-free (covered by the core purity guard).
 *
 * @param {object} args.tag  { authorPubkey, slug } — the tag whose taggings these are.
 * @returns {{ targets: Array<{target:{id?:string,address?:string}, applications:object[], disputes:object[]}>,
 *             mine: Array<{target:{id?:string,address?:string}, stance:'apply'|'dispute', eventId:string, createdAt:number}> }}
 */
function groupTaggingsByTarget({ candidates = [], headers = [], honoredAuthorities = [], isAsserterTrusted, viewerPubkey, tag } = {}) {
  const trusted = typeof isAsserterTrusted === 'function' ? isAsserterTrusted : () => true;
  const honored = new Set(honoredAuthorities);
  const wantAuthor = tag && tag.authorPubkey;
  const wantSlug = tag && tag.slug;

  const headerByCoord = new Map();
  for (const h of headers) {
    const d = tagVal(h, 'd');
    if (d) headerByCoord.set(`39999:${h.pubkey}:${d}`, h);
  }

  const targetsMap = new Map(); // targetKey -> { target, applications, disputes }
  const mineMap = new Map();    // targetKey -> { target, stance, eventId, createdAt }  (viewer's own, latest)

  for (const c of candidates) {
    const descTag = (c.tags || []).find((t) => t[0] === 'z' && DESCRIPTOR_RE.test(t[1] || ''));
    if (!descTag) continue; // not an event-tagging
    const header = headerByCoord.get(descTag[1]);
    if (!header) continue; // header not resolvable → skip (the by-tag view doesn't surface unverifiable)

    const legit = (header.tags || []).some((t) => {
      if (t[0] !== 'z') return false;
      const m = HONORED_Z_RE.exec(t[1] || '');
      return m && honored.has(m[1]);
    });
    if (!legit) continue; // illegitimate (un-honored header) → excluded

    const aTag = (header.tags || []).find((t) => t[0] === 'a');
    const am = aTag && TAG_A_RE.exec(aTag[1] || '');
    if (!am) continue; // header can't name its tag
    // Tag-identity gate: only THIS tag's taggings (a header for a different tag is skipped).
    if (wantAuthor && (am[1] !== wantAuthor || am[2] !== wantSlug)) continue;

    const tgt = targetOfCandidate(c);
    if (!tgt) continue; // no target → not a tagging of a note

    const bucket = bucketize(readPolarity(c));
    if (bucket === 'neutral') continue;

    // `mine` — the viewer's own target, surfaced regardless of trust (legitimacy-gated).
    if (viewerPubkey && c.pubkey === viewerPubkey) {
      const existing = mineMap.get(tgt.key);
      if (!existing || c.created_at > existing.createdAt) {
        mineMap.set(tgt.key, { target: tgt.target, stance: bucket, eventId: c.id, createdAt: c.created_at });
      }
    }

    if (!trusted(c.pubkey)) continue; // POV trust filter — counted set only

    if (!targetsMap.has(tgt.key)) targetsMap.set(tgt.key, { target: tgt.target, applications: [], disputes: [] });
    const grp = targetsMap.get(tgt.key);
    const entry = { eventId: c.id, authorPubkey: c.pubkey, polarity: readPolarity(c), createdAt: c.created_at };
    if (bucket === 'apply') grp.applications.push(entry);
    else grp.disputes.push(entry);
  }

  return { targets: Array.from(targetsMap.values()), mine: Array.from(mineMap.values()) };
}

export { classifyEventTaggings, groupTaggingsByTarget };
