/** Reading a tag: everyone the network says carries it, and whether it exists at all. */
import { conceptNostrUserTag, filterProfileTaggingsUsingTag } from "@/lib/tagging-sdk/profile-tagging.js";
import { Z_HANDLE_PUBKEYS, TAG_FOR_NOSTR_PUBKEY_Z, TAG_FOR_NOSTR_EVENT_Z } from "@/config/tagging";
import { fetchTagEvents } from "./read";
import { resolveTrust, type TrustObserver } from "./trust";
import { groupByTarget, normalizeAssertions } from "./assertions";
import { netPositive, TAG_ELEMENT_KIND, tagValue, type NostrEvent, type TagIdentity } from "./shared";

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
    } catch {
      /* malformed content → slug */
    }
  }
  const hints = new Set((element?.tags ?? []).filter((t) => t[0] === "z").map((t) => t[1]));
  const tag: TagIdentity = {
    authorPubkey,
    slug,
    name: meta.name || slug,
    description: meta.description,
    madeFor: hints.has(TAG_FOR_NOSTR_EVENT_Z) ? "posts" : hints.has(TAG_FOR_NOSTR_PUBKEY_Z) ? "people" : undefined,
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
