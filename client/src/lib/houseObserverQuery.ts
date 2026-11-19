import { resolveHouseObserver } from "@/services/trustSource";

/**
 * The house observer as a react-query query, shared by every component that asks for it.
 *
 * `resolveHouseObserver` answers null when it can't find the house, and react-query keeps a
 * null like any answer: with `staleTime: Infinity` that is the rest of the visit. A miss is an
 * error here instead, so the query retries and asks again on its next mount rather than
 * remembering it (trustSource paces the retries).
 */
export const houseObserverQuery = {
  queryKey: ["house-observer"],
  queryFn: async (): Promise<string> => {
    const pk = await resolveHouseObserver();
    if (!pk) throw new Error("the house observer couldn't be found");
    return pk;
  },
  staleTime: Infinity,
} as const;
