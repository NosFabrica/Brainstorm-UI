/**
 * trust.js — the POV/trust seam for the tagging kit.
 *
 * Every read surface in this kit funnels "does this asserter's tagging count?"
 * through ONE function shape: `(pubkey) => boolean` (the `isAsserterTrusted`
 * predicate consumed by classifyEventTaggings / indexByTag / groupTaggingsByTarget).
 * This module builds that predicate from the HOUSE's published trust data —
 * NIP-85 kind-30382 Trusted Assertions, signed by the house's assistant key —
 * with a graceful degrade to "count everyone" when the data isn't reachable.
 *
 * Why this design (read before "improving" it):
 *  - There is no global truth about whose tags count; every count is a view
 *    from a point of view (POV). Phase 0 of this client adopts the HOUSE POV:
 *    the operators of the configured instance publish kind-30382 events
 *    (one per pubkey: ["d",<pubkey>], ["rank",..], ["hops",..], GrapeRank
 *    metrics) under their assistant pubkey. We read those as the trust source.
 *  - The house may publish hundreds of thousands of 30382s — NEVER fetch them
 *    all. Trust is resolved LAZILY: collect the asserter pubkeys you actually
 *    saw in candidates, batch-fetch only their 30382s (filter by authors +
 *    #d), cache, and answer from the cache.
 *  - The house signs 30382s with a key that can ROTATE (it is re-created when
 *    the instance's container is re-initialized), so the live corpus may be
 *    split across a current and one or more retired keys. That's why
 *    `assertionAuthorPubkeys` is a LIST — honor all of them; latest event per
 *    subject wins regardless of which honored key signed it.
 *  - Later phases swap the source, not the shape: a logged-in user's own POV
 *    (their instance's 30382s), or a fully client-side WoT. UI code never
 *    changes — it keeps receiving `(pubkey) => boolean`.
 *
 * RELAY ROUTING (empirical, verified 2026-07-23): the house's TA-signed
 * artifacts — kind-30382 trust assertions and the 3039x Trusted Lists — live on
 * the HOUSE relay only; the tag hub (dcosl) does not carry them. The
 * `fetchEvents` you inject here must therefore query CONFIG.trustRelays
 * (∪ tagRelays is fine) — a fetchEvents wired to the hub alone will find
 * nothing and silently degrade to count-everyone.
 *
 * Dependency-free: relay I/O is injected as `fetchEvents(filter) => Promise<Event[]>`
 * (wrap your pool's querySync/list). No imports.
 */

/** Everyone counts. The explicit phase-0 / degraded-mode predicate. */
export function trustEveryone() {
  return () => true;
}

/**
 * Build a lazy, cached house-POV trust source.
 *
 * @param {object} opts
 * @param {(filter:object)=>Promise<object[]>} opts.fetchEvents  relay read wired to
 *   CONFIG.trustRelays (see RELAY ROUTING in the module header).
 * @param {string[]} opts.assertionAuthorPubkeys  the house keys honored as 30382 AUTHORS
 *   (CONFIG.nip85AuthorPubkeys) — current TA first, then any retired keys whose corpus
 *   is still live. Latest event per subject wins across all of them.
 * @param {number} [opts.minRank=1]   minimum ["rank"] value to count (rank = round(influence*100)).
 * @param {number} [opts.maxHops=20]  maximum ["hops"] to count (999 = unreachable).
 * @param {'trusted'|'everyone'} [opts.unknownPolicy='trusted']  what to do with a pubkey that has
 *   NO 30382 under any honored key. Default 'trusted' mirrors the reference deployment's own
 *   fallback (an un-provisioned POV counts everyone) and keeps a sparsely-scored universe
 *   usable; flip to 'untrusted'-style strictness later by passing a custom policy function.
 *
 * @returns {{ ensure:(pubkeys:string[])=>Promise<void>, predicate:(pubkey:string)=>boolean }}
 *   Call `await ensure(asserterPubkeys)` after collecting candidates, THEN classify with
 *   `predicate`. `predicate` is synchronous (the classifiers require that) and answers from
 *   the cache; a pubkey never passed through `ensure` falls under `unknownPolicy`. A chunk
 *   whose relay fetch FAILS is left uncached (so a later `ensure` retries it) — only a
 *   successful fetch that finds nothing caches the "no assertion" answer.
 */
export function createHouseTrustSource({ fetchEvents, assertionAuthorPubkeys, minRank = 1, maxHops = 20, unknownPolicy = 'trusted' } = {}) {
  if (typeof fetchEvents !== 'function') throw new Error('trust: fetchEvents (relay read) is required');
  if (!Array.isArray(assertionAuthorPubkeys) || assertionAuthorPubkeys.length === 0
      || !assertionAuthorPubkeys.every((pk) => /^[0-9a-f]{64}$/.test(pk || ''))) {
    throw new Error('trust: assertionAuthorPubkeys must be a non-empty array of 64-hex pubkeys');
  }

  // pubkey -> { rank, hops } | null (fetched, no assertion found)
  const cache = new Map();

  function tagNum(ev, name, fallback) {
    const t = (ev.tags || []).find((x) => x[0] === name);
    const n = t ? Number(t[1]) : NaN;
    return Number.isFinite(n) ? n : fallback;
  }

  async function ensure(pubkeys = []) {
    const missing = [...new Set(pubkeys)].filter((pk) => /^[0-9a-f]{64}$/.test(pk) && !cache.has(pk));
    if (!missing.length) return;
    // Batch in chunks — relays commonly cap filter list lengths.
    const CHUNK = 100;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK);
      let events;
      try {
        events = await fetchEvents({ kinds: [30382], authors: assertionAuthorPubkeys, '#d': chunk });
      } catch {
        // Relay unreachable → leave this chunk UNCACHED so a later ensure()
        // retries it; unknownPolicy governs at predicate time. Do not throw:
        // trust degradation must never break rendering.
        continue;
      }
      // Latest-wins per d (30382 is addressable/replaceable) — across ALL
      // honored authors, so a fresh re-run under the current key supersedes a
      // retired key's stale corpus per subject.
      const latest = new Map();
      for (const ev of events || []) {
        const d = ((ev.tags || []).find((x) => x[0] === 'd') || [])[1];
        if (!d) continue;
        const prev = latest.get(d);
        if (!prev || ev.created_at > prev.created_at) latest.set(d, ev);
      }
      for (const pk of chunk) {
        const ev = latest.get(pk);
        cache.set(pk, ev ? { rank: tagNum(ev, 'rank', 0), hops: tagNum(ev, 'hops', 999) } : null);
      }
    }
  }

  function predicate(pubkey) {
    const entry = cache.get(pubkey);
    if (entry === undefined || entry === null) return unknownPolicy === 'trusted';
    return entry.rank >= minRank && entry.hops <= maxHops;
  }

  return { ensure, predicate };
}

/**
 * Fetch the house's tag-APPLICABILITY lists — the published "which tags are for
 * events" / "which tags are for pubkeys" separation (TA-signed kind-30394
 * Trusted Lists whose members are tag a-coordinates).
 *
 * Use these to drive the tag picker's Content/Profile sections. They are the
 * house's own HINT ∪ USAGE derivation; you can also compute the same union
 * client-side with the SDK's deriveApplicabilityMembers (event-tagging/
 * applicability.js) — do that as the fallback when these lists are absent.
 *
 * These lists are signed by the CURRENT house TA (`houseAssistantPubkey` =
 * CONFIG.localTaPubkey — unlike the 30382s, verified current 2026-07-23) and,
 * like all TA artifacts, live on the HOUSE relay: `fetchEvents` must be the
 * trustRelays-wired reader.
 *
 * @returns {Promise<{event:Set<string>, pubkey:Set<string>}>} sets of tag
 *   a-coordinates (39999:<author>:<slug>). Empty sets when unpublished/unreachable.
 */
export async function fetchApplicabilityLists({ fetchEvents, houseAssistantPubkey }) {
  const out = { event: new Set(), pubkey: new Set() };
  let events = [];
  try {
    events = await fetchEvents({
      kinds: [30394],
      authors: [houseAssistantPubkey],
      '#d': ['tag-applicability-nostr-event', 'tag-applicability-nostr-pubkey'],
    });
  } catch {
    return out;
  }
  const latest = new Map();
  for (const ev of events) {
    const d = ((ev.tags || []).find((x) => x[0] === 'd') || [])[1];
    if (!d) continue;
    const prev = latest.get(d);
    if (!prev || ev.created_at > prev.created_at) latest.set(d, ev);
  }
  for (const [d, ev] of latest) {
    const set = d === 'tag-applicability-nostr-pubkey' ? out.pubkey : out.event;
    for (const t of ev.tags || []) if (t[0] === 'a' && t[1]) set.add(t[1]);
  }
  return out;
}
