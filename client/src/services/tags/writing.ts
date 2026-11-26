/** Writing tags: minting or reusing one by name, applying it to a person, and editing its description. */
import {
  applyProfileTagging,
  conceptNostrUserTag,
  type Polarity,
  type ApplyProfileTaggingResult,
} from "@/lib/tagging-sdk/profile-tagging.js";
import { buildTagElement, conceptTag, slug as toSlug } from "@/lib/tagging-sdk/event-tagging/index.js";
import { Z_HANDLE_PUBKEYS, TAG_FOR_NOSTR_PUBKEY_Z } from "@/config/tagging";
import { activeAccount, requireActiveAccount, signAs } from "@/accounts/signing";
import { editedTagElement } from "@/lib/tagEdit";
import { fetchTagEvents } from "./read";
import { publishTagEvent, readBack } from "./publish";
import { cacheElementMeta } from "./elements";
import { normalizeAssertions } from "./assertions";
import { TAG_ELEMENT_KIND, tagValue, type NostrEvent } from "./shared";

/**
 * Change what a tag means, as its creator: the description, never the name.
 *
 * The definition is addressable, so the edit is the creator's own definition
 * published again under the same `d` (lib/tagEdit): taggings point at the
 * coordinate and keep pointing at it. Only the creator has a definition to
 * publish again, which is the whole permission check: anyone else's edit would
 * be a different tag under their own key.
 *
 * A tagging that names the tag by event id alone (the shape from before the
 * `a` correction) pointed at the version this replaces; the hub's are test
 * output, and the `#a` half of every read is what counts the real ones.
 */
export async function editTagDescription(slug: string, description: string): Promise<{ description: string }> {
  const user = activeAccount();
  if (!user?.pubkey) throw new Error("Sign in to edit this tag.");

  const mine = (await fetchTagEvents({ kinds: [TAG_ELEMENT_KIND], authors: [user.pubkey], "#d": [slug] }))
    .filter((ev) => ev.pubkey === user.pubkey && tagValue(ev, "d") === slug)
    .sort((a, b) => b.created_at - a.created_at)[0];
  if (!mine) throw new Error("Only the person who created a tag can edit its description.");

  const template = editedTagElement(mine, description, Math.floor(Date.now() / 1000));
  const signed = await signAs(requireActiveAccount(), template as never);
  await publishTagEvent(signed as unknown as Record<string, unknown>);
  // Every surface that names the tag reads this cache before it asks a relay.
  cacheElementMeta(user.pubkey, slug, template.content);
  return { description: description.trim() };
}

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

  const candidates = existing.filter((ev) => tagValue(ev, "d") === slug).sort((a, b) => a.created_at - b.created_at); // oldest first = the tiebreak

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
  const score = (pubkey: string) => Array.from(usage.keys()).filter((k) => k.startsWith(`${pubkey}|`)).length;

  const best = [...candidates].sort((a, b) => score(b.pubkey) - score(a.pubkey) || a.created_at - b.created_at)[0];
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
}: ApplyTagArgs): Promise<ApplyProfileTaggingResult & { confirmed: boolean }> {
  const user = activeAccount();
  if (!user?.pubkey) throw new Error("Sign in to tag.");

  const result = await applyProfileTagging({
    tagInput: tag,
    targetPubkey,
    polarity,
    asserterPubkey: user.pubkey,
    zHandlePubkeys: Z_HANDLE_PUBKEYS,
    deps: {
      sign: (template: unknown) => signAs(requireActiveAccount(), template as never),
      publish: publishTagEvent,
      now: () => Math.floor(Date.now() / 1000),
      buildTagElement,
    },
  });
  // Read back from the relays: whether it is there, not only whether one said OK.
  return readBack(result);
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
