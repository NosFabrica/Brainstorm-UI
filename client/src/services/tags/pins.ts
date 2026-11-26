/** Pinning tags (OFF by default — see TAG_PINS_ENABLED): the viewer's pins, a pin, and an unpin. */
import { publishToRelays } from "@/services/nostr";
import { relayHintFor, tagWithHint } from "@/lib/relayRouting";
import { buildTagPin, conceptTagPinning, tagRefFromPin } from "@/lib/tagPins";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";
import { activeAccount, requireActiveAccount, signAs } from "@/accounts/signing";
import { fetchTagEvents } from "./read";
import { publishTagEvent } from "./publish";
import { resolveTagNames } from "./elements";
import { fetchCommentEvents } from "./comments";
import { TAG_ELEMENT_KIND, tagValue, type NostrEvent, type TagIdentity } from "./shared";

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
    fetchTagEvents({ kinds: [DELETION_KIND], authors: [viewerPubkey] }).catch(() => [] as NostrEvent[]),
    fetchCommentEvents({ kinds: [DELETION_KIND], authors: [viewerPubkey] }).catch(() => [] as NostrEvent[]),
  ]);
  const deletions = [...hubDeletions, ...generalDeletions];
  if (!pins.length) return [];

  const deleted = new Set(deletions.flatMap((d) => (d.tags || []).filter((t) => t[0] === "e").map((t) => t[1])));

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
  const user = activeAccount();
  if (!user?.pubkey) throw new Error("Sign in to pin.");

  const unsigned = {
    ...buildTagPin({
      slug,
      tagAuthorPubkey: authorPubkey,
      tagEventId,
      viewerPubkey: user.pubkey,
      taPubkeys: Z_HANDLE_PUBKEYS,
      // The pin's `e` and `a` both name the tag author's event.
      relayHint: relayHintFor(authorPubkey),
    }),
    pubkey: user.pubkey,
    created_at: Math.floor(Date.now() / 1000),
  };
  const signed = await signAs(requireActiveAccount(), unsigned as never);
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
  const user = activeAccount();
  if (!user?.pubkey) throw new Error("Sign in to unpin.");

  const unsigned = {
    kind: DELETION_KIND,
    pubkey: user.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    // The pin is the viewer's own event, so the hint is where they write.
    tags: [tagWithHint("e", pinEventId, relayHintFor(user.pubkey))],
    content: "",
  };
  const signed = await signAs(requireActiveAccount(), unsigned as never);
  // General relays, NOT publishTagEvent — the hub would reject this outright.
  const result = await publishToRelays(signed);
  if (!result.success) throw new Error(result.error || "No relay accepted the unpin");
}
