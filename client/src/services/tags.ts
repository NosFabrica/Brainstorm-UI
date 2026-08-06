/**
 * Decentralized tagging — the app's adapter over the vendored tagging SDK.
 *
 * The SDK (`@/lib/tagging-sdk`) is pure: it builds unsigned events and filter
 * objects and knows nothing about relays, signers or React. Everything that
 * knows about *us* lives here, so the SDK stays re-vendorable.
 *
 * Scope is floor B (see docs/decentralized-tagging/DECISIONS.md): read tags on
 * any pubkey, and let a signed-in user tag themselves.
 *
 * NO BACKEND. Tags are client-signed, client-published, client-read — the same
 * shape as our kind-1984 reports and kind-30078 prefs. Nothing here may touch
 * `services/api.ts`: `/p/:id` is anon-viewable and `authenticatedFetch` wipes
 * auth storage and hard-redirects on 401 (.agents/memory/anon-public-data-fetch.md).
 */
import {
  pool,
  fetchEventsByFilter,
  signEventLocally,
  loadOutboxRelayListFromDb,
  getCurrentUser,
  fetchProfileMap,
} from "./nostr";
import {
  applyProfileTagging,
  conceptNostrUserTag,
  filterProfileTaggingsUsingTag,
  filterTagsAppliedToPubkey,
  type Polarity,
  type ApplyProfileTaggingResult,
} from "@/lib/tagging-sdk/profile-tagging.js";
import {
  createHouseTrustSource,
  fetchApplicabilityLists,
  trustEveryone,
  type TrustPredicate,
} from "@/lib/tagging-sdk/trust.js";
import { buildTagElement, conceptTag, slug as toSlug } from "@/lib/tagging-sdk/event-tagging/index.js";
import { mergeSameNamedTags, stanceForVariants, type CountedTag } from "@/lib/tagMerge";
import {
  LOCAL_TA_PUBKEY,
  TAG_RELAYS,
  TRUST_RELAYS,
  Z_HANDLE_PUBKEYS,
  NIP85_AUTHOR_PUBKEYS,
  TRUST_SETTINGS,
  TAG_FOR_NOSTR_PUBKEY_Z,
} from "@/config/tagging";

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

/** A tag as the UI cares about it. */
export interface TagIdentity {
  authorPubkey: string;
  slug: string;
  /** Display name from the tag-element's content; falls back to the slug. */
  name: string;
  description?: string;
}

/** One tag as it appears on a profile, with its counted support. */
export interface ProfileTag extends TagIdentity {
  /** Stable key for React and for de-duping: `<authorPubkey>|<slug>`. */
  key: string;
  /** Distinct trusted asserters who applied it. */
  applications: number;
  /** Distinct trusted asserters who disputed it. */
  disputes: number;
  /** Who vouched, for attribution. Same people `applications` counts. */
  asserters: string[];
  /** This person said it about themselves. Not the network saying it. */
  selfDeclared: boolean;
  /** This person objects. Displayed with weight; never a veto. */
  subjectDisagreed: boolean;
  /**
   * Whether third-party support actually carries the tag (the kit's net rule).
   * False for a tag that only survives because the subject declared it, or
   * because the viewer has a stance on it — both still render, differently.
   */
  counted: boolean;
  /**
   * How many separately-minted tag identities share this name and were folded
   * into this one. 1 is the normal case; >1 means different authors created the
   * same tag and we're showing the best-supported of them.
   */
  variants: number;
  /** The viewer's own stance, shown regardless of whether the POV counts them. */
  myStance?: "apply" | "dispute";
}

export interface ProfileTagsResult {
  /** Trust-filtered, ordered by support. What the chip row renders. */
  tags: ProfileTag[];
  /**
   * The viewer's own stances, trust-unfiltered. A tag you just applied must
   * never appear to vanish because the current POV doesn't count you.
   */
  mine: Array<{ key: string; stance: "apply" | "dispute" }>;
}

const TAG_ELEMENT_KIND = 39999;

// ─── Relay I/O ───────────────────────────────────────────────────────────────

/**
 * Tag reads: the hub ∪ the user's read relays. Kept separate from the trust
 * reader below — the house's TA-signed artifacts are not on the hub.
 */
function fetchTagEvents(filter: Record<string, unknown>): Promise<NostrEvent[]> {
  return fetchEventsByFilter(filter, TAG_RELAYS) as Promise<NostrEvent[]>;
}

/**
 * Walk the whole assertion history, not just the newest page.
 *
 * A plain `limit` is useless for the catalogue: the hub holds 2928 profile-tag
 * assertions of which **23 are real** — the rest is QA-harness output published
 * in a recent burst. A newest-first page of 2000 therefore contains ~6 real
 * ones, and the catalogue silently under-reports (it claimed "Verified Human,
 * 2 people" for a tag that has 4). Relay filters can't express "has an `a`
 * tag", so we page backwards through `until` until the relay stops giving us
 * anything new.
 *
 * Bounded on both ends: it stops on an empty page, on a timestamp that doesn't
 * advance, or at `maxRounds` — a relay that keeps replaying the same window
 * must not spin here. Today the whole corpus takes 3 rounds.
 */
async function fetchAllTagEvents(
  filter: Record<string, unknown>,
  { pageSize = 1000, maxRounds = 8 } = {},
): Promise<NostrEvent[]> {
  const seen = new Map<string, NostrEvent>();
  let until: number | undefined;

  for (let round = 0; round < maxRounds; round++) {
    let batch: NostrEvent[];
    try {
      batch = await fetchTagEvents({ ...filter, limit: pageSize, ...(until ? { until } : {}) });
    } catch {
      break; // keep whatever we already have rather than losing the page
    }
    if (!batch.length) break;

    let oldest = Infinity;
    for (const ev of batch) {
      seen.set(ev.id, ev);
      if (ev.created_at < oldest) oldest = ev.created_at;
    }
    if (!Number.isFinite(oldest)) break;
    const next = oldest - 1;
    if (next === until) break; // relay isn't advancing; stop rather than loop
    until = next;
  }
  return Array.from(seen.values());
}

/**
 * Trust reads go to the HOUSE relay. Wiring this to the hub instead is the
 * documented way to get a silent degrade to "count everyone" — the fetch
 * succeeds, finds nothing, and every asserter falls under `unknownPolicy`.
 */
function fetchTrustEvents(filter: Record<string, unknown>): Promise<NostrEvent[]> {
  return fetchEventsByFilter(filter, TRUST_RELAYS) as Promise<NostrEvent[]>;
}

/**
 * Publish to (tag hub ∪ the author's own write relays), per the kit's routing
 * rule. We can't use `publishToRelays()` from nostr.ts here: it ignores its
 * `relays` argument and always resolves the author's outbox seeded with
 * PROFILE_RELAYS, so a tag event would never reach the hub. Seeding
 * `loadOutboxRelayListFromDb` with TAG_RELAYS gives exactly the union we want.
 */
async function publishTagEvent(
  signed: Record<string, unknown>,
): Promise<{ accepted: number; total: number }> {
  const relays = loadOutboxRelayListFromDb(signed.pubkey as string, TAG_RELAYS);
  const responses = await pool.publish(relays, signed as never);
  const accepted = responses.filter((r) => r.ok).length;
  const total = responses.length || relays.length;
  if (!accepted) {
    throw new Error(responses.find((r) => !r.ok)?.message || "No relay accepted the event");
  }
  return { accepted, total };
}

// ─── Trust ───────────────────────────────────────────────────────────────────

/**
 * Module-level so the 30382 cache survives across profile views — the house may
 * publish hundreds of thousands of assertions and we only ever fetch the
 * asserters we actually saw.
 */
let houseTrust: ReturnType<typeof createHouseTrustSource> | null = null;

function getTrustSource() {
  if (TRUST_SETTINGS.mode !== "house-ta") return null;
  if (!houseTrust) {
    houseTrust = createHouseTrustSource({
      fetchEvents: fetchTrustEvents,
      assertionAuthorPubkeys: NIP85_AUTHOR_PUBKEYS,
      minRank: TRUST_SETTINGS.minRank,
      maxHops: TRUST_SETTINGS.maxHops,
      unknownPolicy: TRUST_SETTINGS.unknownPolicy,
    });
  }
  return houseTrust;
}

/**
 * Resolve the POV predicate for a set of asserters. Never throws: if the trust
 * relay is unreachable the SDK leaves those pubkeys uncached and they fall
 * under `unknownPolicy`, so tags still render.
 */
async function resolveTrust(asserters: string[]): Promise<TrustPredicate> {
  const source = getTrustSource();
  if (!source) return trustEveryone();
  await source.ensure(asserters);
  return source.predicate;
}

// ─── Reading a profile's tags ────────────────────────────────────────────────

function tagValue(ev: NostrEvent, name: string): string | undefined {
  return (ev.tags || []).find((t) => t[0] === name)?.[1];
}

/** >= 0.5 applies, <= -0.5 disputes, anything between is neither. */
function bucketize(ev: NostrEvent): "apply" | "dispute" | "neutral" {
  const raw = Number(tagValue(ev, "polarity"));
  const p = Number.isFinite(raw) ? raw : 1; // absent polarity reads as an apply
  if (p >= 0.5) return "apply";
  if (p <= -0.5) return "dispute";
  return "neutral";
}

/**
 * Split raw kind-39999 assertions into counted-per-tag support plus the
 * viewer's own stances.
 *
 * This mirrors the discipline of the SDK's `classifyEventTaggings` but cannot
 * reuse it: that classifier resolves an indirect per-tag *header* before it can
 * name a tag, and profile-tag assertions are the DIRECT shape.
 *
 * **Identity comes from `a` OR `e`.** The protocol's normative shape puts the
 * tag in `a`, but `protocol/tags.md` §Taggings is explicit that the deployed
 * publishers still emit the original `d/p/e/z/polarity` shape without it, and
 * that "a reader needing completeness MUST union `#a` lookups with legacy `#e`
 * lookups against the tag-element's event ids."
 *
 * We originally required `a` and were wrong. Of 2928 assertions on the hub,
 * **2905 have no `a`** — and they are not junk: they carry `AOS 2026
 * Participant` (109), `LFO` (60), `Bitcoin Vendor` (35), `Tunestr Community`
 * (28), `Musician` (16), on 68 targets with real kind-0 profiles. Requiring `a`
 * hid roughly 99% of real tagging. The earlier reasoning generalised from a
 * newest-first sample that happened to be almost entirely QA-harness output.
 */
interface NormalizedAssertion {
  /** `<tagAuthor>|<slug>` — the tag's identity. */
  tagKey: string;
  tagAuthor: string;
  slug: string;
  /** The pubkey being tagged. */
  target: string;
  /** The pubkey doing the tagging. */
  asserter: string;
  stance: "apply" | "dispute";
  /** When it was signed — the only honest basis for a "recently added" sort. */
  at: number;
}

/** A tag-element's coordinates, however we got to them. */
interface TagRefResolved {
  tagAuthor: string;
  slug: string;
}

/**
 * Resolve every candidate's tag identity, using `a` where present and falling
 * back to resolving the `e` tag-element by id — the union the protocol requires.
 *
 * One batched fetch for all the `e`-only ids, not one per assertion. The
 * elements are immutable in practice, so this is cache-friendly.
 */
async function resolveAssertionTags(
  candidates: NostrEvent[],
): Promise<Map<string, TagRefResolved>> {
  const byEventId = new Map<string, TagRefResolved>();
  const needElement = new Set<string>();

  for (const ev of candidates) {
    const a = tagValue(ev, "a");
    const m = a && /^39999:([0-9a-f]{64}):(.+)$/.exec(a);
    if (m) {
      byEventId.set(ev.id, { tagAuthor: m[1], slug: m[2] });
      continue;
    }
    const e = tagValue(ev, "e");
    if (e) needElement.add(e);
  }

  if (needElement.size) {
    const ids = Array.from(needElement);
    const elements: NostrEvent[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      try {
        elements.push(...(await fetchTagEvents({ ids: ids.slice(i, i + 200) })));
      } catch {
        // Partial resolution beats none — the assertions we couldn't resolve
        // just don't count, exactly as if their tag had been deleted.
      }
    }
    const elementById = new Map(elements.map((el) => [el.id, el]));
    for (const ev of candidates) {
      if (byEventId.has(ev.id)) continue;
      const el = elementById.get(tagValue(ev, "e") ?? "");
      const d = el && tagValue(el, "d");
      if (el && d) byEventId.set(ev.id, { tagAuthor: el.pubkey, slug: d });
    }
  }

  return byEventId;
}

async function normalizeAssertions(candidates: NostrEvent[]): Promise<NormalizedAssertion[]> {
  const honored = new Set(Z_HANDLE_PUBKEYS.map(conceptNostrUserTag));
  const tagOf = await resolveAssertionTags(candidates);

  // Latest-wins per (tag, target, asserter). The d-tag is deterministic for
  // that triple, so a re-tag replaces rather than stacks — but relays can hand
  // us both the old and new copy, and an apply↔dispute flip has to collapse to
  // the newer stance instead of counting as both.
  const latest = new Map<string, NostrEvent>();
  for (const ev of candidates) {
    if (!(ev.tags || []).some((t) => t[0] === "z" && honored.has(t[1]))) continue;
    const ref = tagOf.get(ev.id);
    if (!ref) continue;
    const target = tagValue(ev, "p");
    if (!target) continue;
    const key = `${ref.tagAuthor}|${ref.slug}|${target}|${ev.pubkey}`;
    const prev = latest.get(key);
    if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
  }

  const out: NormalizedAssertion[] = [];
  for (const [composite, ev] of latest) {
    const [tagAuthor, slug, target] = composite.split("|");
    const stance = bucketize(ev);
    if (stance === "neutral") continue;
    out.push({
      tagKey: `${tagAuthor}|${slug}`,
      tagAuthor,
      slug,
      target,
      asserter: ev.pubkey,
      stance,
      at: ev.created_at,
    });
  }
  return out;
}

/**
 * Which of these pubkeys are real people?
 *
 * The hub carries thousands of harness assertions aimed at pubkeys that have
 * never had a kind-0. Gating carrier lists on "has a profile" drops all of them
 * without inventing a name-shape blocklist, and it's defensible on its own
 * terms: a tag on an identity that has never existed isn't a claim anyone can
 * evaluate. Never throws — `fetchProfileMap` resolves a partial map on timeout,
 * so a slow relay under-reports rather than empties the page.
 */
async function filterToRealProfiles(pubkeys: string[]): Promise<Set<string>> {
  if (!pubkeys.length) return new Set();
  try {
    const map = await fetchProfileMap(pubkeys);
    return new Set(map.keys());
  } catch {
    return new Set(pubkeys); // can't tell → don't hide anyone
  }
}

/**
 * The kit's inclusion rule: a target counts when its trusted support beats its
 * trusted opposition (`INTEGRATION.md` C6 — "net apply−dispute > 0", restated
 * in ACCEPTANCE Floors B and D). Counting applications alone would leave
 * someone visible at 1 agree against 5 disagrees.
 */
function netPositive(applications: number, disputes: number): boolean {
  return applications - disputes > 0;
}

/** Group normalized assertions BY TAG — the profile read. */
function groupByTag(
  assertions: NormalizedAssertion[],
  isAsserterTrusted: TrustPredicate,
  viewerPubkey?: string,
): {
  counted: Map<string, CountedTag>;
  mine: Map<string, "apply" | "dispute">;
} {
  const counted = new Map<string, CountedTag>();
  const mine = new Map<string, "apply" | "dispute">();

  for (const a of assertions) {
    // The viewer's own stance is recorded BEFORE the trust filter, so a tag
    // they just applied doesn't disappear under a POV that doesn't count them.
    if (viewerPubkey && a.asserter === viewerPubkey) mine.set(a.tagKey, a.stance);
    if (!isAsserterTrusted(a.asserter)) continue;

    if (!counted.has(a.tagKey)) {
      counted.set(a.tagKey, {
        authorPubkey: a.tagAuthor,
        slug: a.slug,
        applications: new Set(),
        disputes: new Set(),
        selfApplied: false,
        selfDisputed: false,
      });
    }
    const grp = counted.get(a.tagKey)!;

    // The subject's own voice is kept apart from the crowd's, in both
    // directions: self-declaration is not attestation, and the subject's
    // objection is displayed rather than silently subtracted.
    if (a.asserter === a.target) {
      if (a.stance === "apply") grp.selfApplied = true;
      else grp.selfDisputed = true;
      continue;
    }
    (a.stance === "apply" ? grp.applications : grp.disputes).add(a.asserter);
  }

  return { counted, mine };
}

interface TargetSupport {
  applications: Set<string>;
  disputes: Set<string>;
  selfApplied: boolean;
  selfDisputed: boolean;
  /** Newest applying assertion, for the "recently added" sort. */
  addedAt: number;
}

/** Group normalized assertions BY TARGET — the tag-page read. */
function groupByTarget(
  assertions: NormalizedAssertion[],
  isAsserterTrusted: TrustPredicate,
): Map<string, TargetSupport> {
  const byTarget = new Map<string, TargetSupport>();
  for (const a of assertions) {
    if (!isAsserterTrusted(a.asserter)) continue;
    if (!byTarget.has(a.target)) {
      byTarget.set(a.target, {
        applications: new Set(),
        disputes: new Set(),
        selfApplied: false,
        selfDisputed: false,
        addedAt: 0,
      });
    }
    const grp = byTarget.get(a.target)!;
    if (a.stance === "apply" && a.at > grp.addedAt) grp.addedAt = a.at;
    if (a.asserter === a.target) {
      if (a.stance === "apply") grp.selfApplied = true;
      else grp.selfDisputed = true;
      continue;
    }
    (a.stance === "apply" ? grp.applications : grp.disputes).add(a.asserter);
  }
  return byTarget;
}

/**
 * Resolve tag-elements to display names. A tag-element is itself a kind-39999
 * keyed `["d", <slug>]` under its author, with `{"tag":{name,description}}` in
 * content. Unresolvable tags still render — the slug is a usable label.
 */
async function resolveTagNames(
  refs: Array<{ authorPubkey: string; slug: string }>,
): Promise<Map<string, { name: string; description?: string }>> {
  const out = new Map<string, { name: string; description?: string }>();
  if (!refs.length) return out;

  let events: NostrEvent[] = [];
  try {
    events = await fetchTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      authors: Array.from(new Set(refs.map((r) => r.authorPubkey))),
      "#d": Array.from(new Set(refs.map((r) => r.slug))),
    });
  } catch {
    return out; // names are cosmetic; slugs carry the meaning
  }

  for (const ev of events) {
    const d = tagValue(ev, "d");
    if (!d) continue;
    try {
      const parsed = JSON.parse(ev.content) as { tag?: { name?: string; description?: string } };
      if (parsed?.tag?.name) {
        out.set(`${ev.pubkey}|${d}`, {
          name: parsed.tag.name,
          description: parsed.tag.description,
        });
      }
    } catch {
      // malformed content → fall through to the slug
    }
  }
  return out;
}

/**
 * Every tag applied to one pubkey, from the configured POV.
 *
 * Works fully anonymously — this is the `/p/:id` read for logged-out visitors.
 * Pass `viewerPubkey` only to surface the viewer's own stances.
 */
export async function fetchProfileTags(
  targetPubkey: string,
  viewerPubkey?: string,
): Promise<ProfileTagsResult> {
  const candidates = await fetchTagEvents(
    filterTagsAppliedToPubkey({ targetPubkey, zHandlePubkeys: Z_HANDLE_PUBKEYS }),
  );
  if (!candidates.length) return { tags: [], mine: [] };

  const assertions = await normalizeAssertions(candidates);
  const trusted = await resolveTrust(Array.from(new Set(assertions.map((a) => a.asserter))));
  const { counted, mine } = groupByTag(assertions, trusted, viewerPubkey);

  const names = await resolveTagNames(Array.from(counted.values()));

  const tags: ProfileTag[] = mergeSameNamedTags(counted, names)
    .map(({ key, group, name, description, variantKeys }) => ({
      key,
      authorPubkey: group.authorPubkey,
      slug: group.slug,
      name,
      description,
      applications: group.applications.size,
      disputes: group.disputes.size,
      asserters: Array.from(group.applications),
      selfDeclared: group.selfApplied,
      subjectDisagreed: group.selfDisputed,
      counted: netPositive(group.applications.size, group.disputes.size),
      variants: variantKeys.length,
      myStance: stanceForVariants(variantKeys, mine),
    }))
    /**
     * Three ways a tag earns a place on the profile:
     *  - the net rule (real third-party support), or
     *  - the subject declared it — renders, but labelled as their own claim
     *    rather than the network's, or
     *  - the VIEWER has a stance on it. ACCEPTANCE Floor B is explicit that
     *    after you take your own tag back you must "still see your own stance
     *    state honestly (dimmed/struck, not vanished)" — silently vanishing
     *    leaves you unsure whether the click worked.
     */
    .filter((t) => t.counted || t.selfDeclared || !!t.myStance)
    // Contested tags sink; ties break alphabetically so the row is stable
    // across refetches rather than reshuffling on every render.
    .sort(
      (a, b) =>
        Number(b.counted) - Number(a.counted) ||
        b.applications - a.applications ||
        a.disputes - b.disputes ||
        a.name.localeCompare(b.name),
    );

  return {
    tags,
    mine: Array.from(mine.entries()).map(([key, stance]) => ({ key, stance })),
  };
}

// ─── Reading a tag ───────────────────────────────────────────────────────────

/** One person carrying a tag, as the tag page lists them. */
export interface TagCarrier {
  pubkey: string;
  /** Distinct trusted third parties who applied the tag to this person. */
  applications: number;
  /** Distinct trusted third parties who disputed it. */
  disputes: number;
  /** Who vouched, for attribution. */
  asserters: string[];
  /** They put this on themselves — a claim, not a corroboration. */
  selfDeclared: boolean;
  /** They object to carrying it. Shown on their row. */
  subjectDisagreed: boolean;
  /** The VIEWER's stance on this person carrying the tag — drives the vote button. */
  myStance?: "apply" | "dispute";
  /** Unix seconds of the newest assertion adding them. Powers "recently added". */
  addedAt: number;
}

export interface TagDetail {
  tag: TagIdentity;
  carriers: TagCarrier[];
}

/**
 * Everyone the network says carries one tag — the reverse of `fetchProfileTags`,
 * and the read behind `/tags/:author/:slug`.
 *
 * A tag IS its list of people, which is what makes this the payoff of the whole
 * feature rather than a side view. Same trust discipline as the profile read:
 * one assertion per (target, asserter) with the latest stance winning, counted
 * only from asserters the POV honors.
 *
 * Anonymous-safe, like every read here — relays only, no API client.
 */
export async function fetchTagDetail(
  authorPubkey: string,
  slug: string,
  viewerPubkey?: string,
): Promise<TagDetail> {
  // The tag-element, for its name AND its event id — assertions that predate
  // the `a` correction reference the tag only by that id.
  let elements: NostrEvent[] = [];
  try {
    elements = await fetchTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      authors: [authorPubkey],
      "#d": [slug],
    });
  } catch {
    /* name falls back to the slug; the #a read below still works */
  }
  const element = elements.find((el) => tagValue(el, "d") === slug);
  let meta: { name?: string; description?: string } = {};
  if (element) {
    try {
      meta = (JSON.parse(element.content) as { tag?: typeof meta }).tag ?? {};
    } catch { /* malformed content → slug */ }
  }
  const tag: TagIdentity = {
    authorPubkey,
    slug,
    name: meta.name || slug,
    description: meta.description,
  };

  // Both halves of the union: modern assertions point at the tag's coordinate,
  // legacy ones at the element's event id. Querying only `#a` here is what made
  // this page under-report.
  const elementIds = elements.map((el) => el.id);
  const [byCoord, byElementId] = await Promise.all([
    fetchTagEvents(
      filterProfileTaggingsUsingTag({
        tagAuthorPubkey: authorPubkey,
        slug,
        zHandlePubkeys: Z_HANDLE_PUBKEYS,
      }),
    ),
    elementIds.length
      ? fetchTagEvents({
          kinds: [TAG_ELEMENT_KIND],
          "#e": elementIds,
          "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
        })
      : Promise.resolve([] as NostrEvent[]),
  ]);

  const deduped = new Map<string, NostrEvent>();
  for (const ev of [...byCoord, ...byElementId]) deduped.set(ev.id, ev);
  if (!deduped.size) return { tag, carriers: [] };

  // Only assertions for THIS tag — the relays filtered, but a permissive one
  // could hand back more and we'd rather not list strangers.
  const assertions = (await normalizeAssertions(Array.from(deduped.values()))).filter(
    (a) => a.tagAuthor === authorPubkey && a.slug === slug,
  );

  const trusted = await resolveTrust(Array.from(new Set(assertions.map((a) => a.asserter))));
  const byTarget = groupByTarget(assertions, trusted);

  // The viewer's own stance per person, read BEFORE the trust filter — the same
  // rule as the profile chips. Someone must always be able to see what they
  // themselves said, whatever the POV makes of them.
  const myStanceFor = new Map<string, "apply" | "dispute">();
  if (viewerPubkey) {
    for (const a of assertions) {
      if (a.asserter === viewerPubkey) myStanceFor.set(a.target, a.stance);
    }
  }

  const real = await filterToRealProfiles(Array.from(byTarget.keys()));

  const carriers: TagCarrier[] = Array.from(byTarget.entries())
    // The has-a-profile gate exists to drop harness targets, but it must never
    // hide someone the VIEWER just acted on — otherwise a user without a
    // kind-0 taps "Add me", sees themselves appear, and watches the refetch
    // delete them with no explanation.
    .filter(([pubkey]) => real.has(pubkey) || myStanceFor.has(pubkey))
    .map(([pubkey, grp]) => ({
      pubkey,
      applications: grp.applications.size,
      disputes: grp.disputes.size,
      asserters: Array.from(grp.applications),
      selfDeclared: grp.selfApplied,
      subjectDisagreed: grp.selfDisputed,
      myStance: myStanceFor.get(pubkey),
      addedAt: grp.addedAt,
    }))
    // Vouched-for people, plus people who put the tag on themselves, plus
    // anyone the viewer has a stance on — same "never silently vanish" rule
    // the profile chips follow.
    .filter((c) => netPositive(c.applications, c.disputes) || c.selfDeclared || !!c.myStance)
    // Most-vouched first; self-declared-only sink below anyone corroborated.
    // Ties break on pubkey so the order is stable across refetches.
    .sort(
      (a, b) =>
        b.applications - a.applications ||
        a.disputes - b.disputes ||
        a.pubkey.localeCompare(b.pubkey),
    );

  return { tag, carriers };
}

// ─── The catalogue ───────────────────────────────────────────────────────────

/** One tag in the catalogue, with how much use it's actually seen. */
export interface TagSummary extends TagIdentity {
  key: string;
  /** Distinct people carrying this tag. */
  people: number;
  /** Distinct trusted asserters who applied it to somebody. */
  vouches: number;
  /** Separately-minted identities folded into this entry. */
  variants: number;
}

/**
 * Every tag anyone actually uses, most-used first.
 *
 * Deliberately derived from ASSERTIONS rather than from the tag-element list.
 * The hub holds 1902 elements of which only ~64 are real; the rest is
 * QA-harness output (`wysiwyg-s17-1785898945945-…`). Listing elements would
 * mean showing that noise and inventing a filter to hide it. Listing what
 * people have actually tagged excludes it for free, and gives real counts as a
 * by-product — which is also what ranks search results.
 *
 * One relay round-trip for the whole catalogue, so callers should cache it hard.
 * Anonymous-safe like every read here.
 */
export async function fetchTagIndex(): Promise<TagSummary[]> {
  const candidates = await fetchAllTagEvents({
    kinds: [TAG_ELEMENT_KIND],
    "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
  });
  if (!candidates.length) return [];

  const assertions = await normalizeAssertions(candidates);
  const trusted = await resolveTrust(Array.from(new Set(assertions.map((a) => a.asserter))));
  const real = await filterToRealProfiles(Array.from(new Set(assertions.map((a) => a.target))));

  // Reuse the profile read's grouping so the catalogue can't drift from what a
  // profile shows: same trust filter, same latest-wins, same apply/dispute rule.
  // Support is tallied PER (tag, person) so the net rule can be applied per
  // carrier — a tag isn't "used" by someone the network has voted down.
  const counted = new Map<string, CountedTag>();
  const perCarrier = new Map<
    string,
    { applies: Set<string>; disputes: Set<string>; selfApplied: boolean }
  >();

  for (const a of assertions) {
    if (!trusted(a.asserter)) continue;
    if (!real.has(a.target)) continue;
    if (!counted.has(a.tagKey)) {
      counted.set(a.tagKey, {
        authorPubkey: a.tagAuthor,
        slug: a.slug,
        applications: new Set(),
        disputes: new Set(),
        selfApplied: false,
        selfDisputed: false,
      });
    }
    const grp = counted.get(a.tagKey)!;

    const ck = `${a.tagKey}|${a.target}`;
    if (!perCarrier.has(ck)) {
      perCarrier.set(ck, { applies: new Set(), disputes: new Set(), selfApplied: false });
    }
    const c = perCarrier.get(ck)!;

    // Self-assertions carry the person onto the list but never inflate the
    // tag's vouch count — the catalogue's "N accounts" has to mean N *other*
    // people, or a tag one person applied to themselves fifty times over would
    // read as widely attested.
    if (a.asserter === a.target) {
      if (a.stance === "apply") {
        grp.selfApplied = true;
        c.selfApplied = true;
      } else {
        grp.selfDisputed = true;
      }
      continue;
    }
    (a.stance === "apply" ? grp.applications : grp.disputes).add(a.asserter);
    (a.stance === "apply" ? c.applies : c.disputes).add(a.asserter);
  }

  const people = new Map<string, Set<string>>();
  for (const [ck, c] of perCarrier) {
    if (!netPositive(c.applies.size, c.disputes.size) && !c.selfApplied) continue;
    const sep = ck.lastIndexOf("|");
    const tagKey = ck.slice(0, sep);
    const target = ck.slice(sep + 1);
    if (!people.has(tagKey)) people.set(tagKey, new Set());
    people.get(tagKey)!.add(target);
  }

  const names = await resolveTagNames(Array.from(counted.values()));

  return mergeSameNamedTags(counted, names)
    .map(({ key, group, name, description, variantKeys }) => {
      const carriers = new Set<string>();
      for (const k of variantKeys) for (const p of people.get(k) ?? []) carriers.add(p);
      return {
        key,
        authorPubkey: group.authorPubkey,
        slug: group.slug,
        name,
        description,
        people: carriers.size,
        vouches: group.applications.size,
        variants: variantKeys.length,
      };
    })
    .filter((t) => t.people > 0)
    .sort((a, b) => b.people - a.people || b.vouches - a.vouches || a.name.localeCompare(b.name));
}

/**
 * The house's published view of which tags describe PEOPLE rather than notes
 * (kind-30394 Trusted Lists, signed by the current assistant key).
 *
 * A hint, never a gate — the protocol is explicit that readers must not require
 * it, nor treat its absence as "not applicable". We use it only to decide what
 * the picker shows first. Returns an empty set when unpublished or unreachable,
 * which degrades to "no opinion about ordering".
 */
export async function fetchProfileApplicableTags(): Promise<Set<string>> {
  try {
    const lists = await fetchApplicabilityLists({
      fetchEvents: fetchTrustEvents,
      houseAssistantPubkey: LOCAL_TA_PUBKEY,
    });
    return lists.pubkey;
  } catch {
    return new Set();
  }
}

/** The a-coordinate an applicability list would name this tag by. */
export function tagCoordinate(tag: { authorPubkey: string; slug: string }): string {
  return `39999:${tag.authorPubkey}:${tag.slug}`;
}

/**
 * What a "tag a person" picker offers: the tags people actually use.
 *
 * Applicability is defined by the protocol as **HINT ∪ USAGE** — "the operative
 * applicability source is derived, not declared" — and our catalogue is built
 * entirely from profile taggings, so **every tag in it is already applicable by
 * usage**. The published hint therefore adds nothing here and must not reorder
 * it: sorting by the hint buried `AOS 2026 Participant` (88 people) under tags
 * with three, because only 9 of 39 carry it.
 *
 * We also tried the other half of the union — hinted tags nobody has applied
 * yet, as the cold-start signal the hint exists for. Dropped: the house's list
 * of 13 includes `jumble-qa-profile-1784946392` and `test account`, so it put
 * harness output straight into the picker for the sake of one real unused tag.
 * Nothing is lost by leaving them out, because typing an existing tag's name
 * still reuses it via `resolveOrMintTag` — the picker just doesn't advertise
 * tags with no track record.
 *
 * The hint becomes load-bearing when we tag NOTES, where a people-derived
 * catalogue gives no signal at all. That's the seam this function marks.
 */
export async function fetchPickerTags(): Promise<TagSummary[]> {
  return fetchTagIndex();
}

/**
 * Filter the catalogue by what someone typed. Exact match first, then
 * starts-with, then contains — inside each band the catalogue's own
 * usage ordering carries through.
 */
export function matchTags(index: TagSummary[], query: string, max = 5): TagSummary[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const band = (t: TagSummary) => {
    const n = t.name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.includes(q)) return 2;
    return 3;
  };
  return index
    .map((t) => ({ t, b: band(t) }))
    .filter((x) => x.b < 3)
    .sort((x, y) => x.b - y.b)
    .slice(0, max)
    .map((x) => x.t);
}

// ─── Writing (floor B: yourself only) ────────────────────────────────────────

/**
 * Find an existing tag-element for a name, so we apply the tag everyone else is
 * already using instead of minting a private duplicate.
 *
 * This matters more than it looks. A tag's identity is `39999:<author>:<slug>`,
 * so if two people each mint "Author", they are two unrelated tags and the
 * counts never add up. The live hub shows the ecosystem converging the right
 * way — `verified-human` is authored once and asserted by several different
 * people — and that only keeps working if clients reuse.
 *
 * When several authors have minted the same slug we take the BEST-SUPPORTED one
 * — the variant the most people have actually applied — falling back to the
 * oldest on a tie so the choice stays deterministic across clients that never
 * talk to each other. Picking by age alone would keep sending new taggings to a
 * dead original while everyone else converged somewhere better.
 *
 * Returns a mint spec (`{ name }`) when the tag genuinely doesn't exist yet.
 */
export async function resolveOrMintTag(
  name: string,
  description?: string,
): Promise<{ authorPubkey: string; slug: string; eventId: string } | { name: string; description?: string }> {
  const slug = toSlug(name);
  if (!slug) throw new Error("Give the tag a name.");

  let existing: NostrEvent[] = [];
  try {
    existing = await fetchTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      "#d": [slug],
      "#z": Z_HANDLE_PUBKEYS.map(conceptTag),
    });
  } catch {
    // Discovery is best-effort. If the hub is unreachable we'd rather mint a
    // tag that may duplicate than block the user entirely.
  }

  const candidates = existing
    .filter((ev) => tagValue(ev, "d") === slug)
    .sort((a, b) => a.created_at - b.created_at); // oldest first = the tiebreak

  if (!candidates.length) return { name, description };
  if (candidates.length === 1) {
    return { authorPubkey: candidates[0].pubkey, slug, eventId: candidates[0].id };
  }

  // Several authors minted this name. One extra query — not one per candidate —
  // tells us which is actually in use.
  const usage = new Map<string, number>();
  try {
    // Union again: a candidate's usage may be recorded against its coordinate
    // or its event id, and picking the "best-supported" from half the evidence
    // would just pick the one that happens to use the newer shape.
    const [byCoord, byId] = await Promise.all([
      fetchTagEvents({
        kinds: [TAG_ELEMENT_KIND],
        "#a": candidates.map((ev) => `39999:${ev.pubkey}:${slug}`),
        "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
      }),
      fetchTagEvents({
        kinds: [TAG_ELEMENT_KIND],
        "#e": candidates.map((ev) => ev.id),
        "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
      }),
    ]);
    const merged = new Map<string, NostrEvent>();
    for (const ev of [...byCoord, ...byId]) merged.set(ev.id, ev);
    for (const a of await normalizeAssertions(Array.from(merged.values()))) {
      if (a.stance !== "apply") continue;
      const k = `${a.tagAuthor}|${a.asserter}|${a.target}`;
      if (!usage.has(k)) usage.set(k, 1);
    }
  } catch {
    // Fall through to the oldest — a ranking we couldn't compute is not a
    // reason to block the user from tagging.
  }
  const score = (pubkey: string) =>
    Array.from(usage.keys()).filter((k) => k.startsWith(`${pubkey}|`)).length;

  const best = [...candidates].sort(
    (a, b) => score(b.pubkey) - score(a.pubkey) || a.created_at - b.created_at,
  )[0];
  return { authorPubkey: best.pubkey, slug, eventId: best.id };
}

export interface ApplyTagArgs {
  /** Reuse an existing tag, or mint a new one by name. */
  tag: { authorPubkey: string; slug: string; eventId?: string | null } | { name: string; description?: string };
  targetPubkey: string;
  /** +1 applies, -1 disputes. */
  polarity?: Polarity;
}

/**
 * Apply (or dispute) a tag on a pubkey as the signed-in user.
 *
 * Floor B calls this only with `targetPubkey === the signed-in user`; the guard
 * lives in the UI, not here, so floor C can widen it without touching this file.
 *
 * Minting a new tag is two publishes (tag-element, then assertion) and cannot be
 * atomic — the assertion's provenance needs the tag-element's signed id. If the
 * second step fails the SDK reports it in `failedAt` and the tag-element remains
 * as a reusable orphan; the caller should surface that rather than claim success.
 */
export async function applyTagToProfile({
  tag,
  targetPubkey,
  polarity = 1,
}: ApplyTagArgs): Promise<ApplyProfileTaggingResult> {
  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Sign in to tag.");

  return applyProfileTagging({
    tagInput: tag,
    targetPubkey,
    polarity,
    asserterPubkey: user.pubkey,
    zHandlePubkeys: Z_HANDLE_PUBKEYS,
    deps: {
      sign: signEventLocally,
      publish: publishTagEvent,
      now: () => Math.floor(Date.now() / 1000),
      buildTagElement,
    },
  });
}

/**
 * Predict the key `fetchProfileTags` will return for a tag the current user is
 * about to mint, so an optimistic chip can be keyed identically to the real one
 * and get replaced rather than duplicated when the refetch lands.
 */
export function predictedTagKey(name: string, asserterPubkey: string): string {
  return `${asserterPubkey}|${toSlug(name)}`;
}

/** The applicability hint stamped on tags born tagging a person. */
export { TAG_FOR_NOSTR_PUBKEY_Z };
