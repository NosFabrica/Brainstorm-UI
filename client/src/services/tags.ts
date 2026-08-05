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
  trustEveryone,
  type TrustPredicate,
} from "@/lib/tagging-sdk/trust.js";
import { buildTagElement, conceptTag, slug as toSlug } from "@/lib/tagging-sdk/event-tagging/index.js";
import { mergeSameNamedTags, stanceForVariants } from "@/lib/tagMerge";
import {
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
 * name a tag, and profile-tag assertions are the older DIRECT shape — the `a`
 * coordinate names the tag straight out. Reusing it here would drop every
 * candidate for want of a header that does not exist in this family.
 *
 * Requiring `a` is deliberate, and it is also a useful filter. Surveying the hub
 * on 2026-08-05 (2000 assertions) found only 6 carrying `a` — but those 6 are
 * the real ones: human-meaningful tags (`author`, `verified-human`, `dcosl`) on
 * pubkeys with real kind-0 profiles. The other 1994 are automated QA-harness
 * output (`wysiwyg-s17-1785898945945-…`) aimed at pubkeys that have no profile
 * at all. Reading identity from the `e` fallback instead would surface that
 * noise and buy nothing, so we consume by `#a` exactly as the protocol says.
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
}

function normalizeAssertions(candidates: NostrEvent[]): NormalizedAssertion[] {
  const honored = new Set(Z_HANDLE_PUBKEYS.map(conceptNostrUserTag));

  // Latest-wins per (tag, target, asserter). The d-tag is deterministic for
  // that triple, so a re-tag replaces rather than stacks — but relays can hand
  // us both the old and new copy, and an apply↔dispute flip has to collapse to
  // the newer stance instead of counting as both.
  const latest = new Map<string, NostrEvent>();
  for (const ev of candidates) {
    if (!(ev.tags || []).some((t) => t[0] === "z" && honored.has(t[1]))) continue;
    const a = tagValue(ev, "a");
    const m = a && /^39999:([0-9a-f]{64}):(.+)$/.exec(a);
    if (!m) continue;
    const target = tagValue(ev, "p");
    if (!target) continue;
    const key = `${m[1]}|${m[2]}|${target}|${ev.pubkey}`;
    const prev = latest.get(key);
    if (!prev || ev.created_at > prev.created_at) latest.set(key, ev);
  }

  const out: NormalizedAssertion[] = [];
  for (const [composite, ev] of latest) {
    const [tagAuthor, slug, target] = composite.split("|");
    const stance = bucketize(ev);
    if (stance === "neutral") continue;
    out.push({ tagKey: `${tagAuthor}|${slug}`, tagAuthor, slug, target, asserter: ev.pubkey, stance });
  }
  return out;
}

/** Group normalized assertions BY TAG — the profile read. */
function groupByTag(
  assertions: NormalizedAssertion[],
  isAsserterTrusted: TrustPredicate,
  viewerPubkey?: string,
): {
  counted: Map<string, { authorPubkey: string; slug: string; applications: Set<string>; disputes: Set<string> }>;
  mine: Map<string, "apply" | "dispute">;
} {
  const counted = new Map<
    string,
    { authorPubkey: string; slug: string; applications: Set<string>; disputes: Set<string> }
  >();
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
      });
    }
    const grp = counted.get(a.tagKey)!;
    (a.stance === "apply" ? grp.applications : grp.disputes).add(a.asserter);
  }

  return { counted, mine };
}

/** Group normalized assertions BY TARGET — the tag-page read. */
function groupByTarget(
  assertions: NormalizedAssertion[],
  isAsserterTrusted: TrustPredicate,
): Map<string, { applications: Set<string>; disputes: Set<string> }> {
  const byTarget = new Map<string, { applications: Set<string>; disputes: Set<string> }>();
  for (const a of assertions) {
    if (!isAsserterTrusted(a.asserter)) continue;
    if (!byTarget.has(a.target)) {
      byTarget.set(a.target, { applications: new Set(), disputes: new Set() });
    }
    const grp = byTarget.get(a.target)!;
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

  const assertions = normalizeAssertions(candidates);
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
      variants: variantKeys.length,
      myStance: stanceForVariants(variantKeys, mine),
    }))
    // Contested tags sink; ties break alphabetically so the row is stable
    // across refetches rather than reshuffling on every render.
    .filter((t) => t.applications > 0)
    .sort(
      (a, b) =>
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
  /** Distinct trusted asserters who applied the tag to this person. */
  applications: number;
  /** Distinct trusted asserters who disputed it. */
  disputes: number;
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
export async function fetchTagDetail(authorPubkey: string, slug: string): Promise<TagDetail> {
  const [candidates, names] = await Promise.all([
    fetchTagEvents(
      filterProfileTaggingsUsingTag({
        tagAuthorPubkey: authorPubkey,
        slug,
        zHandlePubkeys: Z_HANDLE_PUBKEYS,
      }),
    ),
    resolveTagNames([{ authorPubkey, slug }]),
  ]);

  const meta = names.get(`${authorPubkey}|${slug}`);
  const tag: TagIdentity = {
    authorPubkey,
    slug,
    name: meta?.name || slug,
    description: meta?.description,
  };

  if (!candidates.length) return { tag, carriers: [] };

  // Only assertions for THIS tag — the relay filtered by #a, but a permissive
  // relay could hand back more and we'd rather not list strangers.
  const assertions = normalizeAssertions(candidates).filter(
    (a) => a.tagAuthor === authorPubkey && a.slug === slug,
  );

  const trusted = await resolveTrust(Array.from(new Set(assertions.map((a) => a.asserter))));
  const byTarget = groupByTarget(assertions, trusted);

  const carriers: TagCarrier[] = Array.from(byTarget.entries())
    .map(([pubkey, grp]) => ({
      pubkey,
      applications: grp.applications.size,
      disputes: grp.disputes.size,
    }))
    .filter((c) => c.applications > 0)
    // Most-vouched first; contested sink. Ties break on pubkey so the order is
    // stable across refetches instead of reshuffling.
    .sort(
      (a, b) =>
        b.applications - a.applications ||
        a.disputes - b.disputes ||
        a.pubkey.localeCompare(b.pubkey),
    );

  return { tag, carriers };
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
    const assertions = await fetchTagEvents({
      kinds: [TAG_ELEMENT_KIND],
      "#a": candidates.map((ev) => `39999:${ev.pubkey}:${slug}`),
      "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
    });
    for (const a of normalizeAssertions(assertions)) {
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
