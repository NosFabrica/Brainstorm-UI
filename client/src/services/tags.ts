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
export type { NostrEvent, TagIdentity } from "./tags/shared";
export { publishTagEvent, publishToOutbox, __confirmWait } from "./tags/publish";
export type { TrustObserver } from "./tags/trust";
export { resetTagCaches } from "./tags/caches";
export { fetchProfileTags, fetchProfileTagsBatch, type ProfileTag, type ProfileTagsResult } from "./tags/profileTags";
export { fetchTagDetail, type TagCarrier, type TagDetailStatus, type TagDetail } from "./tags/tagDetail";
export {
  fetchTagIndex,
  fetchApplicability,
  tagCoordinate,
  fetchPickerTags,
  type TagSummary,
  type Applicability,
  type PickerTag,
} from "./tags/catalogue";
export { fetchTagComments, publishTagComment, type TagComment } from "./tags/comments";
export {
  editTagDescription,
  resolveOrMintTag,
  applyTagToProfile,
  predictedTagKey,
  TAG_FOR_NOSTR_PUBKEY_Z,
  type ApplyTagArgs,
} from "./tags/writing";
export { fetchPinnedTags, pinTag, unpinTag, type PinnedTag } from "./tags/pins";
export { fetchMyAssertions, type MyAssertion } from "./tags/ownTaggings";
export {
  fetchEventTagsBatch,
  fetchEventTags,
  fetchTagNotes,
  applyTagToEvent,
  hash8,
  type NoteTag,
  type NoteTagsResult,
  type TaggedNote,
} from "./tags/noteTags";
