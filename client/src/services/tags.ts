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
  publishToRelays,
  PROFILE_RELAYS,
} from "./nostr";
import { resolveHouseObserver, resolveTrustSource } from "./trustSource";
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
import {
  applicabilityHintFilter,
  applyEventTagging,
  buildTagElement,
  classifyEventTaggings,
  conceptNostrEventTag,
  conceptTag,
  deriveApplicabilityMembers,
  filterTaggingHeadersForTag,
  filterTagsAppliedToEvent,
  groupTaggingsByTarget,
  slug as toSlug,
} from "@/lib/tagging-sdk/event-tagging/index.js";
import { countNameCollisions, type CountedTag } from "@/lib/tagMerge";
import { stanceOnlyRefs } from "@/lib/tagCounts";
import { buildTagPin, conceptTagPinning, tagRefFromPin } from "@/lib/tagPins";
import {
  LOCAL_TA_PUBKEY,
  tagRelays,
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
   * How many separately-minted tag identities carry this display name. 1 is the
   * normal case; >1 means different authors created a tag with the same name and
   * each is listed on its own, with its own count. Labelling only — it never
   * affects the arithmetic.
   */
  sharesName: number;
  /** The viewer's own stance, shown regardless of whether the POV counts them. */
  myStance?: "apply" | "dispute";
  /**
   * Unix seconds of the newest assertion APPLYING this tag. Powers "what's new
   * since I last looked" on the dashboard; 0 when nothing applies it (a tag
   * surviving only on the viewer's dispute).
   */
  addedAt: number;
}

export interface ProfileTagsResult {
  /** Trust-filtered, ordered by support. What the chip row renders. */
  tags: ProfileTag[];
  /**
   * The viewer's own stances, trust-unfiltered. A tag you just applied must
   * never appear to vanish because the current POV doesn't count you.
   */
  mine: Array<{ key: string; stance: "apply" | "dispute" }>;
  /** The trust source told us nothing — these counts weren't filtered. */
  trustUnverified: boolean;
  /**
   * The VIEWER has no published trust score, so their own taggings count for
   * nobody but themselves.
   *
   * Since #41 B1 an unscored asserter is filtered out, and most accounts are
   * unscored — 90 of the 105 on the live hub. Their tag still renders for them
   * (`mine` is read before the predicate) but at zero support, which looks
   * exactly like "nobody has agreed yet" and means something completely
   * different. Surfaces that show a viewer their OWN tags use this to say so.
   *
   * False for logged-out visitors: there's no "your" tag to caveat.
   */
  viewerUnscored: boolean;
}

const TAG_ELEMENT_KIND = 39999;

// ─── Relay I/O ───────────────────────────────────────────────────────────────

/**
 * Tag reads: the hub ∪ the user's read relays. Kept separate from the trust
 * reader below — the house's TA-signed artifacts are not on the hub.
 */
function fetchTagEvents(filter: Record<string, unknown>): Promise<NostrEvent[]> {
  return fetchEventsByFilter(filter, tagRelays()) as Promise<NostrEvent[]>;
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
 * How many trust assertions have come back so far. Read as a delta around an
 * `ensure()` to tell "the house scored these people" from "we learned nothing
 * about them".
 *
 * Since the policy flipped to "unscored does not count" (issue #41 B1), those
 * two cases are no longer indistinguishable in the counts — they're
 * indistinguishable in the EMPTINESS. A dead trust relay and a person nobody
 * reputable has tagged both render as no tags, and only this counter can tell
 * them apart.
 */
let trustEventsSeen = 0;

/**
 * Trust reads go to the relay the OBSERVER'S OWN kind-10040 names — not to a
 * relay this module picked. Pointing it anywhere else means the fetch succeeds,
 * finds nothing, and every asserter fails the predicate, so every tag on the
 * site disappears. Silent and total, which is why `trustEventsSeen` exists.
 */
function makeTrustFetcher(relay: string) {
  return async (filter: Record<string, unknown>): Promise<NostrEvent[]> => {
    const events = (await fetchEventsByFilter(filter, [relay])) as NostrEvent[];
    trustEventsSeen += events.length;
    return events;
  };
}

/**
 * Publish to (tag hub ∪ the author's own write relays), per the kit's routing
 * rule. We can't use `publishToRelays()` from nostr.ts here: it ignores its
 * `relays` argument and always resolves the author's outbox seeded with
 * PROFILE_RELAYS, so a tag event would never reach the hub. Seeding
 * `loadOutboxRelayListFromDb` with the tag relays gives exactly the union we want.
 */
async function publishTagEvent(
  signed: Record<string, unknown>,
): Promise<{ accepted: number; total: number }> {
  const relays = loadOutboxRelayListFromDb(signed.pubkey as string, tagRelays());
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
 * One trust source per OBSERVER, cached for the session.
 *
 * Keyed by observer because the answer genuinely differs per perspective — that
 * is the entire point of NIP-85 and of the Brainstorm / My-perspective toggle.
 * The same asserter can be rank 100 to one observer's assistant and unknown to
 * another's; measured on the live corpus, one account is rated 11, 26 and 100 by
 * three different assistants.
 *
 * Each entry keeps the SDK's own 30382 cache alive across profile views, so we
 * only ever fetch the asserters we actually encountered.
 */
const trustSources = new Map<string, ReturnType<typeof createHouseTrustSource>>();

/**
 * The trust source for one observer, built from the relay + TA their own
 * kind-10040 names.
 *
 * `null` means "count everyone" — an operator choice via `mode`, not a
 * degradation. `undefined` means we could not resolve this observer at all;
 * callers treat that as untrusted-and-say-so, never as a free pass.
 */
async function getTrustSource(
  observerPubkey: string | undefined,
): Promise<ReturnType<typeof createHouseTrustSource> | null | undefined> {
  if (TRUST_SETTINGS.mode !== "house-ta") return null;
  if (!observerPubkey) return undefined;

  const cached = trustSources.get(observerPubkey);
  if (cached) return cached;

  const ref = await resolveTrustSource(observerPubkey);
  if (!ref) return undefined;

  const source = createHouseTrustSource({
    fetchEvents: makeTrustFetcher(ref.relay),
    assertionAuthorPubkeys: [ref.taPubkey],
    minRank: TRUST_SETTINGS.minRank,
    maxHops: TRUST_SETTINGS.maxHops,
    unknownPolicy: TRUST_SETTINGS.unknownPolicy,
  });
  trustSources.set(observerPubkey, source);
  return source;
}

/**
 * Which observer's perspective a read runs from.
 *
 * `"house"` is the logged-out / Brainstorm view — resolved by asking the server
 * who it is (NIP-05 `_`), never hardcoded here. A hex pubkey is a specific
 * observer, normally the signed-in viewer in personalized mode.
 */
export type TrustObserver = "house" | string;

async function observerPubkeyFor(observer: TrustObserver): Promise<string | undefined> {
  if (observer !== "house") return observer;
  return (await resolveHouseObserver()) ?? undefined;
}

/** A POV predicate, plus whether the house actually had anything to say. */
interface ResolvedTrust {
  predicate: TrustPredicate;
  /**
   * True when we asked about asserters and learned nothing about any of them —
   * unreachable trust relays, or a POV with no published scores.
   *
   * Under the current policy that means everything got filtered out, so the
   * surface goes EMPTY. An empty tag list reads as a fact about the person
   * ("nobody has tagged them"), which is why this flag has to reach the empty
   * states: silence and "we couldn't check" must not look the same. C7 asks
   * that this degrade quietly rather than error; it does not ask that we imply
   * the filter ran.
   */
  unverified: boolean;
}

/**
 * Resolve the POV predicate for a set of asserters, from `observer`'s point of
 * view. Never throws: an unreachable relay leaves those pubkeys uncached in the
 * SDK, and they then fail the predicate rather than passing it — so the caller
 * gets an empty result and has to say why, via `unverified`.
 */
async function resolveTrust(
  asserters: string[],
  observer: TrustObserver = "house",
): Promise<ResolvedTrust> {
  const observerPubkey = await observerPubkeyFor(observer);
  let source = await getTrustSource(observerPubkey);

  // A signed-in viewer who has never activated has no assistant, so no
  // perspective to compute from. Fall back to the HOUSE view rather than to
  // "count everyone" — a missing declaration is not a reason to trust
  // strangers, and it's the difference between "we don't know you yet" and
  // "the filter is off".
  if (source === undefined && observer !== "house") {
    const housePubkey = await observerPubkeyFor("house");
    source = await getTrustSource(housePubkey);
  }

  // "Everyone counts" is a POV the operator chose, not a degraded one.
  if (source === null) return { predicate: trustEveryone(), unverified: false };

  // Nobody left to ask. Trust nothing, and set the flag so the surface says
  // "couldn't check" instead of rendering an empty list as a fact.
  if (!source) return { predicate: () => false, unverified: true };

  await source.ensure(asserters);
  // The predicate alone can't distinguish "checked, and none of them qualify"
  // from "never got an answer" — both are just `false`. What it can't hide is
  // that the trust source handed us nothing at all this session, which happens
  // when the resolved relay is unreachable, or when a 10040 points somewhere
  // that carries no kind-30382.
  return {
    predicate: source.predicate,
    unverified: asserters.length > 0 && trustEventsSeen === 0,
  };
}

// ─── Tag-element cache ───────────────────────────────────────────────────────

/**
 * Tag-elements, cached for the session. ACCEPTANCE C1 asks that "repeat reads
 * hit the cache, not the relay", and without this two profiles carrying the
 * same tag each re-fetched its element: the catalogue read alone resolves every
 * tag in the corpus, then every profile view resolved its own again.
 *
 * Both caches are POSITIVE ONLY. A miss is not cached, because an element the
 * relay doesn't have yet is exactly what someone minting a tag creates a second
 * later — negative caching would hide their own new tag from them for the rest
 * of the session. Elements are immutable at a given id, and a coordinate's
 * name/description changing is a cosmetic staleness we accept until reload.
 */
const elementsById = new Map<string, TagRefResolved>();
const elementMetaByCoord = new Map<string, { name: string; description?: string }>();

/**
 * Drop every cached read. Called when the tag-relay list changes — the caches
 * are keyed by event id and coordinate, neither of which says which relay the
 * answer came from, so pointing at a different instance has to start clean.
 */
export function resetTagCaches(): void {
  elementsById.clear();
  elementMetaByCoord.clear();
  headersByCoord.clear();
  trustSources.clear();
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
    if (!e) continue;
    const cached = elementsById.get(e);
    if (cached) byEventId.set(ev.id, cached);
    else needElement.add(e);
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
    for (const el of elements) {
      const d = tagValue(el, "d");
      if (!d) continue;
      elementsById.set(el.id, { tagAuthor: el.pubkey, slug: d });
      // We are holding the whole element, so bank its name/description too.
      // `resolveTagNames` would otherwise re-fetch the same events by
      // coordinate — cheap when the catalogue was 34 entries, a query over
      // hundreds of slugs now that it carries everything.
      cacheElementMeta(el.pubkey, d, el.content);
    }
    for (const ev of candidates) {
      if (byEventId.has(ev.id)) continue;
      const resolved = elementsById.get(tagValue(ev, "e") ?? "");
      if (resolved) byEventId.set(ev.id, resolved);
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
 * Which of these pubkeys have a PUBLISHED trust score?
 *
 * Related to the trust predicate but not the same question, and it stays
 * separate now that the predicate rejects unscored keys too. The predicate
 * answers "does this asserter's vote count"; this answers "has the house said
 * anything at all about this key" — which is what BROWSE needs, because a tag
 * whose creator nobody has heard of should be findable-but-labelled rather than
 * silently promoted. Keeping them apart is also what lets a tag survive an
 * unknown creator when reputable people have applied it.
 *
 * Used to gate what appears in BROWSE surfaces. See `fetchTagIndex`.
 *
 * Reads the same resolved source as the predicate, so "known" and "counts" are
 * answers from ONE perspective. Asking two different scoreboards would let a tag
 * be labelled "unknown creator" while that creator's assertions were counting.
 */
async function fetchScoredPubkeys(
  pubkeys: string[],
  observer: TrustObserver = "house",
): Promise<Set<string>> {
  const unique = Array.from(new Set(pubkeys.filter(Boolean)));
  if (!unique.length) return new Set();

  const ref = await resolveTrustSource((await observerPubkeyFor(observer)) ?? "");
  // No resolvable source → nobody is "known". Browse falls back to labelling
  // creators as unverified, which is the honest read when we can't check.
  if (!ref) return new Set();
  const readTrust = makeTrustFetcher(ref.relay);

  const scored = new Set<string>();
  // Chunked to keep the filter under what relays accept, same as the SDK's own
  // trust reader.
  for (let i = 0; i < unique.length; i += 100) {
    try {
      const events = await readTrust({
        kinds: [30382],
        authors: [ref.taPubkey],
        "#d": unique.slice(i, i + 100),
      });
      for (const ev of events) {
        const d = tagValue(ev, "d");
        if (d) scored.add(d);
      }
    } catch {
      // Can't tell → don't hide anyone. A trust relay outage must not empty the
      // catalogue; the failure mode is a noisier page, not a blank one.
      return new Set(unique);
    }
  }
  return scored;
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
        addedAt: 0,
      });
    }
    const grp = counted.get(a.tagKey)!;

    // The subject's own voice is FLAGGED but still counted. The kit's rule is
    // "count per p target (trust-filtered, net apply−dispute > 0)" with no self
    // exclusion, and ACCEPTANCE C1 requires our net to match the reference
    // instance's — so dropping the subject's own assertion put us one behind
    // Jumble on every self-tagged person. The flag survives because
    // self-declaration really is a different kind of claim; that distinction
    // belongs in the label, not in the arithmetic.
    if (a.asserter === a.target) {
      if (a.stance === "apply") grp.selfApplied = true;
      else grp.selfDisputed = true;
    }
    if (a.stance === "apply" && a.at > grp.addedAt) grp.addedAt = a.at;
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
    // Flagged, not excluded — see the note in groupByTag. The tag page's counts
    // have to agree with the profile chips and with the reference instance.
    if (a.asserter === a.target) {
      if (a.stance === "apply") grp.selfApplied = true;
      else grp.selfDisputed = true;
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
/**
 * Park a tag-element's display metadata under its coordinate. Shared by the
 * two paths that end up holding an element event, so neither has to re-fetch
 * what the other already had.
 */
function cacheElementMeta(authorPubkey: string, slug: string, content: string) {
  try {
    const parsed = JSON.parse(content) as { tag?: { name?: string; description?: string } };
    if (parsed?.tag?.name) {
      elementMetaByCoord.set(`${authorPubkey}|${slug}`, {
        name: parsed.tag.name,
        description: parsed.tag.description,
      });
    }
  } catch {
    // malformed content → callers fall through to the slug
  }
}

async function resolveTagNames(
  refs: Array<{ authorPubkey: string; slug: string }>,
): Promise<Map<string, { name: string; description?: string }>> {
  const out = new Map<string, { name: string; description?: string }>();
  if (!refs.length) return out;

  // Serve what we already know, and only ask the relay about the rest. All
  // cached → no query at all, which is the C1 property.
  const unresolved: Array<{ authorPubkey: string; slug: string }> = [];
  for (const r of refs) {
    const key = `${r.authorPubkey}|${r.slug}`;
    const hit = elementMetaByCoord.get(key);
    if (hit) out.set(key, hit);
    else unresolved.push(r);
  }
  if (!unresolved.length) return out;

  // Chunked by slug. The catalogue now carries every tag anyone has used, so
  // an unchunked filter would ask for hundreds of `#d` values in one REQ —
  // past what some relays accept, and a rejection here would blank every name
  // on the page.
  const slugs = Array.from(new Set(unresolved.map((r) => r.slug)));
  const authors = Array.from(new Set(unresolved.map((r) => r.authorPubkey)));
  for (let i = 0; i < slugs.length; i += 200) {
    let events: NostrEvent[] = [];
    try {
      events = await fetchTagEvents({
        kinds: [TAG_ELEMENT_KIND],
        authors,
        "#d": slugs.slice(i, i + 200),
      });
    } catch {
      continue; // names are cosmetic; slugs carry the meaning
    }
    for (const ev of events) {
      const d = tagValue(ev, "d");
      if (!d) continue;
      cacheElementMeta(ev.pubkey, d, ev.content);
      const key = `${ev.pubkey}|${d}`;
      const meta = elementMetaByCoord.get(key);
      if (meta) out.set(key, meta);
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
  observer: TrustObserver = "house",
): Promise<ProfileTagsResult> {
  const candidates = await fetchTagEvents(
    filterTagsAppliedToPubkey({ targetPubkey, zHandlePubkeys: Z_HANDLE_PUBKEYS }),
  );
  if (!candidates.length)
    return { tags: [], mine: [], trustUnverified: false, viewerUnscored: false };

  const assertions = await normalizeAssertions(candidates);
  // The viewer joins the asserter set even when they've tagged nobody here, so
  // the predicate can answer "do this person's taggings count" for `viewerUnscored`.
  const asserters = new Set(assertions.map((a) => a.asserter));
  if (viewerPubkey) asserters.add(viewerPubkey);
  const trust = await resolveTrust(Array.from(asserters), observer);
  const { counted, mine } = groupByTag(assertions, trust.predicate, viewerPubkey);

  // `counted` is trust-filtered; `mine` is not. A tag only the viewer applied,
  // under a POV that doesn't count them, is in `mine` and NOT in `counted` — so
  // iterating `counted` alone makes the viewer's own action disappear. Floor B
  // is explicit that it must stay visible ("dimmed/struck, not vanished"), so
  // the viewer's stance INTRODUCES a zero-support entry rather than only
  // annotating an existing one.
  for (const tagKey of mine.keys()) {
    if (counted.has(tagKey)) continue;
    const sep = tagKey.indexOf("|");
    counted.set(tagKey, {
      authorPubkey: tagKey.slice(0, sep),
      slug: tagKey.slice(sep + 1),
      applications: new Set(),
      disputes: new Set(),
      selfApplied: false,
      selfDisputed: false,
      addedAt: 0,
    });
  }

  const names = await resolveTagNames(Array.from(counted.values()));

  // Each minted identity stands on its own — see lib/tagMerge.ts for why the
  // merge is off. `sharesName` only labels a collision; it changes no count.
  const sharesName = countNameCollisions(counted, names);

  const tags: ProfileTag[] = Array.from(counted.entries())
    .map(([key, group]) => ({
      key,
      authorPubkey: group.authorPubkey,
      slug: group.slug,
      name: names.get(key)?.name || group.slug,
      description: names.get(key)?.description,
      applications: group.applications.size,
      disputes: group.disputes.size,
      asserters: Array.from(group.applications),
      selfDeclared: group.selfApplied,
      subjectDisagreed: group.selfDisputed,
      counted: netPositive(group.applications.size, group.disputes.size),
      sharesName: sharesName.get(key) ?? 1,
      myStance: mine.get(key),
      addedAt: group.addedAt,
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
    trustUnverified: trust.unverified,
    // Suppressed when the trust source said nothing at all: we'd be telling
    // someone their account doesn't count on the strength of a failed lookup.
    viewerUnscored: !!viewerPubkey && !trust.unverified && !trust.predicate(viewerPubkey),
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

/**
 * Did this tag turn out to exist?
 *
 * `"ok"`        — real: a tag-element resolved, or people have applied it.
 * `"absent"`    — checked, and there is nothing here. The URL was invented.
 * `"unavailable"` — the relays didn't answer. NOT the same as absent, and the
 *                 difference is the whole point: 404-ing on a flaky relay would
 *                 tell people a real tag doesn't exist.
 */
export type TagDetailStatus = "ok" | "absent" | "unavailable";

export interface TagDetail {
  /**
   * Whether the tag exists. Callers MUST branch on this before rendering
   * anything derived from the URL.
   *
   * Issue #41 B3: this read used to always succeed, synthesizing an identity
   * from the path — so `/tags/<any npub>/<any string>` rendered a complete,
   * branded page whose headline was the attacker's string and whose byline read
   * "Tag created by <that npub's real display name>", linked to their profile.
   * No account, no signing key, and nothing on a relay to take down.
   */
  status: TagDetailStatus;
  tag: TagIdentity;
  /**
   * The tag-element's event id. Only a pin needs it — the spec's dual reference
   * pins the version seen at pin-time via `e` while tracking the tag through
   * edits via `a`. Empty when the element didn't resolve.
   */
  elementId: string;
  /** Net-positive carriers — the Floor D list, "net > 0 only". */
  carriers: TagCarrier[];
  /**
   * Carriers the network voted DOWN: more disputes than applies.
   *
   * Kept separate rather than dropped. "Hidden, not deleted" is the honest
   * shape for a public claim someone disagreed with — you can look at what was
   * disputed away and by whom — and it keeps `carriers` exactly what Floor D
   * specifies, so the acceptance box is unaffected.
   */
  disputed: TagCarrier[];
  /** The trust source told us nothing — this list wasn't filtered. */
  trustUnverified: boolean;
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
  observer: TrustObserver = "house",
): Promise<TagDetail> {
  // The tag-element, for its name AND its event id — assertions that predate
  // the `a` correction reference the tag only by that id.
  //
  // Whether this read FAILED or merely found nothing has to survive: swallowing
  // the throw made "no such tag" and "relay unreachable" the same code path, and
  // that is what let an invented URL render as a real page (B3).
  let elements: NostrEvent[] = [];
  let elementLookupFailed = false;
  try {
    elements = await fetchTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      authors: [authorPubkey],
      "#d": [slug],
    });
  } catch {
    elementLookupFailed = true;
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
  //
  // These reads catch too, and for the same reason as the element read above: a
  // throw escaping here would surface as a generic query error, and the page's
  // "can't load this tag" state would never be reached. A failure and an empty
  // result must stay distinguishable all the way out of this function.
  const elementIds = elements.map((el) => el.id);
  let assertionLookupFailed = false;
  const swallow = async (p: Promise<NostrEvent[]>) => {
    try {
      return await p;
    } catch {
      assertionLookupFailed = true;
      return [] as NostrEvent[];
    }
  };
  const [byCoord, byElementId] = await Promise.all([
    swallow(
      fetchTagEvents(
        filterProfileTaggingsUsingTag({
          tagAuthorPubkey: authorPubkey,
          slug,
          zHandlePubkeys: Z_HANDLE_PUBKEYS,
        }),
      ),
    ),
    elementIds.length
      ? swallow(
          fetchTagEvents({
            kinds: [TAG_ELEMENT_KIND],
            "#e": elementIds,
            "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
          }),
        )
      : Promise.resolve([] as NostrEvent[]),
  ]);

  const deduped = new Map<string, NostrEvent>();
  for (const ev of [...byCoord, ...byElementId]) deduped.set(ev.id, ev);

  if (!deduped.size) {
    /**
     * Nothing applies this tag. Whether that means "invented URL" or "real tag,
     * nobody has used it yet" is decided by the ELEMENT, not by the assertions:
     * minting a tag and applying it are separate acts, and a freshly minted tag
     * legitimately has no carriers.
     *
     * Requiring BOTH signals — no element AND no assertions — before calling it
     * absent is deliberate. An element that never propagated to our relay set,
     * on a tag people have genuinely applied, would otherwise 404 a real page.
     */
    const status: TagDetailStatus = element
      ? "ok"
      : elementLookupFailed || assertionLookupFailed
        ? "unavailable"
        : "absent";
    return {
      status,
      tag,
      elementId: element?.id ?? "",
      carriers: [],
      disputed: [],
      trustUnverified: false,
    };
  }

  // Only assertions for THIS tag — the relays filtered, but a permissive one
  // could hand back more and we'd rather not list strangers.
  const assertions = (await normalizeAssertions(Array.from(deduped.values()))).filter(
    (a) => a.tagAuthor === authorPubkey && a.slug === slug,
  );

  const trust = await resolveTrust(Array.from(new Set(assertions.map((a) => a.asserter))), observer);
  const byTarget = groupByTarget(assertions, trust.predicate);

  // The viewer's own stance per person, read BEFORE the trust filter — the same
  // rule as the profile chips. Someone must always be able to see what they
  // themselves said, whatever the POV makes of them.
  const myStanceFor = new Map<string, "apply" | "dispute">();
  if (viewerPubkey) {
    for (const a of assertions) {
      if (a.asserter === viewerPubkey) myStanceFor.set(a.target, a.stance);
    }
  }

  // Same rule as the profile chips: `byTarget` is trust-filtered, `myStanceFor`
  // is not, so someone the viewer alone tagged would be missing entirely. The
  // viewer's stance introduces the row; the net rule below still decides
  // whether it reads as carried.
  for (const target of myStanceFor.keys()) {
    if (byTarget.has(target)) continue;
    byTarget.set(target, {
      applications: new Set(),
      disputes: new Set(),
      selfApplied: false,
      selfDisputed: false,
      addedAt: 0,
    });
  }

  // NO gate of any kind here. ACCEPTANCE Floor D specifies this list as
  // "tagged people listed (net > 0 only)" and adds no other condition, so an
  // extra one would put our carrier list out of agreement with the reference
  // instance. Discovery filtering belongs on `fetchTagIndex`; a direct link to
  // a tag page must always resolve, which is exactly what the reference client
  // promises too.
  const byVouches = (a: TagCarrier, b: TagCarrier) =>
    b.applications - a.applications ||
    a.disputes - b.disputes ||
    // Ties break on pubkey so the order is stable across refetches.
    a.pubkey.localeCompare(b.pubkey);

  const all: TagCarrier[] = Array.from(byTarget.entries()).map(([pubkey, grp]) => ({
    pubkey,
    applications: grp.applications.size,
    disputes: grp.disputes.size,
    asserters: Array.from(grp.applications),
    selfDeclared: grp.selfApplied,
    subjectDisagreed: grp.selfDisputed,
    myStance: myStanceFor.get(pubkey),
    addedAt: grp.addedAt,
  }));

  // Vouched-for people, plus people who put the tag on themselves, plus anyone
  // the viewer has a stance on — same "never silently vanish" rule the profile
  // chips follow.
  const carriers = all
    .filter((c) => netPositive(c.applications, c.disputes) || c.selfDeclared || !!c.myStance)
    .sort(byVouches);

  // Voted down, and not rescued by one of the rules above. Surfaced separately
  // so the page can offer them rather than pretend they were never claimed.
  const shown = new Set(carriers.map((c) => c.pubkey));
  const disputed = all.filter((c) => !shown.has(c.pubkey)).sort(byVouches);

  // People have applied it, so it exists whether or not its element reached us.
  return {
    status: "ok",
    tag,
    elementId: element?.id ?? "",
    carriers,
    disputed,
    trustUnverified: trust.unverified,
  };
}

// ─── The catalogue ───────────────────────────────────────────────────────────

/** One tag in the catalogue, with how much use it's actually seen. */
export interface TagSummary extends TagIdentity {
  key: string;
  /** Distinct people carrying this tag. */
  people: number;
  /** Distinct trusted asserters who applied it to somebody. */
  vouches: number;
  /** Other separately-minted identities sharing this name. Labelling only. */
  sharesName: number;
  /**
   * The network has published nothing about whoever created this tag — so we
   * can't tell a newcomer from a throwaway key.
   *
   * A flag, NOT an exclusion. Surfaces that show an unrequested LIST (the
   * browse page with no filter typed, the picker's suggestions) leave these
   * out; surfaces answering a QUERY somebody typed include them, labelled.
   * See `fetchTagIndex`.
   */
  unverified: boolean;
}

/**
 * Every tag anyone actually uses, most-used first — the BROWSE surface.
 *
 * Deliberately derived from ASSERTIONS rather than from the tag-element list.
 * The hub holds 1902 elements of which only ~64 are real; the rest is
 * QA-harness output (`wysiwyg-s17-1785898945945-…`). Listing what people have
 * actually tagged excludes most of that for free, and gives real counts as a
 * by-product — which is also what ranks search results.
 *
 * ## Why tag CREATORS are held to a higher bar than counting holds anyone
 *
 * Minting a tag is free and permissionless, so throwaway keys flood the
 * catalogue — `jumble-qa-profile-…`, `test-account` and friends are all real
 * entries on the hub right now. Usage alone doesn't filter them, because the
 * harness applies them too: measured 2026-08-07, 35 junk tags carry 5 distinct
 * asserters each while genuinely-used tags like `tunestr-community` (28
 * people) and `urbit` (7) carry ONE. Any threshold that admits the real ones
 * admits ninety fakes. That door is closed; creator standing is what's left.
 *
 * So a tag whose creator has no **published trust score** is marked
 * `unverified` — the reference client's rule, adopted deliberately, replacing
 * an earlier invention of ours that gated on the TAGGED person having a
 * kind-0 (wrong axis: spam economics are about who mints).
 *
 * ## Marked, not dropped — the list/query split
 *
 * This function no longer hides them, because hiding proved too blunt. `lfo`
 * is the second most-used tag on the hub (54 people, behind only
 * `aos-2026-participant`) and its creator is unscored, so it was invisible to
 * browse, to all three search boxes AND to the tag picker — where "LFO" then
 * offered "Create tag" for something 54 people already carry.
 *
 * The rule that replaces it: **gate the list, never the query.** Junk fills a
 * page nobody asked for; it cannot fill a name somebody typed. So callers
 * showing an unrequested list filter `unverified` out, and callers answering
 * a typed query keep them and label them. That also puts us back on the kit's
 * own default — `Start.md` Q5 recommends "full client-side search over all
 * existing protocol tags", with curation flagged as something to "confirm
 * deliberately".
 *
 * Unchanged: a tag's page still opens from a direct link (`fetchTagDetail`
 * applies no gate), taggings still render on profiles and notes, the viewer's
 * own tags are never marked, and a tag stops being `unverified` on its own the
 * moment a score is published — nothing gets republished.
 *
 * Anonymous-safe like every read here.
 */
export async function fetchTagIndex(
  viewerPubkey?: string,
  observer: TrustObserver = "house",
): Promise<TagSummary[]> {
  const candidates = await fetchAllTagEvents({
    kinds: [TAG_ELEMENT_KIND],
    "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
  });
  if (!candidates.length) return [];

  const assertions = await normalizeAssertions(candidates);
  const trust = await resolveTrust(Array.from(new Set(assertions.map((a) => a.asserter))), observer);
  const scoredCreators = await fetchScoredPubkeys(
    Array.from(new Set(assertions.map((a) => a.tagAuthor))),
  );

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
    if (!trust.predicate(a.asserter)) continue;
    if (!counted.has(a.tagKey)) {
      counted.set(a.tagKey, {
        authorPubkey: a.tagAuthor,
        slug: a.slug,
        applications: new Set(),
        disputes: new Set(),
        selfApplied: false,
        selfDisputed: false,
        addedAt: 0,
      });
    }
    const grp = counted.get(a.tagKey)!;

    const ck = `${a.tagKey}|${a.target}`;
    if (!perCarrier.has(ck)) {
      perCarrier.set(ck, { applies: new Set(), disputes: new Set(), selfApplied: false });
    }
    const c = perCarrier.get(ck)!;

    // Flagged, not excluded — see the note in groupByTag. A self-assertion is
    // one distinct asserter like any other, which is what keeps this catalogue
    // agreeing with the profile chips and with the reference instance.
    if (a.asserter === a.target) {
      if (a.stance === "apply") {
        grp.selfApplied = true;
        c.selfApplied = true;
      } else {
        grp.selfDisputed = true;
      }
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

  const sharesName = countNameCollisions(counted, names);

  return Array.from(counted.entries())
    .map(([key, group]) => ({
      key,
      authorPubkey: group.authorPubkey,
      slug: group.slug,
      name: names.get(key)?.name || group.slug,
      description: names.get(key)?.description,
      people: (people.get(key) ?? new Set()).size,
      vouches: group.applications.size,
      sharesName: sharesName.get(key) ?? 1,
      // Your own tags are never marked — you know perfectly well who made them.
      unverified:
        !scoredCreators.has(group.authorPubkey) && group.authorPubkey !== viewerPubkey,
    }))
    .filter((t) => t.people > 0)
    .sort((a, b) => b.people - a.people || b.vouches - a.vouches || a.name.localeCompare(b.name));
}

/** Which contexts a tag is for, as sets of a-coordinates. */
export interface Applicability {
  /** Tags that describe PEOPLE. */
  pubkey: Set<string>;
  /** Tags that describe NOTES. */
  event: Set<string>;
  /** Where the split came from — `derived` means we computed it ourselves. */
  source: "published" | "derived" | "none";
}

/**
 * Which tags describe people and which describe notes (ACCEPTANCE C3).
 *
 * Two sources, in the order the kit prescribes. First the house's published
 * kind-30394 Trusted Lists — its own HINT ∪ USAGE derivation, signed by the
 * current assistant key. When those are absent or unreachable we compute the
 * same union client-side with `deriveApplicabilityMembers`: a relay scan for
 * tag-elements carrying each context's z-hint, unioned with what tags are
 * actually applied to that kind of target.
 *
 * A hint, never a gate — the protocol is explicit that readers must not require
 * it, nor read its absence as "not applicable". It decides ORDER, never
 * inclusion. `source: "none"` degrades to having no opinion about order at all.
 */
export async function fetchApplicability(usage: TagSummary[] = []): Promise<Applicability> {
  try {
    // Deliberately NOT the per-observer source. Applicability lists are a
    // published editorial hint ("which tags describe people vs events") signed
    // by the kit's own assistant on the configured trust relays — not a claim
    // about anyone's standing, so it has no observer and no perspective.
    const lists = await fetchApplicabilityLists({
      fetchEvents: async (filter: Record<string, unknown>) =>
        (await fetchEventsByFilter(filter, TRUST_RELAYS)) as NostrEvent[],
      houseAssistantPubkey: LOCAL_TA_PUBKEY,
    });
    if (lists.pubkey.size || lists.event.size) {
      return { pubkey: lists.pubkey, event: lists.event, source: "published" };
    }
  } catch {
    // fall through to deriving it ourselves
  }

  // Fallback. `usage` is our catalogue, which is built entirely from profile
  // taggings — so every entry in it is applicable-by-usage to pubkeys, and none
  // of it says anything about notes. The event half therefore comes from the
  // hint scan alone until we tag notes (C2).
  const usageRows = usage.map((t) => ({
    tag: { authorPubkey: t.authorPubkey, slug: t.slug },
    byType: { profile: { applications: Math.max(t.people, 1) } },
  }));

  try {
    const [pubkeyHints, eventHints] = await Promise.all([
      fetchTagEvents(applicabilityHintFilter("pubkey") as Record<string, unknown>),
      fetchTagEvents(applicabilityHintFilter("event") as Record<string, unknown>),
    ]);
    const toSet = (members: Array<{ a: string }>) => new Set(members.map((m) => m.a));
    return {
      pubkey: toSet(
        deriveApplicabilityMembers({ usageRows, hintEls: pubkeyHints, context: "pubkey" }),
      ),
      event: toSet(
        deriveApplicabilityMembers({ usageRows, hintEls: eventHints, context: "event" }),
      ),
      source: "derived",
    };
  } catch {
    return { pubkey: new Set(), event: new Set(), source: "none" };
  }
}

/** The a-coordinate an applicability list would name this tag by. */
export function tagCoordinate(tag: { authorPubkey: string; slug: string }): string {
  return `39999:${tag.authorPubkey}:${tag.slug}`;
}

/** A picker option: a catalogue tag plus which context it's meant for. */
export interface PickerTag extends TagSummary {
  /**
   * `profile` — describes people, so it leads. `content` — the applicability
   * split says this one is for notes; still offered, just after the rest.
   */
  band: "profile" | "content";
}

/**
 * What a "tag a person" picker offers, in the order ACCEPTANCE C3 asks for:
 * profile-applicable tags lead, content-applicable stay reachable but
 * secondary.
 *
 * Applicability is **HINT ∪ USAGE** — "the operative applicability source is
 * derived, not declared" — and our catalogue is built entirely from profile
 * taggings, so almost everything in it is applicable-by-usage to people. The
 * split therefore does little work today and will do all of it once we tag
 * notes (C2). That's the point: the classification is wired and correct now,
 * rather than discovered to be missing later.
 *
 * Two things it deliberately does NOT do, both learned the hard way:
 *
 *  - It does not sort BY the hint. Only 9 of 39 tags carry one, so ranking on
 *    it buried `AOS 2026 Participant` (88 people) beneath tags with three.
 *    Usage sorts within each band; the hint only chooses the band.
 *  - It does not advertise hint-only tags nobody has applied. The house's
 *    pubkey list includes `jumble-qa-profile-1784946392` and `test account`,
 *    so offering them puts harness output in front of users for the sake of
 *    one real unused tag (KIT-FEEDBACK.md §5). Nothing is lost: typing an
 *    existing tag's name still reuses it via `resolveOrMintTag`.
 *
 * Returns `unverified` entries too. The picker is BOTH surfaces at once — a
 * suggestion list before you type and a query after — so the list/query split
 * has to be made there, not here. `TagPersonButton` does it.
 */
export async function fetchPickerTags(
  viewerPubkey?: string,
  observer: TrustObserver = "house",
): Promise<PickerTag[]> {
  const catalogue = await fetchTagIndex(viewerPubkey, observer);
  const applicability = await fetchApplicability(catalogue);

  // No opinion available → everything is offered as-is, in usage order.
  if (applicability.source === "none") {
    return catalogue.map((t) => ({ ...t, band: "profile" as const }));
  }

  const banded = catalogue.map((t) => {
    const coord = tagCoordinate(t);
    // Content-only means the split says "notes" AND doesn't say "people".
    // A tag in both lists is applicable to both and belongs up top.
    const contentOnly = applicability.event.has(coord) && !applicability.pubkey.has(coord);
    return { ...t, band: (contentOnly ? "content" : "profile") as PickerTag["band"] };
  });

  return banded.sort(
    (a, b) =>
      (a.band === b.band ? 0 : a.band === "profile" ? -1 : 1) ||
      b.people - a.people ||
      a.name.localeCompare(b.name),
  );
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
    // How well the name matches outranks who made the tag — an exact hit on an
    // unverified tag is still what the person typed, and burying it under
    // loose contains-matches is how `lfo` became unfindable. Creator standing
    // only breaks ties inside a band; usage order survives beneath that,
    // because the sort is stable.
    .sort((x, y) => x.b - y.b || Number(x.t.unverified) - Number(y.t.unverified))
    .slice(0, max)
    .map((x) => x.t);
}

// ─── Comments on a tag ───────────────────────────────────────────────────────

/** NIP-22 comment kind. */
const COMMENT_KIND = 1111;

/**
 * Comments do NOT live on the tag hub.
 *
 * `dcosl.brainstorm.world` rejects anything that isn't a Decentralized Lists
 * kind — publishing a 1111 there returns "blocked: not a supported
 * Decentralized Lists event kind". That's correct behaviour for a purpose-built
 * hub, and it means any comment layer on tags is inherently split across two
 * relay sets: the tag on the hub, the discussion of it on general relays.
 *
 * So comments read and write through the app's normal relays, exactly like any
 * other nostr note. Filed in KIT-FEEDBACK.md, because it constrains anyone
 * else's comment design too.
 */
function fetchCommentEvents(filter: Record<string, unknown>): Promise<NostrEvent[]> {
  return fetchEventsByFilter(filter, PROFILE_RELAYS) as Promise<NostrEvent[]>;
}

export interface TagComment {
  id: string;
  author: string;
  content: string;
  createdAt: number;
}

/**
 * Comments on a TAG — "what does Bitcoin Vendor actually mean?" — not on any
 * one person carrying it.
 *
 * That distinction is the whole design (see COMMENTS-PROPOSAL.md). A thread
 * hung off a person's tagging would be unmoderated commentary about a named
 * individual on a page they don't control; a thread on the tag is a definition
 * argument, which is where the disagreement actually lives. Polarity already
 * expresses "this person doesn't belong" without prose.
 *
 * Standard NIP-22 against the tag-element's address, so any NIP-22 client
 * renders these — nothing bespoke. Read from the app's general relays, never
 * the tag hub: see `fetchCommentEvents` above for why they can't be the same.
 *
 * OFF by default (`TAG_COMMENTS_ENABLED`) — no kit document defines a comment
 * layer, so nothing extra-protocol should be live during an acceptance run.
 */
export async function fetchTagComments(
  authorPubkey: string,
  slug: string,
): Promise<TagComment[]> {
  const coord = tagCoordinate({ authorPubkey, slug });
  // NIP-22 puts the ROOT scope in uppercase `#A` and the immediate parent in
  // lowercase `#a`. For a top-level comment they're the same address, but
  // clients differ on which they set, so query both and dedupe.
  const [byRoot, byParent] = await Promise.all([
    fetchCommentEvents({ kinds: [COMMENT_KIND], "#A": [coord], limit: 200 }).catch(() => []),
    fetchCommentEvents({ kinds: [COMMENT_KIND], "#a": [coord], limit: 200 }).catch(() => []),
  ]);

  const byId = new Map<string, NostrEvent>();
  for (const ev of [...byRoot, ...byParent]) byId.set(ev.id, ev);

  return Array.from(byId.values())
    .filter((ev) => (ev.content ?? "").trim().length > 0)
    .map((ev) => ({
      id: ev.id,
      author: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Post a comment on a tag.
 *
 * This is the first user-authored free text this app publishes — everything
 * else it signs is structured (follows, reports, prefs, tag assertions). Worth
 * knowing when weighing spam and moderation questions later.
 */
export async function publishTagComment(
  authorPubkey: string,
  slug: string,
  content: string,
): Promise<void> {
  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Sign in to comment.");
  const text = content.trim();
  if (!text) throw new Error("Write something first.");

  const coord = tagCoordinate({ authorPubkey, slug });
  const unsigned = {
    kind: COMMENT_KIND,
    pubkey: user.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: text,
    // Root scope (uppercase) and parent (lowercase) are the same event for a
    // top-level comment. `K`/`k` carry the kind being commented on, `P`/`p` its
    // author — both required by NIP-22 for clients that filter by them.
    tags: [
      ["A", coord],
      ["K", String(TAG_ELEMENT_KIND)],
      ["P", authorPubkey],
      ["a", coord],
      ["k", String(TAG_ELEMENT_KIND)],
      ["p", authorPubkey],
    ],
  };

  const signed = await signEventLocally(unsigned);
  // The app's normal publish path (author's outbox ∪ PROFILE_RELAYS), NOT the
  // tag-hub one — see fetchCommentEvents above for why.
  const result = await publishToRelays(signed);
  if (!result.success) throw new Error(result.error || "No relay accepted the comment");
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

// ─── Pinning (OFF by default — see TAG_PINS_ENABLED) ─────────────────────────

/** NIP-09 deletion. */
const DELETION_KIND = 5;

/** A tag the viewer has pinned, plus the pin event so it can be undone. */
export interface PinnedTag extends TagIdentity {
  key: string;
  /** The pin event's id — what an unpin deletes. */
  pinEventId: string;
  at: number;
}

/**
 * The viewer's pinned tags.
 *
 * Reader semantics are **existence-based** per the spec: a live pin means
 * pinned, its absence means not. We additionally filter out pins the viewer has
 * already deleted, because relays are inconsistent about honouring NIP-09 and a
 * tag reappearing after you unpinned it is worse than a slow list.
 */
export async function fetchPinnedTags(viewerPubkey: string): Promise<PinnedTag[]> {
  if (!viewerPubkey) return [];

  const [pins, hubDeletions, generalDeletions] = await Promise.all([
    fetchTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      authors: [viewerPubkey],
      "#z": Z_HANDLE_PUBKEYS.map(conceptTagPinning),
    }).catch(() => [] as NostrEvent[]),
    // The hub almost certainly holds none of these — see `unpinTag` — but ask
    // anyway, in case an operator widens the allow-list later.
    fetchTagEvents({ kinds: [DELETION_KIND], authors: [viewerPubkey] }).catch(
      () => [] as NostrEvent[],
    ),
    fetchCommentEvents({ kinds: [DELETION_KIND], authors: [viewerPubkey] }).catch(
      () => [] as NostrEvent[],
    ),
  ]);
  const deletions = [...hubDeletions, ...generalDeletions];
  if (!pins.length) return [];

  const deleted = new Set(
    deletions.flatMap((d) => (d.tags || []).filter((t) => t[0] === "e").map((t) => t[1])),
  );

  // Latest wins per pin address, same replaceable discipline as everything else.
  const latest = new Map<string, NostrEvent>();
  for (const ev of pins) {
    const d = tagValue(ev, "d");
    if (!d || deleted.has(ev.id)) continue;
    const prev = latest.get(d);
    if (!prev || ev.created_at > prev.created_at) latest.set(d, ev);
  }

  const refs: Array<{ authorPubkey: string; slug: string }> = [];
  const rows: Array<{ ref: { authorPubkey: string; slug: string }; ev: NostrEvent }> = [];
  for (const ev of latest.values()) {
    const ref = tagRefFromPin(ev);
    if (!ref) continue;
    refs.push(ref);
    rows.push({ ref, ev });
  }
  if (!rows.length) return [];

  const names = await resolveTagNames(refs);
  return rows
    .map(({ ref, ev }) => {
      const key = `${ref.authorPubkey}|${ref.slug}`;
      return {
        key,
        authorPubkey: ref.authorPubkey,
        slug: ref.slug,
        name: names.get(key)?.name || ref.slug,
        description: names.get(key)?.description,
        pinEventId: ev.id,
        at: ev.created_at,
      };
    })
    .sort((a, b) => b.at - a.at);
}

/**
 * Pin a tag. Needs the tag-element's event id for the `e` half of the spec's
 * dual reference — `fetchTagDetail` and `resolveOrMintTag` both surface it.
 */
export async function pinTag({
  authorPubkey,
  slug,
  tagEventId,
}: {
  authorPubkey: string;
  slug: string;
  tagEventId: string;
}): Promise<void> {
  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Sign in to pin.");

  const unsigned = {
    ...buildTagPin({
      slug,
      tagAuthorPubkey: authorPubkey,
      tagEventId,
      viewerPubkey: user.pubkey,
      taPubkeys: Z_HANDLE_PUBKEYS,
    }),
    pubkey: user.pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
  const signed = await signEventLocally(unsigned as Record<string, unknown>);
  await publishTagEvent(signed);
}

/**
 * Unpin — a NIP-09 kind-5 deletion of the pin event.
 *
 * This is the app's FIRST deletion of any kind. Note what it does and doesn't
 * mean: it removes a PIN, which is a private curation choice. It emphatically
 * does not delete a tagging — those have no delete at all, only polarity
 * replacement. Don't reach for this from any other flow.
 *
 * **The deletion cannot go to the tag hub.** `dcosl.brainstorm.world` advertises
 * its allow-list in its NIP-11 document — "stores kinds 9998, 9999, 39998,
 * 39999 … also supports kind 7" — and kind 5 isn't on it, the same wall that
 * blocks kind-1111 comments (KIT-FEEDBACK §6). So the spec's unpin mechanism
 * cannot be executed against the relay the spec's pins live on.
 *
 * We publish the deletion to the app's general relays and, on read, union
 * deletions from both sets. That makes unpinning work for us and for anyone
 * reading the same way — but a client reading the hub alone will keep seeing
 * the pin forever. Filed as KIT-FEEDBACK §15; this is a workaround, not a fix.
 */
export async function unpinTag(pinEventId: string): Promise<void> {
  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Sign in to unpin.");

  const unsigned = {
    kind: DELETION_KIND,
    pubkey: user.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", pinEventId]],
    content: "",
  };
  const signed = await signEventLocally(unsigned as Record<string, unknown>);
  // General relays, NOT publishTagEvent — the hub would reject this outright.
  const result = await publishToRelays(signed);
  if (!result.success) throw new Error(result.error || "No relay accepted the unpin");
}

// ─── What the viewer has said ────────────────────────────────────────────────

/** One claim the viewer has made, about a person or a note. */
export interface MyAssertion {
  /** `<tagAuthor>|<slug>` — the tag's identity. */
  key: string;
  authorPubkey: string;
  slug: string;
  name: string;
  /** A person's pubkey, or a note's event id. */
  target: string;
  targetKind: "pubkey" | "event";
  stance: "apply" | "dispute";
  /** When we signed it. */
  at: number;
}

/**
 * Everything the viewer has ever claimed — both halves of the protocol.
 *
 * Nothing else in the app answers "what have I actually said about people?".
 * The assertions are public, permanent and signed with their key, so being able
 * to review them in one place is the least a client owes someone. Withdrawal
 * runs through the same polarity flip the pickers use; there is no delete.
 *
 * Trust-free by construction: these are the viewer's OWN events, so no POV gets
 * a say in whether they're listed. That's the same reasoning as the `mine`
 * channel, applied to a whole page.
 */
export async function fetchMyAssertions(viewerPubkey: string): Promise<MyAssertion[]> {
  if (!viewerPubkey) return [];

  const [profileEvents, eventEvents] = await Promise.all([
    fetchAllTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      authors: [viewerPubkey],
      "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
    }).catch(() => [] as NostrEvent[]),
    fetchAllTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      authors: [viewerPubkey],
      "#z": Z_HANDLE_PUBKEYS.map(conceptNostrEventTag),
    }).catch(() => [] as NostrEvent[]),
  ]);

  const out: MyAssertion[] = [];

  // ── People we've tagged ──
  const onPeople = await normalizeAssertions(profileEvents);
  for (const a of onPeople) {
    if (a.asserter !== viewerPubkey) continue; // defensive: the filter said authors:[me]
    out.push({
      key: a.tagKey,
      authorPubkey: a.tagAuthor,
      slug: a.slug,
      name: a.slug,
      target: a.target,
      targetKind: "pubkey",
      stance: a.stance,
      at: a.at,
    });
  }

  // ── Notes we've tagged ──
  // The event half needs its headers resolved before a candidate names its tag,
  // so it goes through the classifier rather than `normalizeAssertions`.
  const dedupedEvents = latestByReplaceableKey(eventEvents);
  if (dedupedEvents.length) {
    const headers = await resolveTaggingHeaders(
      dedupedEvents.map(descriptorOf).filter((c): c is string => !!c),
    );
    // Grouped per target because the classifier answers "what tags are on THIS
    // target"; we're asking the transpose, one target at a time.
    const byTarget = new Map<string, NostrEvent[]>();
    for (const ev of dedupedEvents) {
      const target = targetIdOf(ev);
      if (!target) continue;
      if (!byTarget.has(target)) byTarget.set(target, []);
      byTarget.get(target)!.push(ev);
    }
    for (const [target, evs] of byTarget) {
      const classified = classifyEventTaggings({
        candidates: evs,
        headers,
        honoredAuthorities: Z_HANDLE_PUBKEYS,
        // Our own events; the POV has no business filtering them out here.
        isAsserterTrusted: () => true,
        viewerPubkey,
      });
      for (const m of classified.mine) {
        out.push({
          key: `${m.tag.authorPubkey}|${m.tag.slug}`,
          authorPubkey: m.tag.authorPubkey,
          slug: m.tag.slug,
          name: m.tag.slug,
          target,
          targetKind: "event",
          stance: m.stance,
          at: m.createdAt,
        });
      }
    }
  }

  if (!out.length) return [];

  // One name lookup for the whole page, served from the session element cache
  // where a chip already resolved it.
  const names = await resolveTagNames(
    Array.from(new Map(out.map((a) => [a.key, { authorPubkey: a.authorPubkey, slug: a.slug }])).values()),
  );
  for (const a of out) a.name = names.get(a.key)?.name || a.slug;

  // Newest first — this reads as a log of what you've said.
  return out.sort((a, b) => b.at - a.at);
}

// ─── Tagging NOTES (rung C2) ─────────────────────────────────────────────────

/**
 * Note tagging is shaped differently from profile tagging, and the difference is
 * the whole reason this section exists rather than reusing the code above.
 *
 * A profile assertion names its tag directly (`a` = `39999:<author>:<slug>`). An
 * EVENT assertion names a **per-tag tagging header** instead
 * (`z` = `39999:<headerAuthor>:tagging:<slug>-tagging`), and that header carries
 * the `a` pointing at the tag-element. So reading tags on a note is a two-hop
 * resolution, and the middle hop is what decides legitimacy: a candidate counts
 * only if its header joins a `tagging-with-specific-tag` namespace we honor.
 *
 * That indirection is also why applying a tag to a note can cost 1, 2 or 3
 * publishes — assertion alone, header + assertion, or tag + header + assertion.
 * `applyEventTagging` picks the sequence; we just supply the deps.
 *
 * An assertion whose header we can't resolve is **unverifiable**, not invalid.
 * The SDK surfaces those separately and we pass the count through rather than
 * silently dropping them — a header that hasn't propagated yet looks exactly
 * like one that never existed, and only one of those is the reader's business.
 */

/** One tag as it appears on a note. */
export interface NoteTag extends TagIdentity {
  key: string;
  /** Distinct asserters who applied it. */
  applications: number;
  /** Distinct asserters who disputed it. */
  disputes: number;
  /** Who applied it, for attribution. */
  asserters: string[];
  /** Whether the net rule carries it. */
  counted: boolean;
  /** The viewer's own stance, shown regardless of whether the POV counts them. */
  myStance?: "apply" | "dispute";
}

export interface NoteTagsResult {
  tags: NoteTag[];
  mine: Array<{ key: string; stance: "apply" | "dispute" }>;
  /**
   * Assertions we found but whose tagging header wouldn't resolve. Reported, not
   * dropped — a non-zero count here means a header fetch missed a relay, which
   * is the kit's stated diagnostic for exactly this.
   */
  unverifiable: number;
  /** The trust source told us nothing — these counts weren't filtered. */
  trustUnverified: boolean;
}

/**
 * Tagging headers, cached per session alongside the tag-elements. Same reasoning
 * as `elementMetaByCoord`: every note carrying a given tag points at the same
 * header, so resolving it once per note is a wasted round-trip per note.
 * Positive-only, for the same reason — a header minted seconds ago must not be
 * cached as absent.
 */
const headersByCoord = new Map<string, NostrEvent>();

/** `39999:<author>:tagging:<slug>-tagging` → its `d` tag. */
function headerDTagFromCoord(coord: string): string | null {
  const m = /^39999:[0-9a-f]{64}:(tagging:.+-tagging)$/.exec(coord);
  return m ? m[1] : null;
}

function headerCoordOf(ev: NostrEvent): string {
  return `39999:${ev.pubkey}:${tagValue(ev, "d") ?? ""}`;
}

/** Resolve tagging headers by coordinate, serving what we already hold. */
async function resolveTaggingHeaders(coords: string[]): Promise<NostrEvent[]> {
  const wanted = Array.from(new Set(coords));
  const out: NostrEvent[] = [];
  const missing: string[] = [];
  for (const c of wanted) {
    const hit = headersByCoord.get(c);
    if (hit) out.push(hit);
    else missing.push(c);
  }
  if (!missing.length) return out;

  const authors = new Set<string>();
  const dTags = new Set<string>();
  for (const c of missing) {
    const parts = c.split(":");
    const d = headerDTagFromCoord(c);
    if (parts[1] && d) {
      authors.add(parts[1]);
      dTags.add(d);
    }
  }
  if (!authors.size) return out;

  try {
    const found = await fetchTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      authors: Array.from(authors),
      "#d": Array.from(dTags),
    });
    // The filter is a cross-product, so it can return headers we didn't ask for.
    // Cache them all — they're the ones the next note will want.
    for (const ev of found) {
      headersByCoord.set(headerCoordOf(ev), ev);
    }
    for (const c of missing) {
      const hit = headersByCoord.get(c);
      if (hit) out.push(hit);
    }
  } catch {
    // Unresolved headers become `unverifiable` downstream, which is the honest
    // outcome — better than dropping the assertions or failing the read.
  }
  return out;
}

/**
 * Collapse replaceable duplicates before classifying. An event-tagging's `d` is
 * deterministic per (slug, target, asserter), so a relay handing us both the old
 * and the new copy must not count as two — and an apply↔dispute flip has to
 * settle on the newer stance. The SDK's classifier documents this as the
 * caller's job.
 */
function latestByReplaceableKey(events: NostrEvent[]): NostrEvent[] {
  const latest = new Map<string, NostrEvent>();
  for (const ev of events) {
    const d = tagValue(ev, "d");
    if (!d) continue;
    const key = `${ev.kind}|${ev.pubkey}|${d}`;
    const prev = latest.get(key);
    if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
  }
  return Array.from(latest.values());
}

/** The descriptor coordinate a candidate assertion points at, if it has one. */
function descriptorOf(ev: NostrEvent): string | null {
  const z = (ev.tags || []).find(
    (t) => t[0] === "z" && /^39999:[0-9a-f]{64}:tagging:.+-tagging$/.test(t[1] || ""),
  );
  return z ? z[1] : null;
}

const EMPTY_NOTE_TAGS: NoteTagsResult = {
  tags: [],
  mine: [],
  unverifiable: 0,
  trustUnverified: false,
};

/** The event id a candidate assertion targets, if it targets one by id. */
function targetIdOf(ev: NostrEvent): string | null {
  const e = (ev.tags || []).find((t) => t[0] === "e");
  return e?.[1] ?? null;
}

/**
 * Every tag applied to each of N notes, in ONE pass (ACCEPTANCE C2).
 *
 * Batched on purpose, and the checklist is explicit about why: "reads over a
 * list of N events issue batched queries … no per-event REQ storm". A profile
 * page renders half a dozen notes, so a per-note read would be half a dozen
 * REQs where one will do — and the header, trust and name resolution behind
 * them would each multiply too.
 *
 * Anonymous-safe like every read here: relays only, no API client. Pass
 * `viewerPubkey` to surface the viewer's own stances via the `mine` channel,
 * which is deliberately trust-unfiltered.
 *
 * Returns a map keyed by event id. Ids with no tags are simply absent.
 */
export async function fetchEventTagsBatch(
  eventIds: string[],
  viewerPubkey?: string,
  observer: TrustObserver = "house",
): Promise<Map<string, NoteTagsResult>> {
  const out = new Map<string, NoteTagsResult>();
  const ids = Array.from(new Set(eventIds.filter(Boolean)));
  if (!ids.length) return out;

  // One REQ per chunk, never per note. 200 keeps the filter under the size
  // most relays accept while still collapsing any realistic page to one query.
  const candidates: NostrEvent[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    // The SDK owns the filter's shape; we only widen `#e` from one id to the
    // chunk, which is exactly the batching the checklist asks for.
    const filter = filterTagsAppliedToEvent({ target: { id: chunk[0] } }) as Record<string, unknown>;
    try {
      candidates.push(...(await fetchTagEvents({ ...filter, "#e": chunk })));
    } catch {
      // Partial results beat none; the notes we couldn't ask about just show
      // no chips, which is what an untagged note looks like anyway.
    }
  }
  if (!candidates.length) return out;

  const deduped = latestByReplaceableKey(candidates);

  // Headers, trust and names all resolve ONCE across every note — the whole
  // point of batching. Notes on a profile tend to share tags, so this is where
  // most of the saving actually lands.
  const headers = await resolveTaggingHeaders(
    deduped.map(descriptorOf).filter((c): c is string => !!c),
  );
  const trust = await resolveTrust(Array.from(new Set(deduped.map((ev) => ev.pubkey))), observer);

  const byTarget = new Map<string, NostrEvent[]>();
  for (const ev of deduped) {
    const target = targetIdOf(ev);
    if (!target || !ids.includes(target)) continue;
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target)!.push(ev);
  }
  if (!byTarget.size) return out;

  // `classifyEventTaggings` groups one target's candidates by tag, so it runs
  // per note — but on already-fetched data, with no further I/O.
  const classifiedByTarget = new Map<string, ReturnType<typeof classifyEventTaggings>>();
  const refs = new Map<string, { authorPubkey: string; slug: string }>();
  for (const [target, evs] of byTarget) {
    const classified = classifyEventTaggings({
      candidates: evs,
      headers,
      honoredAuthorities: Z_HANDLE_PUBKEYS,
      isAsserterTrusted: trust.predicate,
      viewerPubkey,
    });
    classifiedByTarget.set(target, classified);
    // Names for the counted tags AND for the viewer's own — a tag that survives
    // only via `mine` still has to render under its real name, not its slug.
    for (const t of [...classified.tags, ...classified.mine]) {
      refs.set(`${t.tag.authorPubkey}|${t.tag.slug}`, {
        authorPubkey: t.tag.authorPubkey,
        slug: t.tag.slug,
      });
    }
  }

  const names = await resolveTagNames(Array.from(refs.values()));

  for (const [target, classified] of classifiedByTarget) {
    const mine = new Map(
      classified.mine.map((m) => [
        `${m.tag.authorPubkey}|${m.tag.slug}`,
        m.stance as "apply" | "dispute",
      ]),
    );

    // `classified.tags` is trust-filtered; `classified.mine` is not. A tag whose
    // only asserter is the viewer — and whom the POV doesn't count — is absent
    // from the former and present in the latter, so mapping over `tags` alone
    // makes the viewer's own action vanish. ACCEPTANCE C7 and Floor C both
    // require the opposite: the viewer's stance stays visible whatever the POV
    // makes of them. So `mine` INTRODUCES an entry here, it doesn't just
    // annotate one.
    const fromMine = stanceOnlyRefs(classified.tags, classified.mine).map((m) => ({
      tag: m.tag,
      applications: [],
      disputes: [],
    }));

    const tags: NoteTag[] = [...classified.tags, ...fromMine]
      .map((t) => {
        const key = `${t.tag.authorPubkey}|${t.tag.slug}`;
        // Distinct ASSERTERS, not raw entries — the same discipline as the
        // profile read, and the only reading that matches the kit's rule.
        const applied = new Set(t.applications.map((a) => a.authorPubkey));
        const disputed = new Set(t.disputes.map((d) => d.authorPubkey));
        return {
          key,
          authorPubkey: t.tag.authorPubkey,
          slug: t.tag.slug,
          name: names.get(key)?.name || t.tag.slug,
          description: names.get(key)?.description,
          applications: applied.size,
          disputes: disputed.size,
          asserters: Array.from(applied),
          counted: netPositive(applied.size, disputed.size),
          myStance: mine.get(key),
        };
      })
      // Same rule as the profile chips: carried by the network, or the viewer
      // has a stance on it and must keep seeing their own action.
      .filter((t) => t.counted || !!t.myStance)
      .sort(
        (a, b) =>
          Number(b.counted) - Number(a.counted) ||
          b.applications - a.applications ||
          a.name.localeCompare(b.name),
      );

    out.set(target, {
      tags,
      mine: Array.from(mine.entries()).map(([key, stance]) => ({ key, stance })),
      unverifiable: classified.unverifiable.length,
      trustUnverified: trust.unverified,
    });
  }

  return out;
}

/**
 * Every tag applied to ONE note. A thin wrapper over the batch so there is a
 * single classification path — the note page and the profile teasers must never
 * be able to disagree about what a note is tagged.
 */
export async function fetchEventTags(
  eventId: string,
  viewerPubkey?: string,
  observer: TrustObserver = "house",
): Promise<NoteTagsResult> {
  const batch = await fetchEventTagsBatch([eventId], viewerPubkey, observer);
  return batch.get(eventId) ?? EMPTY_NOTE_TAGS;
}

/** A note carrying a tag, as the tag page lists it. */
export interface TaggedNote {
  /** The note's event id. Addressable targets carry `address` instead. */
  id?: string;
  address?: string;
  applications: number;
  disputes: number;
  asserters: string[];
  myStance?: "apply" | "dispute";
  /** Newest applying assertion, for a "recently tagged" ordering. */
  addedAt: number;
  /**
   * Relay hints the asserters attached to their `e` tag — where the note
   * actually lives. The hub carries assertions ABOUT notes, never the notes, so
   * without a hint a reader can only guess (their own relays) and a note living
   * elsewhere is unreachable. Our own writes always attach one; the reference
   * publisher currently attaches none, so this is often empty.
   */
  relays: string[];
}

/**
 * Every note the network says carries one tag — the event half of C6, and what
 * Floor D wants listed on a tag page beside the people.
 *
 * Two hops, because a tag can have several legitimate headers authored by
 * different people: find the tag's headers first, then read every tagging that
 * points at any of them.
 */
export async function fetchTagNotes(
  authorPubkey: string,
  slug: string,
  viewerPubkey?: string,
  observer: TrustObserver = "house",
): Promise<TaggedNote[]> {
  let headers: NostrEvent[] = [];
  try {
    const perAuthority = await Promise.all(
      Z_HANDLE_PUBKEYS.map((ta) =>
        fetchTagEvents(
          filterTaggingHeadersForTag({
            tagAuthorPubkey: authorPubkey,
            slug,
            taPubkey: ta,
          }) as Record<string, unknown>,
        ).catch(() => [] as NostrEvent[]),
      ),
    );
    const byId = new Map<string, NostrEvent>();
    for (const ev of perAuthority.flat()) byId.set(ev.id, ev);
    headers = Array.from(byId.values());
  } catch {
    return [];
  }
  // No header means nobody has ever made this tag applicable to notes, so there
  // is nothing to find. Not an error — most tags are people-only today.
  if (!headers.length) return [];

  for (const h of headers) headersByCoord.set(headerCoordOf(h), h);

  let candidates: NostrEvent[] = [];
  try {
    // One query across every header coordinate rather than one per header.
    candidates = await fetchAllTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      "#z": headers.map(headerCoordOf),
    });
  } catch {
    return [];
  }
  if (!candidates.length) return [];

  const deduped = latestByReplaceableKey(candidates);
  const trust = await resolveTrust(Array.from(new Set(deduped.map((ev) => ev.pubkey))), observer);
  const grouped = groupTaggingsByTarget({
    candidates: deduped,
    headers,
    honoredAuthorities: Z_HANDLE_PUBKEYS,
    isAsserterTrusted: trust.predicate,
    viewerPubkey,
    tag: { authorPubkey, slug },
  });

  const mineFor = new Map(
    grouped.mine.map((m) => [m.target.id ?? m.target.address ?? "", m.stance as "apply" | "dispute"]),
  );

  // Harvest the `e`-tag relay hints before we lose the raw candidates — the
  // classifier returns targets, not the tags they came from.
  const hintsFor = new Map<string, Set<string>>();
  for (const ev of deduped) {
    const e = (ev.tags || []).find((t) => t[0] === "e");
    const hint = e?.[2];
    if (!e?.[1] || typeof hint !== "string" || !/^wss?:\/\//i.test(hint)) continue;
    if (!hintsFor.has(e[1])) hintsFor.set(e[1], new Set());
    hintsFor.get(e[1])!.add(hint);
  }

  return grouped.targets
    .map((t) => {
      const applied = new Set(t.applications.map((a) => a.authorPubkey));
      const disputed = new Set(t.disputes.map((d) => d.authorPubkey));
      return {
        id: t.target.id,
        address: t.target.address,
        applications: applied.size,
        disputes: disputed.size,
        asserters: Array.from(applied),
        myStance: mineFor.get(t.target.id ?? t.target.address ?? ""),
        addedAt: t.applications.reduce((max, a) => Math.max(max, a.createdAt ?? 0), 0),
        relays: Array.from(hintsFor.get(t.target.id ?? "") ?? []),
      };
    })
    .filter((n) => netPositive(n.applications, n.disputes) || !!n.myStance)
    .sort((a, b) => b.applications - a.applications || b.addedAt - a.addedAt);
}

/**
 * Apply (or dispute) a tag on a note as the signed-in user.
 *
 * 1, 2 or 3 publishes depending on what already exists — the SDK decides and
 * signs everything before publishing anything, so cancelling the signer aborts
 * cleanly with nothing on the relays. A partial failure is reported in
 * `failedAt` and must be surfaced rather than reported as success.
 *
 * `relayHint` rides along on the `e` tag so a reader can fetch the target note
 * from where it actually lives, instead of us persisting other people's notes
 * onto the tag hub.
 */
export async function applyTagToEvent({
  tag,
  eventId,
  relayHint,
  polarity = 1,
}: {
  tag: { authorPubkey: string; slug: string } | { name: string; description?: string };
  eventId: string;
  relayHint?: string;
  polarity?: Polarity;
}) {
  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Sign in to tag.");

  return applyEventTagging({
    tagInput: tag,
    target: { id: eventId, ...(relayHint ? { relays: [relayHint] } : {}) },
    polarity,
    asserterPubkey: user.pubkey,
    taPubkeys: Z_HANDLE_PUBKEYS,
    deps: {
      // Which tagging headers already exist for this tag — decides whether the
      // asserter has to mint one (sequence b) or can reference an existing one
      // (sequence a).
      findHeaders: async ({ tagAuthorPubkey, slug }) => {
        const found = await Promise.all(
          Z_HANDLE_PUBKEYS.map((ta) =>
            fetchTagEvents(
              filterTaggingHeadersForTag({ tagAuthorPubkey, slug, taPubkey: ta }) as Record<
                string,
                unknown
              >,
            ).catch(() => [] as NostrEvent[]),
          ),
        );
        const byAuthor = new Map<string, { author: string }>();
        for (const ev of found.flat()) {
          headersByCoord.set(headerCoordOf(ev), ev);
          byAuthor.set(ev.pubkey, { author: ev.pubkey });
        }
        return Array.from(byAuthor.values());
      },
      sign: signEventLocally,
      publish: publishTagEvent,
      now: () => Math.floor(Date.now() / 1000),
    },
  });
}
