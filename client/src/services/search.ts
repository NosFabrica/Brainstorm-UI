/**
 * Relay-backed search — the seam between the search UI and the
 * SearchOverTrust relay (NIP-50, extended grammar).
 *
 * Verified against the staging relay (2026-09-02, read-only probes):
 * - The RELAY parses the whole grammar (`from:` `since:` `sort:` `observer:`
 *   `include:spam` …) — the query text passes through verbatim; this module
 *   appends `observer:` and nothing else. The UI never string-builds syntax.
 * - Frames are plain NIP-01 `["EVENT", subid, event]` — rank is expressed as
 *   ORDER, never as numbers. `SearchHit.rank` stays null until a separate
 *   score fetch fills it (same per-author pattern as the hashtag page).
 * - A read with no lens (no `observer:`, no `include:spam`) is refused with
 *   `auth-required:` — so every query we send carries a lens.
 * - Kind-less REQs work: the All tab is one REQ with no
 *   `kinds`, in the relay's own order. Top, the default, composes sections
 *   of chosen kinds instead (components/search/ComposedResults).
 * - `sort:rank`/best-match flush near EOSE (~4s); `sort:recent` streams.
 */
export {
  TAB_KINDS,
  TAB_LABELS,
  tabLabel,
  askMintReviewsOnly,
  isKindlessTab,
  kindsForTab,
  bandKindsForTab,
  tagsForTab,
  type SearchTab,
} from "./search/tabs";
export {
  HOUSE_POV,
  type SearchHit,
  type SearchSnapshot,
  type SearchHandle,
  type SearchPov,
  type SearchGroup,
  type SearchParams,
  type Members,
} from "./search/types";
export { narrowToMembers, isMember, kind0ToSearchResult, NO_PERSPECTIVE } from "./search/query";
export { DEFAULT_LIMIT, FRAME_FALLBACK_MS, __resetSearchGroups, searchStream } from "./search/stream";
export { countTabs, countCategories, type CategoryAsk } from "./search/counts";
export {
  zapStoreUrl,
  fetchReleaseAsset,
  fetchReleases,
  appAddress,
  fetchAppReviews,
  bolt11Msats,
  parseZapReceipt,
  fetchAppZaps,
  fetchAppsByAddress,
  fetchNoteEngagement,
  fetchAppEndorsementCounts,
  fetchPersonVouches,
  fetchVouchReplies,
  fetchPersonSets,
  fetchRepoActivity,
  fetchRepoCounts,
  fetchSpecsForKind,
  fetchNipPage,
  fetchSimilarApps,
  fetchSimilarListings,
  fetchCommentsByAddress,
  fetchGitStatuses,
  fetchGitCommentCounts,
  fetchRepoForks,
  fetchRepoByAddress,
  fetchEventRsvps,
  fetchGoalProgress,
  fetchFromSearch,
  fetchByAddress,
  type AppRelease,
  type ReleaseAsset,
  type AppReview,
  type ZapReceipt,
  type AppZap,
  type PersonVouch,
  type VouchReply,
  type PersonSetMembership,
  type RepoCounts,
  type EventRsvps,
  type GoalProgress,
} from "./search/sideAsks";
export { searchListItems, type ListAsk, type ListAnswer } from "./search/lists";
export { suggestProfiles, suggestProfileHits, suggestListings } from "./search/suggest";
