import { NEVER, of } from "rxjs";

/**
 * The EventStore surface the hooks touch, empty. For tests that mock
 * `@/lib/eventStore` (the real one verifies signatures, which jsdom's realm
 * trips): spread first, override what the test seeds.
 *
 *   vi.mock("@/lib/eventStore", async () => ({
  // lib/eventStore's verified-deletion seam (useStoreEvents reads it): nothing deleted here.
  isDeleted: () => false,
  deletions$: { subscribe: () => ({ unsubscribe: () => {} }) },
 *     eventStore: {
 *       ...(await import("@/test/fakeEventStore")).eventStoreDefaults,
 *       getReplaceable: (_k: number, pk: string) => known.get(pk),
 *     },
 *   }));
 */
export const eventStoreDefaults = {
  add: <T>(event: T) => event,
  getEvent: () => undefined,
  getReplaceable: () => undefined,
  getByFilters: () => [],
  getTimeline: () => [],
  timeline: () => of([]),
  insert$: NEVER,
  remove$: NEVER,
};
