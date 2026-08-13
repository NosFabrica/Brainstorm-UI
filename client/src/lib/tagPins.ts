/**
 * Pinning a tag into your own curated set.
 *
 * ## Read this before touching it
 *
 * The protocol specifies pins (`core/protocol/tags.md` §Pins) and the kit
 * **forbids building them**: `core/INTEGRATION.md` §8, "Explicitly OUT of scope
 * for the core (do not build; do not preclude) — Tag pinning / Trusted-List
 * publication from the client". Brainstorm's `Start.md` never pulls it back in.
 *
 * We built it anyway, on Benjamin's explicit call (2026-08-06), and it ships
 * behind `TAG_PINS_ENABLED` defaulting to **off** so an acceptance run sees only
 * what the kit describes. See `docs/decentralized-tagging/DECISIONS.md` §8.
 *
 * Because the SDK ships no pin builder — it has the read half (`taggings.js`
 * `projectionFor` / `curateNotes`) and nothing for writes — this shape is the
 * only thing between us and a malformed permanent event. Hence: pure, here,
 * tested, and transcribed field by field from the spec rather than remembered.
 */

/** Tag-elements, taggings and pins are all kind-39999 DList items. */
const TAG_ELEMENT_KIND = 39999;

/**
 * The `tag-pinning` concept handle.
 *
 * **This is our reading, not a shipped constant.** `handles.js` composes `tag`,
 * `nostr-event-tag` and `tagging-with-specific-tag`; there is no `tag-pinning`
 * composer in the SDK. The spec names the handle in the same breath as those
 * three (`tags.md` §Sources and §Pins), so the same `39998:<ta>:<handle>` shape
 * is the obvious composition — but worksheet **W1, cross-deployment concept
 * identity**, is explicitly open on exactly this question. Filed upstream in
 * `KIT-FEEDBACK.md` §14; correct it the moment they answer.
 */
export function conceptTagPinning(taPubkey: string): string {
  return `39998:${taPubkey}:tag-pinning`;
}

/** The tag-element's stable address — survives the author's later edits. */
export function tagElementAddr(authorPubkey: string, slug: string): string {
  return `${TAG_ELEMENT_KIND}:${authorPubkey}:${slug}`;
}

/**
 * The pin's own deterministic address, so pinning twice replaces rather than
 * stacks — the same replaceability discipline as an assertion's `d`.
 */
export function pinDTag(slug: string, tagAuthorPubkey: string, viewerPubkey: string): string {
  return `tag-pin-${slug}-${tagAuthorPubkey.slice(0, 8)}-${viewerPubkey.slice(0, 8)}`;
}

/**
 * The pin's curation intent. The spec's worked example is
 * `{observer, method:"nip85:rank", cutoff:1, includeScoreInTL:true}` and says
 * "further method identifiers may be introduced by convention" — so this is a
 * documented default, not the only legal value.
 */
export interface CurationMethod {
  observer: string;
  method: string;
  cutoff: number;
  includeScoreInTL: boolean;
}

export function defaultCurationMethod(viewerPubkey: string): CurationMethod {
  return { observer: viewerPubkey, method: "nip85:rank", cutoff: 1, includeScoreInTL: true };
}

export interface UnsignedPin {
  kind: number;
  tags: string[][];
  content: string;
}

/**
 * Build the pin event.
 *
 * The **dual reference is deliberate** and the spec is explicit about why: `e`
 * pins the specific tag-element version seen at pin-time, `a` tracks the tag
 * through its author's later edits. Emitting only one of them loses half the
 * meaning, so both are required here rather than optional.
 *
 * `taPubkeys` are the concept namespaces to stamp — ours is
 * `[canonicalConceptPubkey, localTaPubkey]`, same as every other builder.
 */
export function buildTagPin({
  slug,
  tagAuthorPubkey,
  tagEventId,
  viewerPubkey,
  taPubkeys,
  curationMethod,
}: {
  slug: string;
  tagAuthorPubkey: string;
  tagEventId: string;
  viewerPubkey: string;
  taPubkeys: string[];
  curationMethod?: CurationMethod;
}): UnsignedPin {
  // Both pubkeys become permanent signed coordinates; a malformed one mints an
  // undiscoverable pin under the user's real key. Fail loud, as the SDK's own
  // builders do.
  requireHex64(tagAuthorPubkey, "tagAuthorPubkey");
  requireHex64(viewerPubkey, "viewerPubkey");
  requireHex64(tagEventId, "tagEventId");
  if (!slug) throw new Error("tag-pin: slug is required");
  if (!taPubkeys?.length) throw new Error("tag-pin: taPubkeys is required");

  const curation = curationMethod ?? defaultCurationMethod(viewerPubkey);
  const curationJson = JSON.stringify(curation);

  return {
    kind: TAG_ELEMENT_KIND,
    tags: [
      ["d", pinDTag(slug, tagAuthorPubkey, viewerPubkey)],
      ["e", tagEventId],
      ["a", tagElementAddr(tagAuthorPubkey, slug)],
      ...taPubkeys.map((ta) => ["z", conceptTagPinning(ta)]),
      ["curation-method", curationJson],
    ],
    // The content mirrors the key tags, as every other event in this family does.
    content: JSON.stringify({
      tagPinning: { tagEventId, curationMethod: curation },
    }),
  };
}

/**
 * Read a pin back into the tag it points at.
 *
 * Prefers `a` — the stable address — falling back to nothing rather than
 * guessing from `e`, because an event id alone doesn't name a tag without
 * another fetch. Returns null for anything that isn't a well-formed pin.
 */
export function tagRefFromPin(ev: {
  tags?: string[][];
}): { authorPubkey: string; slug: string } | null {
  const a = (ev.tags || []).find((t) => t[0] === "a")?.[1];
  const m = a && /^39999:([0-9a-f]{64}):(.+)$/.exec(a);
  return m ? { authorPubkey: m[1], slug: m[2] } : null;
}

function requireHex64(value: string, name: string): void {
  if (!/^[0-9a-f]{64}$/.test(value || "")) {
    throw new Error(`tag-pin: ${name} must be a 64-char lowercase hex string (got: ${value})`);
  }
}
