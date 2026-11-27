/** The catalogue: every tag in use, which contexts each is for, and what a picker offers. */
import { fetchEventsByFilter } from "@/services/nostr";
import { conceptNostrUserTag } from "@/lib/tagging-sdk/profile-tagging.js";
import { fetchApplicabilityLists } from "@/lib/tagging-sdk/trust.js";
import { applicabilityHintFilter, deriveApplicabilityMembers } from "@/lib/tagging-sdk/event-tagging/index.js";
import { countNameCollisions, normalizeTagName, type CountedTag } from "@/lib/tagMerge";
import { LOCAL_TA_PUBKEY, TRUST_RELAYS, Z_HANDLE_PUBKEYS } from "@/config/tagging";
import { fetchAllTagEvents, fetchTagEvents } from "./read";
import { fetchScoredPubkeys, resolveTrust, type TrustObserver } from "./trust";
import { cacheElementMeta, elementMetaByCoord, resolveTagNames } from "./elements";
import { normalizeAssertions } from "./assertions";
import { netPositive, TAG_ELEMENT_KIND, tagValue, type NostrEvent, type TagIdentity } from "./shared";

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
export async function fetchTagIndex(viewerPubkey?: string, observer: TrustObserver = "house"): Promise<TagSummary[]> {
  const candidates = await fetchAllTagEvents({
    kinds: [TAG_ELEMENT_KIND],
    "#z": Z_HANDLE_PUBKEYS.map(conceptNostrUserTag),
  });
  if (!candidates.length) return [];

  const assertions = await normalizeAssertions(candidates);
  const trust = await resolveTrust(Array.from(new Set(assertions.map((a) => a.asserter))), observer);
  const scoredCreators = await fetchScoredPubkeys(Array.from(new Set(assertions.map((a) => a.tagAuthor))));

  // Reuse the profile read's grouping so the catalogue can't drift from what a
  // profile shows: same trust filter, same latest-wins, same apply/dispute rule.
  // Support is tallied PER (tag, person) so the net rule can be applied per
  // carrier — a tag isn't "used" by someone the network has voted down.
  const counted = new Map<string, CountedTag>();
  const perCarrier = new Map<string, { applies: Set<string>; disputes: Set<string>; selfApplied: boolean }>();

  for (const a of assertions) {
    // The viewer's own taggings count for the viewer, as `mine` does on profiles.
    if (!trust.predicate(a.asserter) && a.asserter !== viewerPubkey) continue;
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
      unverified: !scoredCreators.has(group.authorPubkey) && group.authorPubkey !== viewerPubkey,
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
      pubkey: toSet(deriveApplicabilityMembers({ usageRows, hintEls: pubkeyHints, context: "pubkey" })),
      event: toSet(deriveApplicabilityMembers({ usageRows, hintEls: eventHints, context: "event" })),
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
 *  - It does not advertise pubkey-hinted tags nobody has applied. The house's
 *    pubkey list includes `jumble-qa-profile-1784946392` and `test account`,
 *    so offering them puts harness output in front of users for the sake of
 *    one real unused tag (KIT-FEEDBACK.md §5). Nothing is lost: typing an
 *    existing tag's name still reuses it via `resolveOrMintTag`.
 *
 * Tags made for events are offered by their hint, though: the catalogue counts
 * people only, so a tag only ever put on notes (`stoicism`, `asknostr`) would
 * otherwise be missing from both pickers. A tag made on a note carries the
 * `tag-for-nostr-event` hint (`applyEventTagging`), so one small read of the
 * hinted tags finds them — 39 on the hub (2026-11-18) — without reading any
 * tagging. They come with no count and in the `content` band.
 *
 * Returns `unverified` entries too. The picker is BOTH surfaces at once — a
 * suggestion list before you type and a query after — so the list/query split
 * has to be made there, not here. `TagPersonButton` and `NoteTagChips` do it.
 */
export async function fetchPickerTags(viewerPubkey?: string, observer: TrustObserver = "house"): Promise<PickerTag[]> {
  const [catalogue, forEvents] = await Promise.all([fetchTagIndex(viewerPubkey, observer), fetchEventHintedTags()]);
  const applicability = await fetchApplicability(catalogue);

  // Content-only means the split says "notes" AND doesn't say "people".
  // A tag in both lists is applicable to both and belongs up top. No opinion
  // available → everything people carry stands as it is, in usage order.
  const banded: PickerTag[] = catalogue.map((t) => {
    const coord = tagCoordinate(t);
    const contentOnly = applicability.event.has(coord) && !applicability.pubkey.has(coord);
    return { ...t, band: contentOnly ? "content" : "profile" };
  });

  // The event-hinted tags nobody carries yet: for notes, and checked for a
  // scored creator as the catalogue's are.
  const carried = new Set(catalogue.map((t) => t.key));
  const unused = forEvents.filter((t) => !carried.has(`${t.authorPubkey}|${t.slug}`));
  const scored = await fetchScoredPubkeys(Array.from(new Set(unused.map((t) => t.authorPubkey))), observer);
  for (const t of unused) {
    banded.push({
      key: `${t.authorPubkey}|${t.slug}`,
      authorPubkey: t.authorPubkey,
      slug: t.slug,
      name: t.name,
      description: t.description,
      people: 0,
      vouches: 0,
      sharesName: 1,
      unverified: !scored.has(t.authorPubkey) && t.authorPubkey !== viewerPubkey,
      band: "content",
    });
  }
  const perName = new Map<string, number>();
  for (const t of banded) perName.set(normalizeTagName(t.name), (perName.get(normalizeTagName(t.name)) ?? 0) + 1);
  for (const t of banded) t.sharesName = perName.get(normalizeTagName(t.name)) ?? 1;

  return banded.sort(
    (a, b) =>
      (a.band === b.band ? 0 : a.band === "profile" ? -1 : 1) || b.people - a.people || a.name.localeCompare(b.name),
  );
}

/**
 * The tags made for events: those carrying the `tag-for-nostr-event` hint, the
 * newest of each, named from their own content. A failed read is none.
 */
async function fetchEventHintedTags(): Promise<
  Array<{ authorPubkey: string; slug: string; name: string; description?: string }>
> {
  let events: NostrEvent[];
  try {
    events = await fetchTagEvents(applicabilityHintFilter("event") as Record<string, unknown>);
  } catch {
    return [];
  }
  const newest = new Map<string, NostrEvent>();
  for (const ev of events) {
    const d = tagValue(ev, "d");
    if (!d) continue;
    const key = `${ev.pubkey}|${d}`;
    const prev = newest.get(key);
    if (!prev || ev.created_at > prev.created_at) newest.set(key, ev);
  }
  return Array.from(newest.entries()).map(([key, ev]) => {
    const slug = key.slice(key.indexOf("|") + 1);
    cacheElementMeta(ev.pubkey, slug, ev.content);
    const meta = elementMetaByCoord.get(key);
    return { authorPubkey: ev.pubkey, slug, name: meta?.name || slug, description: meta?.description };
  });
}
