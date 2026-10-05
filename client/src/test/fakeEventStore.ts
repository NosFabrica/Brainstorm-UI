import { NEVER, of } from "rxjs";

/**
 * The EventStore surface the hooks touch, empty. For tests that mock
 * `@/lib/eventStore` (the real one verifies signatures, which jsdom's realm
 * trips): spread first, override what the test seeds.
 *
 *   vi.mock("@/lib/eventStore", async () => ({
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
