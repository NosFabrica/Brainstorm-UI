/**
 * Inert relay reads for tests that mock `@/services/nostr`. Spread first, then
 * the functions the test cares about:
 *
 *   vi.mock("@/services/nostr", async () => ({
 *     ...(await import("@/test/fakeNostr")).nostrReadDefaults,
 *     fetchProfileMap: (pks: string[]) => profileMapMock(pks),
 *   }));
 *
 * A component that starts reading something new then finds an empty answer
 * instead of throwing "No export is defined on the mock".
 */
export const nostrReadDefaults = {
  fetchEventsByIds: async () => [],
  fetchEventsByFilter: async () => [],
  fetchEventsByAuthors: async () => [],
  fetchAddressableEvents: async () => new Map(),
  fetchRecentByKinds: async () => [],
  fetchLiveStreams: async () => [],
  fetchNotesByHashtag: async () => [],
  fetchProfile: async () => undefined,
  fetchProfileEvent: async () => undefined,
  fetchProfileMap: async () => new Map(),
  refreshProfileEvent: async () => null,
  fetchProfilePrefs: async () => null,
  fetchAlertPrefs: async () => null,
  fetchOutboxRelayList: async () => undefined,
  fetchTrustProviderList: async () => undefined,
  fetchReportsForPubkey: async () => [],
  getNip85RelayUrl: () => "wss://nip85.test",
};
