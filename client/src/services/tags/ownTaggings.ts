/** What the viewer has said: every tagging they have signed, about people and about events. */
import { conceptNostrUserTag } from "@/lib/tagging-sdk/profile-tagging.js";
import { classifyEventTaggings, conceptNostrEventTag } from "@/lib/tagging-sdk/event-tagging/index.js";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";
import { fetchAllTagEvents } from "./read";
import { resolveTagNames } from "./elements";
import { normalizeAssertions } from "./assertions";
import { resolveTaggingHeaders } from "./headers";
import { descriptorOf, latestByReplaceableKey, targetAddressOf, targetIdOf } from "./noteTags";
import { TAG_ELEMENT_KIND, type NostrEvent } from "./shared";

/** One claim the viewer has made, about a person or a note. */
export interface MyAssertion {
  /** `<tagAuthor>|<slug>` — the tag's identity. */
  key: string;
  authorPubkey: string;
  slug: string;
  name: string;
  /**
   * A person's pubkey; or, for an event, its id (a post) or its coordinate
   * `<kind>:<pubkey>:<d>` (an article, a repo, a list's item: lib/tagTarget).
   */
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
    const headers = await resolveTaggingHeaders(dedupedEvents.map(descriptorOf).filter((c): c is string => !!c));
    // Grouped per target because the classifier answers "what tags are on THIS
    // target"; we're asking the transpose, one target at a time.
    const byTarget = new Map<string, NostrEvent[]>();
    for (const ev of dedupedEvents) {
      // A post is named by its id; an article, a repo, a listing or a list's item by its
      // coordinate (#334). Reading the id alone left everything tagged by coordinate off
      // this list: on its own page, and missing from the page of what you have said.
      const target = targetIdOf(ev) ?? targetAddressOf(ev);
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
