/** Reading a profile's tags: every tag applied to a person, or to each of a page of people. */
import { filterTagsAppliedToPubkey } from "@/lib/tagging-sdk/profile-tagging.js";
import { countNameCollisions } from "@/lib/tagMerge";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";
import { fetchTagEvents } from "./read";
import { resolveTrust, type TrustObserver } from "./trust";
import { resolveTagNames } from "./elements";
import { groupByTag, normalizeAssertions } from "./assertions";
import { netPositive, tagValue, type NostrEvent, type TagIdentity } from "./shared";

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
  /** Shown before the relays have taken it — the viewer's own act, still publishing. */
  pending?: boolean;
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
  return profileTagsFromCandidates(candidates, viewerPubkey, observer);
}

/**
 * Every tag applied to each of N pubkeys, in one pass — the profile read for a
 * page of people (a search's), as `fetchEventTagsBatch` is the note read. Each
 * person's answer is exactly what `fetchProfileTags` gives on their profile:
 * the same candidates, trust and names, so a chip and its profile agree.
 *
 * Returns a map keyed by pubkey; people with no tags are absent.
 */
export async function fetchProfileTagsBatch(
  pubkeys: string[],
  viewerPubkey?: string,
  observer: TrustObserver = "house",
): Promise<Map<string, ProfileTagsResult>> {
  const out = new Map<string, ProfileTagsResult>();
  const targets = Array.from(new Set(pubkeys.filter((p) => /^[0-9a-f]{64}$/.test(p))));
  if (!targets.length) return out;

  const candidates: NostrEvent[] = [];
  for (let i = 0; i < targets.length; i += 200) {
    const chunk = targets.slice(i, i + 200);
    // The SDK's filter for one person, widened to the chunk.
    const filter = filterTagsAppliedToPubkey({ targetPubkey: chunk[0], zHandlePubkeys: Z_HANDLE_PUBKEYS });
    try {
      candidates.push(...(await fetchTagEvents({ ...filter, "#p": chunk })));
    } catch {
      // Partial results beat none: the people we couldn't ask about show no tags.
    }
  }
  const byTarget = new Map<string, NostrEvent[]>();
  for (const ev of candidates) {
    const target = tagValue(ev, "p");
    if (!target || !targets.includes(target)) continue;
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target)!.push(ev);
  }
  if (!byTarget.size) return out;

  // Tag-elements, trust and names once for the whole page; each person's read
  // below then finds them cached instead of asking again, person by person.
  const assertions = await normalizeAssertions(candidates);
  const asserters = new Set(assertions.map((a) => a.asserter));
  if (viewerPubkey) asserters.add(viewerPubkey);
  await Promise.all([
    resolveTrust(Array.from(asserters), observer),
    resolveTagNames(
      Array.from(new Map(assertions.map((a) => [a.tagKey, { authorPubkey: a.tagAuthor, slug: a.slug }])).values()),
    ),
  ]);
  const results = await Promise.all(
    Array.from(
      byTarget,
      async ([target, evs]) => [target, await profileTagsFromCandidates(evs, viewerPubkey, observer)] as const,
    ),
  );
  for (const [target, result] of results) if (result.tags.length) out.set(target, result);
  return out;
}

async function profileTagsFromCandidates(
  candidates: NostrEvent[],
  viewerPubkey: string | undefined,
  observer: TrustObserver,
): Promise<ProfileTagsResult> {
  if (!candidates.length) return { tags: [], mine: [], trustUnverified: false, viewerUnscored: false };

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
